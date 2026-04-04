"""CLI entry point for the Python analyzer."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import traceback

from confianalyzer_python.analyzer import analyze_repository
from confianalyzer_python.config import load_config

logger = logging.getLogger("confianalyzer_python")


def _progress(event: str, **data: object) -> None:
    """Emit a JSON Lines progress event to stdout."""
    obj = {"event": event, **data}
    print(json.dumps(obj), flush=True)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="confianalyzer-python",
        description="Analyze a Python repository and produce confianalyzer-ir-v1 JSON.",
    )
    parser.add_argument("--repo", required=True, help="Path to the repository root")
    parser.add_argument("--repo-name", required=True, help="Logical repository name")
    parser.add_argument("--output", required=True, help="Output path for the IR JSON file")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--incremental", default=None, help="Path to previous IR JSON for incremental analysis")
    parser.add_argument("--config", default=None, help="Path to .confianalyzer.yaml config file")

    args = parser.parse_args(argv)

    # Configure stderr logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(log_level)

    try:
        _progress("start", repo=args.repo, repoName=args.repo_name)

        config = load_config(args.repo, args.config)

        ir_doc = analyze_repository(
            repo_path=args.repo,
            repo_name=args.repo_name,
            verbose=args.verbose,
            incremental_path=args.incremental,
            config=config,
        )

        with open(args.output, "w", encoding="utf-8") as fp:
            json.dump(ir_doc, fp, indent=2)

        file_count = len(ir_doc.get("files", []))
        _progress("complete", files=file_count, output=args.output)
        logger.info("Analysis complete — %d files written to %s", file_count, args.output)
        sys.exit(0)

    except Exception:
        logger.error("Analysis failed:\n%s", traceback.format_exc())
        _progress("error", message=traceback.format_exc())
        sys.exit(2)
