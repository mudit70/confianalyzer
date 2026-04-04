"""FastAPI framework plugin — detects route decorators and produces enrichments."""

from __future__ import annotations

import ast
from typing import Any

_HTTP_METHODS = {"get", "post", "put", "delete", "patch", "head", "options", "trace"}


class FastAPIPlugin:
    """Detect FastAPI route decorators on functions."""

    def detect_imports(self, imports: list[dict]) -> bool:
        for imp in imports:
            if imp.get("modulePath", "").startswith("fastapi"):
                return True
        return False

    def enrich_function(
        self,
        func_ir: dict,
        func_node: ast.FunctionDef | ast.AsyncFunctionDef,
    ) -> None:
        for dec in func_node.decorator_list:
            info = self._parse_decorator(dec)
            if info:
                method, path = info
                func_ir["endpointInfo"] = {"method": method, "path": path}
                func_ir.setdefault("enrichments", []).append(
                    _enrichment(method, path)
                )
                return  # first match wins

    def enrich_call(self, call_ir: dict, call_node: ast.Call) -> None:
        pass  # FastAPI plugin only cares about decorators

    # ------------------------------------------------------------------

    @staticmethod
    def _parse_decorator(dec: ast.expr) -> tuple[str, str] | None:
        """Parse @app.get("/path") or @router.post("/path") or @app.api_route(...)."""
        if not isinstance(dec, ast.Call):
            return None
        func = dec.func
        if not isinstance(func, ast.Attribute):
            return None

        attr = func.attr.lower()

        # @app.api_route("/path", methods=["GET"])
        if attr == "api_route":
            path = _first_string_arg(dec)
            method = "GET"
            for kw in dec.keywords:
                if kw.arg == "methods" and isinstance(kw.value, (ast.List, ast.Tuple)):
                    for elt in kw.value.elts:
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                            method = elt.value.upper()
                            break
            if path is not None:
                return method, path

        if attr in _HTTP_METHODS:
            path = _first_string_arg(dec)
            if path is not None:
                return attr.upper(), path

        return None


def _first_string_arg(call: ast.Call) -> str | None:
    for arg in call.args:
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            return arg.value
    return None


def _enrichment(method: str, path: str) -> dict[str, Any]:
    return {
        "pluginName": "fastapi",
        "route": {"method": method, "path": path},
        "dbOperation": None,
        "httpCall": None,
        "renders": None,
        "middlewareOrder": None,
        "suggestedCategory": "API_ENDPOINT",
    }
