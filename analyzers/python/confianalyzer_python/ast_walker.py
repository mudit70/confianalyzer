"""Core AST walker: extracts functions, calls, imports, exports, classes from a single file."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _loc(node: ast.AST) -> dict:
    """Build a SourceLocation dict from an AST node."""
    return {
        "startLine": getattr(node, "lineno", 0),
        "endLine": getattr(node, "end_lineno", 0) or getattr(node, "lineno", 0),
        "startColumn": getattr(node, "col_offset", 0),
        "endColumn": getattr(node, "end_col_offset", 0) or getattr(node, "col_offset", 0),
    }


def _annotation_to_str(node: ast.AST | None) -> str | None:
    """Convert an annotation AST node to a readable string."""
    if node is None:
        return None
    return ast.unparse(node)


def _is_public(name: str) -> bool:
    return not name.startswith("_")


def _accessibility(name: str) -> str:
    if name.startswith("__") and not name.endswith("__"):
        return "private"
    if name.startswith("_"):
        return "private"
    return "public"


def _has_decorator(node: ast.FunctionDef | ast.AsyncFunctionDef, name: str) -> bool:
    for dec in node.decorator_list:
        if isinstance(dec, ast.Name) and dec.id == name:
            return True
        if isinstance(dec, ast.Attribute) and dec.attr == name:
            return True
    return False


def _reconstruct_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """Reconstruct a human-readable signature string."""
    prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
    params = ast.unparse(node.args) if node.args else ""
    ret = ""
    if node.returns:
        ret = f" -> {ast.unparse(node.returns)}"
    return f"{prefix} {node.name}({params}){ret}"


def _extract_parameters(args_node: ast.arguments) -> list[dict]:
    """Extract ParameterIR list from function arguments."""
    params: list[dict] = []

    # Compute how many positional args have defaults
    num_pos = len(args_node.posonlyargs) + len(args_node.args)
    num_defaults = len(args_node.defaults)
    # defaults are right-aligned to args
    default_offset = num_pos - num_defaults

    all_positional = args_node.posonlyargs + args_node.args
    for i, arg in enumerate(all_positional):
        has_default = i >= default_offset
        params.append({
            "name": arg.arg,
            "typeAnnotation": _annotation_to_str(arg.annotation),
            "hasDefault": has_default,
            "isRest": False,
        })

    if args_node.vararg:
        params.append({
            "name": f"*{args_node.vararg.arg}",
            "typeAnnotation": _annotation_to_str(args_node.vararg.annotation),
            "hasDefault": False,
            "isRest": True,
        })

    for i, arg in enumerate(args_node.kwonlyargs):
        has_default = args_node.kw_defaults[i] is not None
        params.append({
            "name": arg.arg,
            "typeAnnotation": _annotation_to_str(arg.annotation),
            "hasDefault": has_default,
            "isRest": False,
        })

    if args_node.kwarg:
        params.append({
            "name": f"**{args_node.kwarg.arg}",
            "typeAnnotation": _annotation_to_str(args_node.kwarg.annotation),
            "hasDefault": False,
            "isRest": True,
        })

    return params


# ---------------------------------------------------------------------------
# Call extraction helpers
# ---------------------------------------------------------------------------

def _extract_string_args(call_node: ast.Call) -> list[str]:
    """Collect all string literal arguments from a call."""
    result: list[str] = []
    for arg in call_node.args:
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            result.append(arg.value)
    for kw in call_node.keywords:
        if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
            result.append(kw.value.value)
    return result


def _extract_argument_refs(call_node: ast.Call) -> list[str]:
    refs: list[str] = []
    for arg in call_node.args:
        if isinstance(arg, ast.Name):
            refs.append(arg.id)
    return refs


# ---------------------------------------------------------------------------
# Main walker class
# ---------------------------------------------------------------------------

class FileWalker(ast.NodeVisitor):
    """Walk one parsed Python file and collect IR data."""

    def __init__(self, source: str, file_path: str, repo_root: str) -> None:
        self.source = source
        self.file_path = file_path
        self.repo_root = repo_root

        self.functions: list[dict] = []
        self.calls: list[dict] = []
        self.imports: list[dict] = []
        self.classes: list[dict] = []

        self._all_names: list[str] | None = None  # set if __all__ found
        self._current_function: str | None = None
        self._current_class: str | None = None

    # ---- public ----------------------------------------------------------

    def walk(self) -> dict:
        """Parse and walk the file, returning collected IR sections."""
        tree = ast.parse(self.source, filename=self.file_path)

        # Check for __all__
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "__all__":
                        if isinstance(node.value, (ast.List, ast.Tuple)):
                            self._all_names = [
                                elt.value
                                for elt in node.value.elts
                                if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                            ]

        self.visit(tree)

        exports = self._synthesize_exports()

        return {
            "functions": self.functions,
            "calls": self.calls,
            "imports": self.imports,
            "exports": exports,
            "classes": self.classes,
        }

    # ---- visitors --------------------------------------------------------

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._handle_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._handle_function(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        # Determine superclass
        super_class = None
        if node.bases:
            super_class = ast.unparse(node.bases[0])

        is_abstract = False
        for base in node.bases:
            base_str = ast.unparse(base)
            if base_str in ("ABC", "abc.ABC", "ABCMeta"):
                is_abstract = True
                break
        if not is_abstract:
            for child in ast.walk(node):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if _has_decorator(child, "abstractmethod"):
                        is_abstract = True
                        break

        methods: list[str] = []
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                methods.append(child.name)

        class_ir: dict[str, Any] = {
            "kind": "class",
            "name": node.name,
            "superClass": super_class,
            "implements": [],
            "isExported": _is_public(node.name),
            "isAbstract": is_abstract,
            "methods": methods,
            "location": _loc(node),
        }
        self.classes.append(class_ir)

        # Walk methods inside class
        old_class = self._current_class
        self._current_class = node.name
        self.generic_visit(node)
        self._current_class = old_class

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.imports.append({
                "kind": "import",
                "modulePath": alias.name,
                "resolvedPath": None,
                "isExternal": True,
                "symbols": [],
                "defaultImport": None,
                "namespaceImport": alias.asname or alias.name,
                "location": _loc(node),
            })

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        level = node.level or 0
        dots = "." * level

        module_path = f"{dots}{module}" if dots else module
        is_external = level == 0

        resolved = None
        if level > 0:
            resolved = self._resolve_relative_import(module, level)

        symbols = []
        if node.names:
            for alias in node.names:
                if alias.name == "*":
                    continue
                symbols.append({
                    "name": alias.name,
                    "alias": alias.asname,
                })

        self.imports.append({
            "kind": "import",
            "modulePath": module_path,
            "resolvedPath": resolved,
            "isExternal": is_external,
            "symbols": symbols,
            "defaultImport": None,
            "namespaceImport": None,
            "location": _loc(node),
        })

    def visit_Call(self, node: ast.Call) -> None:
        callee = ""
        receiver = None
        method = None

        if isinstance(node.func, ast.Attribute):
            method = node.func.attr
            receiver = ast.unparse(node.func.value)
            callee = f"{receiver}.{method}"
        elif isinstance(node.func, ast.Name):
            callee = node.func.id
        else:
            callee = ast.unparse(node.func)

        call_ir: dict[str, Any] = {
            "kind": "call",
            "callee": callee,
            "receiver": receiver,
            "method": method,
            "argumentCount": len(node.args) + len(node.keywords),
            "argumentRefs": _extract_argument_refs(node),
            "stringArgs": _extract_string_args(node),
            "enclosingFunction": self._current_function,
            "location": _loc(node),
        }
        self.calls.append(call_ir)

        # Continue visiting child nodes (nested calls, etc.)
        self.generic_visit(node)

    # ---- helpers ---------------------------------------------------------

    def _handle_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        is_method = self._current_class is not None
        qualified_name = f"{self._current_class}.{node.name}" if is_method else None

        params = _extract_parameters(node.args)
        return_type = _annotation_to_str(node.returns)

        func_ir: dict[str, Any] = {
            "kind": "function",
            "name": node.name,
            "qualifiedName": qualified_name,
            "signature": _reconstruct_signature(node),
            "parameters": params,
            "returnType": return_type,
            "isExported": _is_public(node.name),
            "isAsync": isinstance(node, ast.AsyncFunctionDef),
            "location": _loc(node),
        }

        if is_method:
            func_ir["isStatic"] = _has_decorator(node, "staticmethod")
            func_ir["accessibility"] = _accessibility(node.name)

        self.functions.append(func_ir)

        # Walk function body for calls
        old_func = self._current_function
        self._current_function = qualified_name or node.name
        # Visit children but don't re-visit nested function defs through _handle_function
        for child in ast.iter_child_nodes(node):
            self.visit(child)
        self._current_function = old_func

    def _resolve_relative_import(self, module: str | None, level: int) -> str | None:
        """Try to resolve a relative import to an absolute file path."""
        try:
            file_dir = Path(self.file_path).parent
            base = file_dir
            for _ in range(level - 1):
                base = base.parent

            if module:
                parts = module.split(".")
                candidate = base / "/".join(parts)
                # Try as package or module
                if (candidate / "__init__.py").exists():
                    return str(candidate / "__init__.py")
                py_file = candidate.with_suffix(".py")
                if py_file.exists():
                    return str(py_file)
            return None
        except Exception:
            return None

    def _synthesize_exports(self) -> list[dict]:
        """Synthesize export entries from top-level public names or __all__."""
        exports: list[dict] = []

        if self._all_names is not None:
            # Build a location map
            name_locs: dict[str, dict] = {}
            for fn in self.functions:
                if fn["qualifiedName"] is None:  # top-level
                    name_locs[fn["name"]] = fn["location"]
            for cls in self.classes:
                name_locs[cls["name"]] = cls["location"]

            for name in self._all_names:
                loc = name_locs.get(name, {"startLine": 0, "endLine": 0, "startColumn": 0, "endColumn": 0})
                exports.append({
                    "kind": "export",
                    "name": name,
                    "localName": name,
                    "isDefault": False,
                    "fromModule": None,
                    "location": loc,
                })
        else:
            # Convention: export all public top-level functions and classes
            for fn in self.functions:
                if fn["qualifiedName"] is None and _is_public(fn["name"]):
                    exports.append({
                        "kind": "export",
                        "name": fn["name"],
                        "localName": fn["name"],
                        "isDefault": False,
                        "fromModule": None,
                        "location": fn["location"],
                    })
            for cls in self.classes:
                if _is_public(cls["name"]):
                    exports.append({
                        "kind": "export",
                        "name": cls["name"],
                        "localName": cls["name"],
                        "isDefault": False,
                        "fromModule": None,
                        "location": cls["location"],
                    })

        return exports
