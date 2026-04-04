"""Config file parsing for .confianalyzer.yaml."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConfiAnalyzerConfig:
    include: list[str] = field(default_factory=list)
    exclude: list[str] = field(default_factory=list)
    plugins: list[str] = field(default_factory=list)
    options: dict[str, Any] = field(default_factory=dict)


_DEFAULT_EXCLUDE = [
    "**/__tests__/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/node_modules/**",
    "**/.venv/**",
    "**/dist/**",
    "**/build/**",
]


def load_config(repo_root: str, config_path: str | None = None) -> ConfiAnalyzerConfig:
    """Load config from a YAML file.

    Falls back to .confianalyzer.yaml in repo_root if config_path is None.
    Returns defaults if no config file is found.
    """
    resolved = config_path or os.path.join(repo_root, ".confianalyzer.yaml")

    if not os.path.isfile(resolved):
        return ConfiAnalyzerConfig(exclude=list(_DEFAULT_EXCLUDE))

    with open(resolved, "r", encoding="utf-8") as f:
        content = f.read()

    return parse_yaml(content)


def parse_yaml(content: str) -> ConfiAnalyzerConfig:
    """Minimal YAML parser for the .confianalyzer.yaml format.

    Supports top-level keys with string list values and a nested options map.
    """
    config = ConfiAnalyzerConfig()
    lines = content.split("\n")
    current_key: str | None = None
    in_options = False
    options_key: str | None = None

    for raw_line in lines:
        line = raw_line.rstrip("\r")

        # Skip comments and blank lines
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            continue

        # Top-level key (no leading whitespace)
        if not line[0].isspace() and ":" in line:
            key, _, rest = line.partition(":")
            key = key.strip()
            rest = rest.strip()

            if key == "options":
                in_options = True
                current_key = None
                options_key = None
                continue

            in_options = False
            options_key = None
            current_key = key
            continue

        # Inside options block - nested key
        if in_options:
            stripped_line = line.lstrip()
            indent = len(line) - len(stripped_line)
            if indent >= 2 and ":" in stripped_line and not stripped_line.startswith("-"):
                key, _, rest = stripped_line.partition(":")
                key = key.strip()
                rest = rest.strip()
                # Remove surrounding quotes
                rest = rest.strip("\"'")
                if rest and not rest.startswith("#"):
                    config.options[key] = rest
                    options_key = None
                else:
                    options_key = key
                    config.options[key] = []
                continue

            # List item inside options
            if stripped_line.startswith("- ") and options_key is not None:
                value = stripped_line[2:].strip().strip("\"'")
                opt_list = config.options[options_key]
                if isinstance(opt_list, list):
                    opt_list.append(value)
                continue
            continue

        # List item for top-level key
        if stripped.startswith("- ") and current_key is not None:
            value = stripped[2:].strip().strip("\"'")
            if current_key == "include":
                config.include.append(value)
            elif current_key == "exclude":
                config.exclude.append(value)
            elif current_key == "plugins":
                config.plugins.append(value)

    return config
