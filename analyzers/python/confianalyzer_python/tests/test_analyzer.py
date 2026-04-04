"""Tests for the Python analyzer."""

from __future__ import annotations

import json
import os
import textwrap
from pathlib import Path

import pytest

from confianalyzer_python.analyzer import analyze_repository
from confianalyzer_python.ast_walker import FileWalker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_repo(tmp_path: Path, files: dict[str, str]) -> str:
    """Create a temporary repo with given files and return its path."""
    for name, content in files.items():
        p = tmp_path / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(textwrap.dedent(content))
    return str(tmp_path)


def _walk_source(source: str, file_path: str = "test.py", repo_root: str = "/repo") -> dict:
    """Convenience wrapper around FileWalker for tests."""
    walker = FileWalker(textwrap.dedent(source), file_path, repo_root)
    return walker.walk()


# ---------------------------------------------------------------------------
# 1. Basic function extraction
# ---------------------------------------------------------------------------

class TestFunctionExtraction:
    def test_simple_function(self):
        data = _walk_source("""
            def greet(name: str, loud: bool = False) -> str:
                pass
        """)
        funcs = data["functions"]
        assert len(funcs) == 1
        f = funcs[0]
        assert f["kind"] == "function"
        assert f["name"] == "greet"
        assert f["qualifiedName"] is None
        assert f["isAsync"] is False
        assert f["isExported"] is True
        assert f["returnType"] == "str"
        # parameters
        params = f["parameters"]
        assert len(params) == 2
        assert params[0]["name"] == "name"
        assert params[0]["typeAnnotation"] == "str"
        assert params[0]["hasDefault"] is False
        assert params[1]["name"] == "loud"
        assert params[1]["hasDefault"] is True

    def test_async_function(self):
        data = _walk_source("""
            async def fetch(url: str) -> bytes:
                pass
        """)
        f = data["functions"][0]
        assert f["isAsync"] is True
        assert f["name"] == "fetch"

    def test_private_function_not_exported(self):
        data = _walk_source("""
            def _helper():
                pass
        """)
        assert data["functions"][0]["isExported"] is False
        assert len(data["exports"]) == 0

    def test_args_kwargs(self):
        data = _walk_source("""
            def variadic(*args, **kwargs):
                pass
        """)
        params = data["functions"][0]["parameters"]
        assert any(p["name"] == "*args" and p["isRest"] for p in params)
        assert any(p["name"] == "**kwargs" and p["isRest"] for p in params)


# ---------------------------------------------------------------------------
# 2. Class extraction
# ---------------------------------------------------------------------------

class TestClassExtraction:
    def test_basic_class(self):
        data = _walk_source("""
            class Animal:
                def speak(self):
                    pass
                def _internal(self):
                    pass
        """)
        classes = data["classes"]
        assert len(classes) == 1
        c = classes[0]
        assert c["kind"] == "class"
        assert c["name"] == "Animal"
        assert c["superClass"] is None
        assert c["isExported"] is True
        assert c["isAbstract"] is False
        assert "speak" in c["methods"]
        assert "_internal" in c["methods"]

    def test_inheritance(self):
        data = _walk_source("""
            class Dog(Animal):
                pass
        """)
        assert data["classes"][0]["superClass"] == "Animal"

    def test_abstract_class(self):
        data = _walk_source("""
            from abc import ABC, abstractmethod
            class Base(ABC):
                @abstractmethod
                def do_thing(self):
                    pass
        """)
        assert data["classes"][0]["isAbstract"] is True

    def test_method_qualified_name(self):
        data = _walk_source("""
            class Foo:
                def bar(self):
                    pass
                @staticmethod
                def baz():
                    pass
        """)
        funcs = {f["name"]: f for f in data["functions"]}
        assert funcs["bar"]["qualifiedName"] == "Foo.bar"
        assert funcs["bar"].get("isStatic") is False
        assert funcs["baz"]["isStatic"] is True


# ---------------------------------------------------------------------------
# 3. Import extraction
# ---------------------------------------------------------------------------

class TestImportExtraction:
    def test_import_module(self):
        data = _walk_source("import os\n")
        imps = data["imports"]
        assert len(imps) == 1
        assert imps[0]["modulePath"] == "os"
        assert imps[0]["namespaceImport"] == "os"
        assert imps[0]["isExternal"] is True

    def test_import_alias(self):
        data = _walk_source("import numpy as np\n")
        assert data["imports"][0]["namespaceImport"] == "np"

    def test_from_import(self):
        data = _walk_source("from os.path import join, exists\n")
        imp = data["imports"][0]
        assert imp["modulePath"] == "os.path"
        assert len(imp["symbols"]) == 2
        assert imp["symbols"][0]["name"] == "join"
        assert imp["symbols"][0]["alias"] is None

    def test_from_import_alias(self):
        data = _walk_source("from collections import OrderedDict as OD\n")
        sym = data["imports"][0]["symbols"][0]
        assert sym["name"] == "OrderedDict"
        assert sym["alias"] == "OD"

    def test_relative_import(self):
        data = _walk_source("from . import sibling\n")
        imp = data["imports"][0]
        assert imp["modulePath"] == "."
        assert imp["isExternal"] is False

    def test_relative_import_module(self):
        data = _walk_source("from ..utils import helper\n")
        imp = data["imports"][0]
        assert imp["modulePath"] == "..utils"
        assert imp["isExternal"] is False


