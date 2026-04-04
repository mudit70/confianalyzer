"""SQLAlchemy framework plugin — detects DB operations and produces enrichments."""

from __future__ import annotations

import ast
from typing import Any

# Map method names to (operation, table-from-arg?)
_SESSION_OPS: dict[str, tuple[str, bool]] = {
    "query": ("read", True),
    "add": ("write", True),
    "add_all": ("write", False),
    "delete": ("delete", True),
    "execute": ("read", False),
    "commit": ("transaction", False),
    "rollback": ("transaction", False),
    "flush": ("transaction", False),
}


class SQLAlchemyPlugin:
    """Detect SQLAlchemy session/db calls and produce enrichments."""

    def detect_imports(self, imports: list[dict]) -> bool:
        for imp in imports:
            mp = imp.get("modulePath", "")
            if mp.startswith("sqlalchemy") or mp.startswith("flask_sqlalchemy"):
                return True
        return False

    def enrich_function(
        self,
        func_ir: dict,
        func_node: ast.FunctionDef | ast.AsyncFunctionDef,
    ) -> None:
        pass  # SQLAlchemy enrichments go on calls, not functions

    def enrich_call(self, call_ir: dict, call_node: ast.Call) -> None:
        method = call_ir.get("method")
        if method is None:
            return

        method_lower = method.lower()
        if method_lower not in _SESSION_OPS:
            return

        operation, has_table_arg = _SESSION_OPS[method_lower]
        table = _extract_table(call_node) if has_table_arg else None

        call_ir.setdefault("enrichments", []).append({
            "pluginName": "sqlalchemy",
            "route": None,
            "dbOperation": {
                "table": table or "unknown",
                "operation": operation,
            },
            "httpCall": None,
            "renders": None,
            "middlewareOrder": None,
            "suggestedCategory": "DB_CALL",
        })


def _extract_table(call_node: ast.Call) -> str | None:
    """Try to extract a model/table name from the first argument."""
    if call_node.args:
        first = call_node.args[0]
        if isinstance(first, ast.Name):
            return first.id
        if isinstance(first, ast.Attribute):
            return first.attr
    return None
