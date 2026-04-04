"""Framework plugin registry for the Python analyzer."""

from __future__ import annotations

import ast
from typing import Protocol

from confianalyzer_python.framework_plugins.fastapi import FastAPIPlugin
from confianalyzer_python.framework_plugins.flask import FlaskPlugin
from confianalyzer_python.framework_plugins.sqlalchemy import SQLAlchemyPlugin


class FrameworkPlugin(Protocol):
    """Protocol that all framework plugins implement."""

    def detect_imports(self, imports: list[dict]) -> bool:
        """Return True if this plugin's framework is imported in the file."""
        ...

    def enrich_function(self, func_ir: dict, func_node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        """Mutate func_ir with endpointInfo / enrichments if applicable."""
        ...

    def enrich_call(self, call_ir: dict, call_node: ast.Call) -> None:
        """Mutate call_ir with enrichments if applicable."""
        ...


# Ordered list of all registered plugins
ALL_PLUGINS: list[FrameworkPlugin] = [
    FastAPIPlugin(),
    FlaskPlugin(),
    SQLAlchemyPlugin(),
]


def get_active_plugins(imports: list[dict]) -> list[FrameworkPlugin]:
    """Return plugins whose framework is detected among the file's imports."""
    return [p for p in ALL_PLUGINS if p.detect_imports(imports)]


# Map plugin names to plugin instances for config-based filtering
_PLUGIN_BY_NAME: dict[str, FrameworkPlugin] = {
    "fastapi": FastAPIPlugin(),
    "flask": FlaskPlugin(),
    "sqlalchemy": SQLAlchemyPlugin(),
}


def get_plugins_by_name(names: list[str], imports: list[dict]) -> list[FrameworkPlugin]:
    """Return plugins matching the given names that also detect their imports."""
    result: list[FrameworkPlugin] = []
    for name in names:
        plugin = _PLUGIN_BY_NAME.get(name.lower())
        if plugin is not None and plugin.detect_imports(imports):
            result.append(plugin)
    return result