# ---------------------------------------------------------------------------
# 4. Call extraction with stringArgs
# ---------------------------------------------------------------------------

class TestCallExtraction:
    def test_simple_call(self):
        data = _walk_source("""
            def main():
                print("hello", "world")
        """)
        calls = [c for c in data["calls"] if c["callee"] == "print"]
        assert len(calls) == 1
        c = calls[0]
        assert c["receiver"] is None
        assert c["method"] is None
        assert c["argumentCount"] == 2
        assert c["stringArgs"] == ["hello", "world"]
        assert c["enclosingFunction"] == "main"

    def test_method_call(self):
        data = _walk_source("""
            def go():
                response.json()
        """)
        calls = [c for c in data["calls"] if c["method"] == "json"]
        assert len(calls) == 1
        c = calls[0]
        assert c["receiver"] == "response"
        assert c["callee"] == "response.json"

    def test_argument_refs(self):
        data = _walk_source("""
            def go():
                process(data, config)
        """)
        calls = [c for c in data["calls"] if c["callee"] == "process"]
        assert calls[0]["argumentRefs"] == ["data", "config"]

    def test_keyword_string_args(self):
        data = _walk_source("""
            def go():
                connect(host="localhost", port=5432)
        """)
        calls = [c for c in data["calls"] if c["callee"] == "connect"]
        assert "localhost" in calls[0]["stringArgs"]


# ---------------------------------------------------------------------------
# 5. FastAPI route detection
# ---------------------------------------------------------------------------

class TestFastAPIPlugin:
    def test_get_route(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "main.py": """
                from fastapi import FastAPI
                app = FastAPI()

                @app.get("/items/{item_id}")
                async def read_item(item_id: int):
                    return {"id": item_id}
            """,
        })
        ir = analyze_repository(repo, "test-repo")
        file_ir = ir["files"][0]
        func = [f for f in file_ir["functions"] if f["name"] == "read_item"][0]
        assert func["endpointInfo"] == {"method": "GET", "path": "/items/{item_id}"}
        assert func["enrichments"][0]["pluginName"] == "fastapi"
        assert func["enrichments"][0]["suggestedCategory"] == "API_ENDPOINT"

    def test_post_route(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "main.py": """
                from fastapi import APIRouter
                router = APIRouter()

                @router.post("/items")
                def create_item(data: dict):
                    pass
            """,
        })
        ir = analyze_repository(repo, "test-repo")
        func = [f for f in ir["files"][0]["functions"] if f["name"] == "create_item"][0]
        assert func["endpointInfo"]["method"] == "POST"
        assert func["endpointInfo"]["path"] == "/items"


# ---------------------------------------------------------------------------
# 6. Flask route detection
# ---------------------------------------------------------------------------

class TestFlaskPlugin:
    def test_flask_route(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "app.py": """
                from flask import Flask
                app = Flask(__name__)

                @app.route("/hello", methods=["GET"])
                def hello():
                    return "Hello!"
            """,
        })
        ir = analyze_repository(repo, "test-repo")
        func = [f for f in ir["files"][0]["functions"] if f["name"] == "hello"][0]
        assert func["endpointInfo"] == {"method": "GET", "path": "/hello"}
        assert func["enrichments"][0]["pluginName"] == "flask"

    def test_flask_shorthand(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "app.py": """
                from flask import Flask
                app = Flask(__name__)

                @app.post("/submit")
                def submit():
                    pass
            """,
        })
        ir = analyze_repository(repo, "test-repo")
        func = [f for f in ir["files"][0]["functions"] if f["name"] == "submit"][0]
        assert func["endpointInfo"]["method"] == "POST"


# ---------------------------------------------------------------------------
# 7. Export synthesis
# ---------------------------------------------------------------------------

class TestExportSynthesis:
    def test_convention_based_exports(self):
        data = _walk_source("""
            def public_func():
                pass

            def _private_func():
                pass

            class MyClass:
                pass

            class _Internal:
                pass
        """)
        export_names = {e["name"] for e in data["exports"]}
        assert "public_func" in export_names
        assert "MyClass" in export_names
        assert "_private_func" not in export_names
        assert "_Internal" not in export_names

    def test_all_overrides_convention(self):
        data = _walk_source("""
            __all__ = ["specific_func"]

            def specific_func():
                pass

            def public_but_not_exported():
                pass
        """)
        export_names = {e["name"] for e in data["exports"]}
        assert export_names == {"specific_func"}


# ---------------------------------------------------------------------------
# 8. Full IR document structure
# ---------------------------------------------------------------------------

