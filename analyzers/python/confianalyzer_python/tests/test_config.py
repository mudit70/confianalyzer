"""Tests for config file parsing and filtering."""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import pytest

from confianalyzer_python.config import parse_yaml, load_config, ConfiAnalyzerConfig
from confianalyzer_python.analyzer import analyze_repository


class TestParseYaml:
    def test_full_config(self):
        yaml = textwrap.dedent("""\
            include:
              - "src/**"
              - "lib/**"

            exclude:
              - "**/__tests__/**"
              - "**/*.test.*"

            plugins:
              - fastapi
              - sqlalchemy

            options:
              tsconfig: "tsconfig.build.json"
              import_roots:
                - "app"
                - "lib"
        """)
        config = parse_yaml(yaml)
        assert config.include == ["src/**", "lib/**"]
        assert config.exclude == ["**/__tests__/**", "**/*.test.*"]
        assert config.plugins == ["fastapi", "sqlalchemy"]
        assert config.options["tsconfig"] == "tsconfig.build.json"
        assert config.options["import_roots"] == ["app", "lib"]

    def test_empty_config(self):
        config = parse_yaml("")
        assert config.include == []
        assert config.exclude == []
        assert config.plugins == []
        assert config.options == {}

    def test_comments_and_blanks(self):
        yaml = textwrap.dedent("""\
            # Comment
            include:
              - "src/**"

              # Another comment
            exclude:
              - "**/dist/**"
        """)
        config = parse_yaml(yaml)
        assert config.include == ["src/**"]
        assert config.exclude == ["**/dist/**"]


class TestLoadConfig:
    def test_missing_file_returns_defaults(self):
        config = load_config("/nonexistent/path")
        assert config.include == []
        assert len(config.exclude) > 0
        assert config.plugins == []

    def test_load_from_repo_root(self, tmp_path: Path):
        (tmp_path / ".confianalyzer.yaml").write_text(
            "include:\n  - \"src/**\"\nplugins:\n  - fastapi\n"
        )
        config = load_config(str(tmp_path))
        assert config.include == ["src/**"]
        assert config.plugins == ["fastapi"]

    def test_load_from_explicit_path(self, tmp_path: Path):
        cfg_file = tmp_path / "custom.yaml"
        cfg_file.write_text("plugins:\n  - flask\n")
        config = load_config("/some/repo", str(cfg_file))
        assert config.plugins == ["flask"]


class TestConfigFiltering:
    def _make_repo(self, tmp_path: Path, files: dict[str, str]) -> str:
        for name, content in files.items():
            p = tmp_path / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(textwrap.dedent(content))
        return str(tmp_path)

    def test_include_only(self, tmp_path: Path):
        repo = self._make_repo(tmp_path, {
            "src/app.py": "def app(): pass\n",
            "lib/utils.py": "def util(): pass\n",
            "scripts/build.py": "def build(): pass\n",
        })
        config = ConfiAnalyzerConfig(include=["src/*"])
        ir = analyze_repository(repo, "test-repo", config=config)
        paths = [f["relativePath"] for f in ir["files"]]
        assert paths == ["src/app.py"]

    def test_exclude_only(self, tmp_path: Path):
        repo = self._make_repo(tmp_path, {
            "src/app.py": "def app(): pass\n",
            "scripts/build.py": "def build(): pass\n",
        })
        config = ConfiAnalyzerConfig(exclude=["scripts/*"])
        ir = analyze_repository(repo, "test-repo", config=config)
        paths = [f["relativePath"] for f in ir["files"]]
        assert "src/app.py" in paths
        assert "scripts/build.py" not in paths

    def test_include_and_exclude(self, tmp_path: Path):
        repo = self._make_repo(tmp_path, {
            "src/app.py": "def app(): pass\n",
            "src/internal.py": "def internal(): pass\n",
            "lib/utils.py": "def util(): pass\n",
        })
        config = ConfiAnalyzerConfig(
            include=["src/*", "lib/*"],
            exclude=["src/internal.py"],
        )
        ir = analyze_repository(repo, "test-repo", config=config)
        paths = sorted(f["relativePath"] for f in ir["files"])
        assert paths == ["lib/utils.py", "src/app.py"]
