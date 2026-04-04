import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../fixtures/frontend");
const ANALYZER_CLI = path.resolve(import.meta.dirname, "../../analyzers/js-ts/dist/cli.js");
const OUTPUT_PATH = path.join(os.tmpdir(), `frontend-ir-${Date.now()}.json`);

interface IrDocument {
  $schema: string;
  version: string;
  analyzer: { name: string; version: string; language: string };
  repository: { name: string; rootPath: string };
  files: Array<{
    path: string;
    relativePath: string;
    language: string;
    size: number;
    hash: string;
    functions: Array<{
      kind: string;
      name: string;
      isAsync: boolean;
      isExported: boolean;
      enrichments?: Array<{
        pluginName: string;
        renders: string[] | null;
        httpCall: { method: string; urlPattern: string } | null;
      }>;
      [key: string]: unknown;
    }>;
    calls: Array<{
      kind: string;
      callee: string;
      receiver: string | null;
      method: string | null;
      stringArgs?: string[];
      enclosingFunction: string | null;
      enrichments?: Array<{
        pluginName: string;
        httpCall: { method: string; urlPattern: string } | null;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    }>;
    imports: Array<{
      modulePath: string;
      resolvedPath: string | null;
      isExternal: boolean;
      symbols: Array<{ name: string; alias: string | null }>;
      defaultImport: string | null;
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

describe("TS Analyzer — Frontend Fixture", () => {
  let ir: IrDocument;

  beforeAll(() => {
    // Run the TS analyzer CLI
    execFileSync("node", [ANALYZER_CLI, "--repo", FIXTURES_DIR, "--repo-name", "frontend", "--output", OUTPUT_PATH], {
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
    ir = JSON.parse(raw);
  });

  it("produces valid IR with correct schema", () => {
    expect(ir.$schema).toBe("confianalyzer-ir-v1");
    expect(ir.analyzer.language).toBe("typescript");
    expect(ir.repository.name).toBe("frontend");
  });

  it("discovers all 4 source files", () => {
    expect(ir.files).toHaveLength(4);
    const relativePaths = ir.files.map((f) => f.relativePath).sort();
    expect(relativePaths).toEqual([
      "src/api/client.ts",
      "src/api/users.ts",
      "src/components/UserCard.tsx",
      "src/pages/UsersPage.tsx",
    ]);
  });

  it("parses fetchUsers as async exported function", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    expect(usersFile).toBeDefined();

    const fetchUsers = usersFile.functions.find((f) => f.name === "fetchUsers");
    expect(fetchUsers).toBeDefined();
    expect(fetchUsers!.isAsync).toBe(true);
    expect(fetchUsers!.isExported).toBe(true);
  });

  it("parses createUser as async exported function", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    const createUser = usersFile.functions.find((f) => f.name === "createUser");
    expect(createUser).toBeDefined();
    expect(createUser!.isAsync).toBe(true);
    expect(createUser!.isExported).toBe(true);
  });

  it("detects apiClient.get call with /api/users string arg", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    const getCall = usersFile.calls.find(
      (c) => c.receiver === "apiClient" && c.method === "get"
    );
    expect(getCall).toBeDefined();
    expect(getCall!.stringArgs).toContain("/api/users");
  });

  it("detects apiClient.post call with /api/users string arg", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    const postCall = usersFile.calls.find(
      (c) => c.receiver === "apiClient" && c.method === "post"
    );
    expect(postCall).toBeDefined();
    expect(postCall!.stringArgs).toContain("/api/users");
  });

  it("detects axios httpCall enrichment on the GET call", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    const getCall = usersFile.calls.find(
      (c) => c.receiver === "apiClient" && c.method === "get"
    );
    expect(getCall).toBeDefined();
    const axiosEnrichment = getCall!.enrichments?.find((e) => e.pluginName === "axios");
    expect(axiosEnrichment).toBeDefined();
    expect(axiosEnrichment!.httpCall).toEqual({ method: "GET", urlPattern: "/api/users" });
  });

  it("detects axios httpCall enrichment on the POST call", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    const postCall = usersFile.calls.find(
      (c) => c.receiver === "apiClient" && c.method === "post"
    );
    expect(postCall).toBeDefined();
    const axiosEnrichment = postCall!.enrichments?.find((e) => e.pluginName === "axios");
    expect(axiosEnrichment).toBeDefined();
    expect(axiosEnrichment!.httpCall).toEqual({ method: "POST", urlPattern: "/api/users" });
  });

  it("detects UsersPage renders UserCard via React enrichment", () => {
    const usersPageFile = ir.files.find((f) => f.relativePath === "src/pages/UsersPage.tsx")!;
    const usersPage = usersPageFile.functions.find((f) => f.name === "UsersPage");
    expect(usersPage).toBeDefined();

    const reactEnrichment = usersPage!.enrichments?.find((e) => e.pluginName === "react");
    expect(reactEnrichment).toBeDefined();
    expect(reactEnrichment!.renders).toContain("UserCard");
  });

  it("resolves import paths for local modules", () => {
    const usersPageFile = ir.files.find((f) => f.relativePath === "src/pages/UsersPage.tsx")!;

    const usersImport = usersPageFile.imports.find((i) => i.modulePath === "../api/users");
    expect(usersImport).toBeDefined();
    expect(usersImport!.isExternal).toBe(false);
    expect(usersImport!.symbols.some((s) => s.name === "fetchUsers")).toBe(true);

    const userCardImport = usersPageFile.imports.find((i) => i.modulePath === "../components/UserCard");
    expect(userCardImport).toBeDefined();
    expect(userCardImport!.isExternal).toBe(false);
    expect(userCardImport!.defaultImport).toBe("UserCard");
  });

  it("marks external imports correctly", () => {
    const usersPageFile = ir.files.find((f) => f.relativePath === "src/pages/UsersPage.tsx")!;
    const reactImport = usersPageFile.imports.find((i) => i.modulePath === "react");
    expect(reactImport).toBeDefined();
    expect(reactImport!.isExternal).toBe(true);
  });

  it("exports are correctly detected", () => {
    const usersFile = ir.files.find((f) => f.relativePath === "src/api/users.ts")!;
    const fetchUsersExport = usersFile.exports.find((e) => e.name === "fetchUsers");
    expect(fetchUsersExport).toBeDefined();
    expect(fetchUsersExport!.isDefault).toBe(false);

    const clientFile = ir.files.find((f) => f.relativePath === "src/api/client.ts")!;
    const defaultExport = clientFile.exports.find((e) => e.isDefault);
    expect(defaultExport).toBeDefined();
  });
});