class TestFullIR:
    def test_ir_document_structure(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "hello.py": """
                def greet(name: str) -> str:
                    return f"Hello, {name}"
            """,
        })
        ir = analyze_repository(repo, "my-repo")
        assert ir["$schema"] == "confianalyzer-ir-v1"
        assert ir["version"] == "1.0.0"
        assert ir["analyzer"]["name"] == "confianalyzer-python"
        assert ir["analyzer"]["language"] == "python"
        assert ir["repository"]["name"] == "my-repo"
        assert len(ir["files"]) == 1

        f = ir["files"][0]
        assert f["language"] == "python"
        assert f["relativePath"] == "hello.py"
        assert len(f["hash"]) == 64  # SHA-256 hex
        assert f["size"] > 0
        assert len(f["functions"]) == 1

    def test_json_serializable(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "app.py": """
                import os
                from pathlib import Path

                class Config:
                    DEBUG = True

                def get_config() -> Config:
                    return Config()
            """,
        })
        ir = analyze_repository(repo, "test")
        # Must be JSON-serializable
        output = json.dumps(ir)
        assert isinstance(json.loads(output), dict)


# ---------------------------------------------------------------------------
# 9. SQLAlchemy plugin
# ---------------------------------------------------------------------------

class TestSQLAlchemyPlugin:
    def test_session_query(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "db.py": """
                from sqlalchemy.orm import Session

                def get_users(session: Session):
                    return session.query(User).all()
            """,
        })
        ir = analyze_repository(repo, "test-repo")
        calls = ir["files"][0]["calls"]
        query_calls = [c for c in calls if c.get("method") == "query"]
        assert len(query_calls) == 1
        enrichments = query_calls[0].get("enrichments", [])
        assert len(enrichments) == 1
        assert enrichments[0]["pluginName"] == "sqlalchemy"
        assert enrichments[0]["dbOperation"]["operation"] == "read"
        assert enrichments[0]["dbOperation"]["table"] == "User"

    def test_session_add(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "db.py": """
                from sqlalchemy.orm import Session

                def save_user(session: Session, user):
                    session.add(user)
                    session.commit()
            """,
        })
        ir = analyze_repository(repo, "test-repo")
        calls = ir["files"][0]["calls"]
        add_calls = [c for c in calls if c.get("method") == "add"]
        assert len(add_calls) == 1
        assert add_calls[0]["enrichments"][0]["dbOperation"]["operation"] == "write"


# ---------------------------------------------------------------------------
# 10. Incremental analysis
# ---------------------------------------------------------------------------

class TestIncrementalAnalysis:
    def test_reuses_unchanged_files(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "stable.py": """
                def stable_func() -> str:
                    return "stable"
            """,
            "changing.py": """
                def changing_func() -> int:
                    return 1
            """,
        })

        # Initial analysis
        initial_ir = analyze_repository(repo, "incr-repo")
        prev_ir_path = str(tmp_path / "previous-ir.json")
        with open(prev_ir_path, "w") as f:
            json.dump(initial_ir, f)

        # Incremental with no changes -- should reuse all
        ir = analyze_repository(repo, "incr-repo", incremental_path=prev_ir_path)
        assert len(ir["files"]) == 2
        stable = [f for f in ir["files"] if f["relativePath"] == "stable.py"][0]
        assert len(stable["functions"]) == 1
        assert stable["functions"][0]["name"] == "stable_func"

    def test_reanalyzes_changed_files(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "stable.py": """
                def stable_func() -> str:
                    return "stable"
            """,
            "changing.py": """
                def changing_func() -> int:
                    return 1
            """,
        })

        # Initial analysis
        initial_ir = analyze_repository(repo, "incr-repo")
        prev_ir_path = str(tmp_path / "previous-ir.json")
        with open(prev_ir_path, "w") as f:
            json.dump(initial_ir, f)

        # Modify one file
        (tmp_path / "changing.py").write_text(textwrap.dedent("""
            def changing_func() -> int:
                return 42

            def new_func() -> None:
                pass
        """))

        ir = analyze_repository(repo, "incr-repo", incremental_path=prev_ir_path)
        assert len(ir["files"]) == 2

        changing = [f for f in ir["files"] if f["relativePath"] == "changing.py"][0]
        func_names = {f["name"] for f in changing["functions"]}
        assert "new_func" in func_names
        assert "changing_func" in func_names

    def test_omits_deleted_files(self, tmp_path):
        repo = _make_repo(tmp_path, {
            "stable.py": """
                def stable_func() -> str:
                    return "stable"
            """,
            "to_delete.py": """
                def doomed() -> None:
                    pass
            """,
        })

        # Initial analysis
        initial_ir = analyze_repository(repo, "incr-repo")
        prev_ir_path = str(tmp_path / "previous-ir.json")
        with open(prev_ir_path, "w") as f:
            json.dump(initial_ir, f)

        # Delete the file
        (tmp_path / "to_delete.py").unlink()

        ir = analyze_repository(repo, "incr-repo", incremental_path=prev_ir_path)
        assert len(ir["files"]) == 1
        assert ir["files"][0]["relativePath"] == "stable.py"
