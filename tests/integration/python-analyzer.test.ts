import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../fixtures/backend");
const PYTHON_VENV = path.resolve(import.meta.dirname, "../../analyzers/python/.venv/bin/python");
const PYTHON_ANALYZER_DIR = path.resolve(import.meta.dirname, "../../analyzers/python");
const OUTPUT_PATH = path.join(os.tmpdir(), `backend-ir-${Date.now()}.json`);

interface IrDocument {
  $schema: string;
  version: string;
  analyzer: { name: string; version: string; language: string };
  repository: { name: string; rootPath: string };
  files: Array<{
    path: string;
    relativePath: string;
    language: string;
    functions: Array<{
      name: string;
      isAsync: boolean;
      isExported: boolean;
      endpointInfo?: { method: string; path: string } | null;
      enrichments?: Array<{
        pluginName: string;
        route?: { method: string; path: string } | null;
        suggestedCategory?: string | null;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    }>;
    calls: Array<{
      callee: string;
      enclosingFunction: string | null;
      [key: string]: unknown;
    }>;
    imports: Array<{
      modulePath: string;
      symbols: Array<{ name: string; alias: string | null }>;
      [key: string]: unknown;
    }>;
    exports: Array<{
      name: string;
      isDefault: boolean;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
}

describe("Python Analyzer — Backend Fixture", () => {
  let ir: IrDocument;

  beforeAll(() => {
    // Determine which python binary to use
    const pythonBin = fs.existsSync(PYTHON_VENV) ? PYTHON_VENV : "python3";

    execFileSync(pythonBin, ["-m", "confianalyzer_python", "--repo", FIXTURES_DIR, "--repo-name", "backend", "--output", OUTPUT_PATH], {
      timeout: 30_000,
      env: { ...process.env, PYTHONPATH: PYTHON_ANALYZER_DIR },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
    ir = JSON.parse(raw);
  });

  it("produces valid IR with correct schema", () => {
    expect(ir.$schema).toBe("confianalyzer-ir-v1");
    expect(ir.analyzer.language).toBe("python");
    expect(ir.repository.name).toBe("backend");
  });

  it("discovers Python files from app/", () => {
    expect(ir.files.length).toBeGreaterThanOrEqual(4);
    const paths = ir.files.map((f) => f.relativePath);
    expect(paths).toContain("app/routes/users.py");
    expect(paths).toContain("app/services/user_service.py");
    expect(paths).toContain("app/models/user.py");
    expect(paths).toContain("app/main.py");
  });

  it("parses list_users as async function with GET endpoint", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    expect(routesFile).toBeDefined();

    const listUsers = routesFile.functions.find((f) => f.name === "list_users");
    expect(listUsers).toBeDefined();
    expect(listUsers!.isAsync).toBe(true);
    expect(listUsers!.endpointInfo).toBeDefined();
    expect(listUsers!.endpointInfo!.method).toBe("GET");
    expect(listUsers!.endpointInfo!.path).toBe("/users");
  });

  it("parses add_user as async function with POST endpoint", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    const addUser = routesFile.functions.find((f) => f.name === "add_user");
    expect(addUser).toBeDefined();
    expect(addUser!.isAsync).toBe(true);
    expect(addUser!.endpointInfo).toBeDefined();
    expect(addUser!.endpointInfo!.method).toBe("POST");
    expect(addUser!.endpointInfo!.path).toBe("/users");
  });

  it("parses get_user with parameterized path", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    const getUser = routesFile.functions.find((f) => f.name === "get_user");
    expect(getUser).toBeDefined();
    expect(getUser!.endpointInfo).toBeDefined();
    expect(getUser!.endpointInfo!.method).toBe("GET");
    expect(getUser!.endpointInfo!.path).toBe("/users/{user_id}");
  });

  it("has FastAPI enrichment on route handlers", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    const listUsers = routesFile.functions.find((f) => f.name === "list_users");
    expect(listUsers!.enrichments).toBeDefined();

    const fastApiEnrichment = listUsers!.enrichments!.find((e) => e.pluginName === "fastapi");
    expect(fastApiEnrichment).toBeDefined();
    expect(fastApiEnrichment!.route).toEqual({ method: "GET", path: "/users" });
    expect(fastApiEnrichment!.suggestedCategory).toBe("API_ENDPOINT");
  });

  it("detects get_all_users call within list_users", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    const getAllUsersCall = routesFile.calls.find(
      (c) => c.callee === "get_all_users" && c.enclosingFunction === "list_users"
    );
    expect(getAllUsersCall).toBeDefined();
  });

  it("detects create_user call within add_user", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    const createUserCall = routesFile.calls.find(
      (c) => c.callee === "create_user" && c.enclosingFunction === "add_user"
    );
    expect(createUserCall).toBeDefined();
  });

  it("exports service functions from user_service.py", () => {
    const serviceFile = ir.files.find((f) => f.relativePath === "app/services/user_service.py")!;
    expect(serviceFile).toBeDefined();

    const exportNames = serviceFile.exports.map((e) => e.name);
    expect(exportNames).toContain("get_all_users");
    expect(exportNames).toContain("create_user");
    expect(exportNames).toContain("get_user_by_id");
  });

  it("detects imports in routes/users.py", () => {
    const routesFile = ir.files.find((f) => f.relativePath === "app/routes/users.py")!;
    const serviceImport = routesFile.imports.find((i) => i.modulePath === "app.services.user_service");
    expect(serviceImport).toBeDefined();
    const importedNames = serviceImport!.symbols.map((s) => s.name);
    expect(importedNames).toContain("get_all_users");
    expect(importedNames).toContain("create_user");
    expect(importedNames).toContain("get_user_by_id");
  });
});
