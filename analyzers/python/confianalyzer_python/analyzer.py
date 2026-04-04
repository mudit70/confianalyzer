"""Main analyzer — walks all Python files in a repo and produces a full IR document."""

from __future__ import annotations

import ast
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fnmatch import fnmatch

from confianalyzer_python import __version__
from confianalyzer_python.ast_walker import FileWalker
from confianalyzer_python.config import ConfiAnalyzerConfig
from confianalyzer_python.framework_plugins import get_active_plugins, get_plugins_by_name

logger = logging.getLogger("confianalyzer_python")

_EXCLUDE_DIRS = {
    "__pycache__", ".venv", "venv", ".tox", ".eggs",
    "dist", "build", "node_modules", ".git", ".mypy_cache",
    ".pytest_cache", "egg-info",
}


def _should_skip_dir(name: str) -> bool:
    if name in _EXCLUDE_DIRS:
        return True
    if name.endswith(".egg-info"):
        return True
    return False


def _is_test_file(path: str) -> bool:
    base = os.path.basename(path)
    return base.startswith("test_") or base.endswith("_test.py") or base == "conftest.py"


def _matches_any_pattern(rel_path: str, patterns: list[str]) -> bool:
    """Check if a relative path matches any of the glob patterns."""
    for pattern in patterns:
        if fnmatch(rel_path, pattern):
            return True
    return False


def _discover_files(
    repo_path: str,
    config: ConfiAnalyzerConfig | None = None,
) -> list[str]:
    """Discover all .py files excluding unwanted directories and test files."""
    has_include = config is not None and len(config.include) > 0
    has_exclude = config is not None and len(config.exclude) > 0

    result: list[str] = []
    for root, dirs, files in os.walk(repo_path):
        # Prune excluded directories in-place
        dirs[:] = [d for d in dirs if not _should_skip_dir(d)]
        for f in files:
            if f.endswith(".py") and not _is_test_file(f):
                full_path = os.path.join(root, f)

                # Apply config-based include/exclude
                if has_include or has_exclude:
                    rel_path = os.path.relpath(full_path, repo_path)
                    if has_include and not _matches_any_pattern(rel_path, config.include):  # type: ignore[union-attr]
                        continue
                    if has_exclude and _matches_any_pattern(rel_path, config.exclude):  # type: ignore[union-attr]
                        continue

                result.append(full_path)
    result.sort()
    return result


def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def analyze_repository(
    repo_path: str,
    repo_name: str,
    verbose: bool = False,
    incremental_path: str | None = None,
    config: ConfiAnalyzerConfig | None = None,
) -> dict:
    """Analyze a Python repository and return the IR document dict."""
    repo_path = os.path.abspath(repo_path)
    py_files = _discover_files(repo_path, config)
    logger.info("Discovered %d Python files in %s", len(py_files), repo_path)

    # Load previous IR for incremental analysis
    previous_hashes: dict[str, str] | None = None
    previous_files: dict[str, dict] | None = None

    if incremental_path:
        try:
            with open(incremental_path, "r", encoding="utf-8") as fp:
                prev_doc = json.load(fp)
            previous_hashes = {f["relativePath"]: f["hash"] for f in prev_doc["files"]}
            previous_files = {f["relativePath"]: f for f in prev_doc["files"]}
            logger.info(
                "Loaded previous IR with %d files for incremental analysis",
                len(prev_doc["files"]),
            )
        except Exception as exc:
            logger.warning("Could not load previous IR from %s: %s", incremental_path, exc)

    files_ir: list[dict] = []

    for file_path in py_files:
        try:
            raw = open(file_path, "rb").read()
            source = raw.decode("utf-8", errors="replace")
        except Exception as exc:
            logger.warning("Skipping %s: %s", file_path, exc)
            continue

        rel_path = os.path.relpath(file_path, repo_path)
        file_hash = _file_hash(raw)

        # Incremental: reuse previous entry if hash matches
        if (
            previous_hashes is not None
            and previous_files is not None
            and previous_hashes.get(rel_path) == file_hash
        ):
            logger.debug("Reusing cached analysis for %s", rel_path)
            files_ir.append(previous_files[rel_path])
            continue

        logger.debug("Analyzing %s", rel_path)

        try:
            walker = FileWalker(source, file_path, repo_path)
            data = walker.walk()
        except SyntaxError as exc:
            logger.warning("Syntax error in %s: %s", rel_path, exc)
            continue

        # Apply framework plugins
        if config and config.plugins:
            plugins = get_plugins_by_name(config.plugins, data["imports"])
        else:
            plugins = get_active_plugins(data["imports"])
        if plugins:
            tree = ast.parse(source, filename=file_path)
            _apply_plugins(tree, data, plugins)

        file_ir: dict[str, Any] = {
            "path": file_path,
            "relativePath": rel_path,
            "language": "python",
            "size": len(raw),
            "hash": file_hash,
            "functions": data["functions"],
            "calls": data["calls"],
            "imports": data["imports"],
            "exports": data["exports"],
            "classes": data["classes"],
        }
        files_ir.append(file_ir)

    ir_doc: dict[str, Any] = {
        "$schema": "confianalyzer-ir-v1",
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "analyzer": {
            "name": "confianalyzer-python",
            "version": __version__,
            "language": "python",
        },
        "repository": {
            "name": repo_name,
            "rootPath": repo_path,
        },
        "files": files_ir,
    }

    return ir_doc


def _apply_plugins(
    tree: ast.Module,
    data: dict,
    plugins: list,
) -> None:
    """Walk the AST again to apply framework-specific enrichments."""
    # Build a name->ir lookup for functions
    func_map: dict[str, dict] = {}
    for f in data["functions"]:
        func_map[f["name"]] = f

    # Build a location-keyed lookup for calls using a 4-tuple to avoid
    # collisions (e.g. `session.query(User).all()` has two Call nodes
    # starting at the same position but with different end positions).
    call_map: dict[tuple[int, int, int, int], dict] = {}
    for c in data["calls"]:
        loc = c["location"]
        key = (loc["startLine"], loc["startColumn"], loc["endLine"], loc["endColumn"])
        call_map[key] = c

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            ir = func_map.get(node.name)
            if ir is not None:
                for plugin in plugins:
                    plugin.enrich_function(ir, node)

        if isinstance(node, ast.Call):
            key = (
                getattr(node, "lineno", 0),
                getattr(node, "col_offset", 0),
                getattr(node, "end_lineno", 0) or getattr(node, "lineno", 0),
                getattr(node, "end_col_offset", 0) or getattr(node, "col_offset", 0),
            )
            ir = call_map.get(key)
            if ir is not None:
                for plugin in plugins:
                    plugin.enrich_call(ir, node)
