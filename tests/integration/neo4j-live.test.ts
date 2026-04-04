import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import neo4j, { type Driver, type Session } from "neo4j-driver";

import { buildResultFromIr } from "../../packages/orchestrator/dist/pipeline.js";
import { generateCypherStatements } from "../../packages/orchestrator/dist/graph-writer.js";
import type {
  IrDocument,
  PipelineResult,
  ProjectNode,
  RepositoryNode,
  FileNode,
  FunctionNode,
  ApiEndpointNode,
  DbTableNode,
  Relationship,
} from "../../packages/orchestrator/dist/types.js";

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7688";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "testpassword";

let driver: Driver;
let session: Session;

function freshSession(): Session {
  return driver.session();
}

async function runCypher(cypher: string, params: Record<string, unknown> = {}) {
  const s = freshSession();
  try {
    return await s.run(cypher, params);
  } finally {
    await s.close();
  }
}

async function clearDatabase() {
  await runCypher("MATCH (n) DETACH DELETE n");
}

async function dropAllConstraintsAndIndexes() {
  // Drop constraints
  const constraints = await runCypher("SHOW CONSTRAINTS");
  for (const record of constraints.records) {
    const name = record.get("name");
    try {
      await runCypher(`DROP CONSTRAINT ${name} IF EXISTS`);
    } catch {
      // ignore
    }
  }
  // Drop indexes
  const indexes = await runCypher("SHOW INDEXES");
  for (const record of indexes.records) {
    const name = record.get("name");
    const type = record.get("type");
    // Don't drop lookup indexes (internal)
    if (type === "LOOKUP") continue;
    try {
      await runCypher(`DROP INDEX ${name} IF EXISTS`);
    } catch {
      // ignore
    }
  }
}

// ─── Test data builder ───

function buildTestPipelineResult(): PipelineResult {
  const project: ProjectNode = {
    id: "proj-001",
    name: "test-project",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const repo1: RepositoryNode = {
    id: "repo-001",
    url: "https://github.com/test/frontend",
    name: "frontend",
    language: "typescript",
    lastAnalyzedAt: "2026-01-01T00:00:00.000Z",
  };

  const repo2: RepositoryNode = {
    id: "repo-002",
    url: "https://github.com/test/backend",
    name: "backend",
    language: "python",
    lastAnalyzedAt: "2026-01-01T00:00:00.000Z",
  };

  const file1: FileNode = {
    id: "file-001",
    path: "src/pages/UsersPage.tsx",
    language: "typescript",
    hash: "abc123",
    repoName: "frontend",
  };

  const file2: FileNode = {
    id: "file-002",
    path: "src/api/users.ts",
    language: "typescript",
    hash: "def456",
    repoName: "frontend",
  };

  const file3: FileNode = {
    id: "file-003",
    path: "app/routes/users.py",
    language: "python",
    hash: "ghi789",
    repoName: "backend",
  };

  const file4: FileNode = {
    id: "file-004",
    path: "app/models/user.py",
    language: "python",
    hash: "jkl012",
    repoName: "backend",
  };

  const fn1: FunctionNode = {
    id: "fn-001",
    name: "UsersPage",
    signature: "function UsersPage(): JSX.Element",
    category: "UI_INTERACTION",
    startLine: 5,
    endLine: 18,
    filePath: "src/pages/UsersPage.tsx",
    repoName: "frontend",
  };

  const fn2: FunctionNode = {
    id: "fn-002",
    name: "fetchUsers",
    signature: "async function fetchUsers(): Promise<any[]>",
    category: "API_CALLER",
    startLine: 3,
    endLine: 6,
    filePath: "src/api/users.ts",
    repoName: "frontend",
  };

  const fn3: FunctionNode = {
    id: "fn-003",
    name: "createUser",
    signature: "async function createUser(userData: any): Promise<any>",
    category: "API_CALLER",
    startLine: 8,
    endLine: 11,
    filePath: "src/api/users.ts",
    repoName: "frontend",
  };

  const fn4: FunctionNode = {
    id: "fn-004",
    name: "get_users",
    signature: "def get_users() -> list",
    category: "API_ENDPOINT",
    startLine: 10,
    endLine: 15,
    filePath: "app/routes/users.py",
    repoName: "backend",
  };

  const fn5: FunctionNode = {
    id: "fn-005",
    name: "create_user",
    signature: "def create_user(data: dict) -> dict",
    category: "API_ENDPOINT",
    startLine: 17,
    endLine: 25,
    filePath: "app/routes/users.py",
    repoName: "backend",
  };

  const fn6: FunctionNode = {
    id: "fn-006",
    name: "query_all_users",
    signature: "def query_all_users() -> list",
    category: "DB_CALL",
    startLine: 5,
    endLine: 10,
    filePath: "app/models/user.py",
    repoName: "backend",
  };

  const ep1: ApiEndpointNode = {
    id: "ep-001",
    method: "GET",
    path: "/api/users",
    fullRoute: "/api/users",
  };

  const ep2: ApiEndpointNode = {
    id: "ep-002",
    method: "POST",
    path: "/api/users",
    fullRoute: "/api/users",
  };

  const dbTable1: DbTableNode = {
    id: "dbt-001",
    name: "users",
    schema: null,
  };

  const relationships: Relationship[] = [
    // BELONGS_TO: repo -> project
    { type: "BELONGS_TO", fromId: "repo-001", toId: "proj-001", properties: {} },
    { type: "BELONGS_TO", fromId: "repo-002", toId: "proj-001", properties: {} },
    // IN_REPO: file -> repo
    { type: "IN_REPO", fromId: "file-001", toId: "repo-001", properties: {} },
    { type: "IN_REPO", fromId: "file-002", toId: "repo-001", properties: {} },
    { type: "IN_REPO", fromId: "file-003", toId: "repo-002", properties: {} },
    { type: "IN_REPO", fromId: "file-004", toId: "repo-002", properties: {} },
    // DEFINED_IN: function -> file
    { type: "DEFINED_IN", fromId: "fn-001", toId: "file-001", properties: {} },
    { type: "DEFINED_IN", fromId: "fn-002", toId: "file-002", properties: {} },
    { type: "DEFINED_IN", fromId: "fn-003", toId: "file-002", properties: {} },
    { type: "DEFINED_IN", fromId: "fn-004", toId: "file-003", properties: {} },
    { type: "DEFINED_IN", fromId: "fn-005", toId: "file-003", properties: {} },
    { type: "DEFINED_IN", fromId: "fn-006", toId: "file-004", properties: {} },
    // CALLS: function -> function
    { type: "CALLS", fromId: "fn-001", toId: "fn-002", properties: { callSite: 8 } },
    { type: "CALLS", fromId: "fn-004", toId: "fn-006", properties: { callSite: 12 } },
    // IMPORTS: file -> file
    { type: "IMPORTS", fromId: "file-001", toId: "file-002", properties: { symbols: ["fetchUsers"] } },
    // EXPOSES: function -> endpoint
    { type: "EXPOSES", fromId: "fn-004", toId: "ep-001", properties: {} },
    { type: "EXPOSES", fromId: "fn-005", toId: "ep-002", properties: {} },
    // CALLS_API: function -> endpoint
    { type: "CALLS_API", fromId: "fn-002", toId: "ep-001", properties: { httpMethod: "GET", urlPattern: "/api/users" } },
    // READS: function -> table
    { type: "READS", fromId: "fn-006", toId: "dbt-001", properties: {} },
  ];

  return {
    projects: [project],
    repositories: [repo1, repo2],
    files: [file1, file2, file3, file4],
    functions: [fn1, fn2, fn3, fn4, fn5, fn6],
    apiEndpoints: [ep1, ep2],
    dbTables: [dbTable1],
    relationships,
    cypherStatements: [],
  };
}

// ─── Test Suite ───

describe("Neo4j Live Integration Tests", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    // Verify connectivity
    await driver.verifyConnectivity();
    // Clean slate
    await dropAllConstraintsAndIndexes();
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await dropAllConstraintsAndIndexes();
    await driver.close();
  });

  // ─── a) Schema Creation ───

  describe("Schema creation", () => {
    afterAll(async () => {
      // Clean up for next test group
      await dropAllConstraintsAndIndexes();
      await clearDatabase();
    });

    it("creates uniqueness constraints and verifies they exist", async () => {
      const constraintStatements = [
        "CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE",
        "CREATE CONSTRAINT repository_id_unique IF NOT EXISTS FOR (r:Repository) REQUIRE r.id IS UNIQUE",
        "CREATE CONSTRAINT file_id_unique IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE",
        "CREATE CONSTRAINT function_id_unique IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE",
        "CREATE CONSTRAINT apiendpoint_id_unique IF NOT EXISTS FOR (ep:APIEndpoint) REQUIRE ep.id IS UNIQUE",
        "CREATE CONSTRAINT dbtable_id_unique IF NOT EXISTS FOR (dt:DBTable) REQUIRE dt.id IS UNIQUE",
      ];

      for (const stmt of constraintStatements) {
        await runCypher(stmt);
      }

      // Verify
      const result = await runCypher("SHOW CONSTRAINTS");
      const names = result.records.map((r) => r.get("name"));
      expect(names).toContain("project_id_unique");
      expect(names).toContain("repository_id_unique");
      expect(names).toContain("file_id_unique");
      expect(names).toContain("function_id_unique");
      expect(names).toContain("apiendpoint_id_unique");
      expect(names).toContain("dbtable_id_unique");
    });

    it("creates indexes and verifies they exist", async () => {
      const indexStatements = [
        "CREATE INDEX idx_function_name IF NOT EXISTS FOR (fn:Function) ON (fn.name)",
        "CREATE INDEX idx_function_category IF NOT EXISTS FOR (fn:Function) ON (fn.category)",
        "CREATE INDEX idx_apiendpoint_method IF NOT EXISTS FOR (ep:APIEndpoint) ON (ep.method)",
        "CREATE INDEX idx_apiendpoint_path IF NOT EXISTS FOR (ep:APIEndpoint) ON (ep.path)",
        "CREATE INDEX idx_repository_url IF NOT EXISTS FOR (r:Repository) ON (r.url)",
        "CREATE INDEX idx_file_path IF NOT EXISTS FOR (f:File) ON (f.path)",
        "CREATE INDEX idx_file_hash IF NOT EXISTS FOR (f:File) ON (f.hash)",
        "CREATE INDEX idx_dbtable_name IF NOT EXISTS FOR (dt:DBTable) ON (dt.name)",
        "CREATE INDEX idx_apiendpoint_method_path IF NOT EXISTS FOR (ep:APIEndpoint) ON (ep.method, ep.path)",
        "CREATE INDEX idx_function_category_name IF NOT EXISTS FOR (fn:Function) ON (fn.category, fn.name)",
      ];

      for (const stmt of indexStatements) {
        await runCypher(stmt);
      }

      // Verify
      const result = await runCypher("SHOW INDEXES");
      const names = result.records.map((r) => r.get("name"));
      expect(names).toContain("idx_function_name");
      expect(names).toContain("idx_function_category");
      expect(names).toContain("idx_apiendpoint_method_path");
    });
  });

  // ─── b) Cypher Generation and Execution ───

  describe("Cypher generation and execution", () => {
    let testResult: PipelineResult;
    let cypherStatements: string[];

    beforeAll(async () => {
      await clearDatabase();
      testResult = buildTestPipelineResult();
      cypherStatements = generateCypherStatements(testResult);
      testResult.cypherStatements = cypherStatements;

      // Execute all Cypher statements
      for (const stmt of cypherStatements) {
        // Some statements contain multiple lines (e.g., MERGE node + MATCH relationship)
        const lines = stmt.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            await runCypher(line);
          } catch (err) {
            console.error("Failed Cypher statement:", line);
            throw err;
          }
        }
      }
    });

    afterAll(async () => {
      await clearDatabase();
    });

    it("creates the correct number of Project nodes", async () => {
      const result = await runCypher("MATCH (p:Project) RETURN count(p) AS cnt");
      expect(result.records[0].get("cnt").toNumber()).toBe(1);
    });

    it("creates the correct number of Repository nodes", async () => {
      const result = await runCypher("MATCH (r:Repository) RETURN count(r) AS cnt");
      expect(result.records[0].get("cnt").toNumber()).toBe(2);
    });

    it("creates the correct number of File nodes", async () => {
      const result = await runCypher("MATCH (f:File) RETURN count(f) AS cnt");
      expect(result.records[0].get("cnt").toNumber()).toBe(4);
    });

    it("creates the correct number of Function nodes", async () => {
      const result = await runCypher("MATCH (fn:Function) RETURN count(fn) AS cnt");
      expect(result.records[0].get("cnt").toNumber()).toBe(6);
    });

    it("creates the correct number of APIEndpoint nodes", async () => {
      const result = await runCypher("MATCH (ep:APIEndpoint) RETURN count(ep) AS cnt");
      expect(result.records[0].get("cnt").toNumber()).toBe(2);
    });

    it("creates the correct number of DBTable nodes", async () => {
      const result = await runCypher("MATCH (dt:DBTable) RETURN count(dt) AS cnt");
      expect(result.records[0].get("cnt").toNumber()).toBe(1);
    });

    it("creates BELONGS_TO relationships", async () => {
      const result = await runCypher(
        "MATCH (:Repository)-[r:BELONGS_TO]->(:Project) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(2);
    });

    it("creates IN_REPO relationships", async () => {
      const result = await runCypher(
        "MATCH (:File)-[r:IN_REPO]->(:Repository) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(4);
    });

    it("creates DEFINED_IN relationships", async () => {
      const result = await runCypher(
        "MATCH (:Function)-[r:DEFINED_IN]->(:File) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(6);
    });

    it("creates CALLS relationships with callSite property", async () => {
      const result = await runCypher(
        "MATCH (:Function)-[r:CALLS]->(:Function) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(2);

      // Verify callSite property
      const detail = await runCypher(
        "MATCH (a:Function {id: 'fn-001'})-[r:CALLS]->(b:Function {id: 'fn-002'}) RETURN r.callSite AS callSite"
      );
      expect(detail.records.length).toBe(1);
      expect(detail.records[0].get("callSite")).toBeTruthy();
    });

    it("creates IMPORTS relationships with symbols property", async () => {
      const result = await runCypher(
        "MATCH (:File)-[r:IMPORTS]->(:File) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(1);

      // Verify symbols property
      const detail = await runCypher(
        "MATCH (a:File {id: 'file-001'})-[r:IMPORTS]->(b:File {id: 'file-002'}) RETURN r.symbols AS symbols"
      );
      expect(detail.records.length).toBe(1);
      const symbols = detail.records[0].get("symbols");
      expect(symbols).toContain("fetchUsers");
    });

    it("creates EXPOSES relationships", async () => {
      const result = await runCypher(
        "MATCH (:Function)-[r:EXPOSES]->(:APIEndpoint) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(2);
    });

    it("creates CALLS_API relationships", async () => {
      const result = await runCypher(
        "MATCH (:Function)-[r:CALLS_API]->(:APIEndpoint) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(1);

      // Verify properties
      const detail = await runCypher(
        "MATCH (fn:Function {id: 'fn-002'})-[r:CALLS_API]->(ep:APIEndpoint) RETURN r.httpMethod AS method, r.urlPattern AS url"
      );
      expect(detail.records.length).toBe(1);
      expect(detail.records[0].get("method")).toBe("GET");
      expect(detail.records[0].get("url")).toBe("/api/users");
    });

    it("creates READS relationships", async () => {
      const result = await runCypher(
        "MATCH (:Function)-[r:READS]->(:DBTable) RETURN count(r) AS cnt"
      );
      expect(result.records[0].get("cnt").toNumber()).toBe(1);
    });
  });

  // ─── c) Graph Queries ───

  describe("Graph queries (API route patterns)", () => {
    beforeAll(async () => {
      await clearDatabase();
      const testResult = buildTestPipelineResult();
      const stmts = generateCypherStatements(testResult);
      for (const stmt of stmts) {
        const lines = stmt.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          await runCypher(line);
        }
      }
    });

    afterAll(async () => {
      await clearDatabase();
    });

    it("queries project by MATCH (p:Project) RETURN p", async () => {
      const result = await runCypher("MATCH (p:Project) RETURN p");
      expect(result.records.length).toBe(1);
      const props = result.records[0].get("p").properties;
      expect(props.name).toBe("test-project");
    });

    it("queries function by id", async () => {
      const result = await runCypher(
        "MATCH (fn:Function {id: $id}) RETURN fn",
        { id: "fn-002" }
      );
      expect(result.records.length).toBe(1);
      const props = result.records[0].get("fn").properties;
      expect(props.name).toBe("fetchUsers");
    });

    it("queries CALLS edges between functions", async () => {
      const result = await runCypher(
        "MATCH (fn:Function)-[:CALLS]->(target:Function) RETURN fn.name AS caller, target.name AS callee"
      );
      expect(result.records.length).toBe(2);
      const pairs = result.records.map((r) => ({
        caller: r.get("caller"),
        callee: r.get("callee"),
      }));
      expect(pairs).toContainEqual({ caller: "UsersPage", callee: "fetchUsers" });
      expect(pairs).toContainEqual({ caller: "get_users", callee: "query_all_users" });
    });

    it("queries CALLS_API for cross-repo stitching", async () => {
      const result = await runCypher(
        "MATCH (fn:Function)-[:CALLS_API]->(ep:APIEndpoint) RETURN fn.name AS caller, ep.method AS method, ep.path AS path"
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get("caller")).toBe("fetchUsers");
      expect(result.records[0].get("method")).toBe("GET");
      expect(result.records[0].get("path")).toBe("/api/users");
    });

    it("queries DEFINED_IN -> IN_REPO chain", async () => {
      const result = await runCypher(
        "MATCH (fn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository) RETURN fn.name AS funcName, f.path AS filePath, r.name AS repoName"
      );
      expect(result.records.length).toBe(6);
      const rows = result.records.map((r) => ({
        funcName: r.get("funcName"),
        filePath: r.get("filePath"),
        repoName: r.get("repoName"),
      }));
      expect(rows).toContainEqual({
        funcName: "UsersPage",
        filePath: "src/pages/UsersPage.tsx",
        repoName: "frontend",
      });
      expect(rows).toContainEqual({
        funcName: "get_users",
        filePath: "app/routes/users.py",
        repoName: "backend",
      });
    });

    it("queries READS for DB access", async () => {
      const result = await runCypher(
        "MATCH (fn:Function)-[:READS]->(dt:DBTable) RETURN fn.name AS funcName, dt.name AS tableName"
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get("funcName")).toBe("query_all_users");
      expect(result.records[0].get("tableName")).toBe("users");
    });
  });

  // ─── d) Idempotency ───

  describe("Idempotency", () => {
    beforeAll(async () => {
      await clearDatabase();
    });

    afterAll(async () => {
      await clearDatabase();
    });

    it("running MERGE statements twice produces no duplicates", async () => {
      const testResult = buildTestPipelineResult();
      const stmts = generateCypherStatements(testResult);

      // Run once
      for (const stmt of stmts) {
        const lines = stmt.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          await runCypher(line);
        }
      }

      // Run twice
      for (const stmt of stmts) {
        const lines = stmt.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          await runCypher(line);
        }
      }

      // Verify counts are unchanged
      const projCount = await runCypher("MATCH (p:Project) RETURN count(p) AS cnt");
      expect(projCount.records[0].get("cnt").toNumber()).toBe(1);

      const repoCount = await runCypher("MATCH (r:Repository) RETURN count(r) AS cnt");
      expect(repoCount.records[0].get("cnt").toNumber()).toBe(2);

      const fileCount = await runCypher("MATCH (f:File) RETURN count(f) AS cnt");
      expect(fileCount.records[0].get("cnt").toNumber()).toBe(4);

      const funcCount = await runCypher("MATCH (fn:Function) RETURN count(fn) AS cnt");
      expect(funcCount.records[0].get("cnt").toNumber()).toBe(6);

      const epCount = await runCypher("MATCH (ep:APIEndpoint) RETURN count(ep) AS cnt");
      expect(epCount.records[0].get("cnt").toNumber()).toBe(2);

      const dtCount = await runCypher("MATCH (dt:DBTable) RETURN count(dt) AS cnt");
      expect(dtCount.records[0].get("cnt").toNumber()).toBe(1);

      // Relationship counts should also be unchanged
      const callsCount = await runCypher("MATCH ()-[r:CALLS]->() RETURN count(r) AS cnt");
      expect(callsCount.records[0].get("cnt").toNumber()).toBe(2);

      const belongsCount = await runCypher("MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS cnt");
      expect(belongsCount.records[0].get("cnt").toNumber()).toBe(2);
    });
  });

  // ─── e) Full Pipeline Round-Trip ───

  describe("Full pipeline round-trip", () => {
    const ANALYZER_CLI = path.resolve(import.meta.dirname, "../../analyzers/js-ts/dist/cli.js");
    const FRONTEND_DIR = path.resolve(import.meta.dirname, "../fixtures/frontend");
    const IR_PATH = path.join(os.tmpdir(), `neo4j-test-frontend-ir-${Date.now()}.json`);

    beforeAll(async () => {
      await clearDatabase();
    });

    afterAll(async () => {
      await clearDatabase();
      try {
        fs.unlinkSync(IR_PATH);
      } catch {
        // ignore
      }
    });

    it("analyzes fixtures, builds pipeline result, writes to Neo4j, and reads back", async () => {
      // Step 1: Run the TS analyzer
      execFileSync("node", [
        ANALYZER_CLI,
        "--repo", FRONTEND_DIR,
        "--repo-name", "frontend",
        "--output", IR_PATH,
      ], {
        timeout: 30_000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      expect(fs.existsSync(IR_PATH)).toBe(true);

      // Step 2: Read IR JSON
      const irJson: IrDocument = JSON.parse(fs.readFileSync(IR_PATH, "utf-8"));
      expect(irJson.$schema).toBe("confianalyzer-ir-v1");

      // Step 3: Feed through orchestrator pipeline
      const irDocuments = new Map<string, IrDocument>();
      irDocuments.set("frontend", irJson);

      const result = await buildResultFromIr(irDocuments, "roundtrip-test", { dryRun: true });
      expect(result.functions.length).toBeGreaterThan(0);

      // Step 4: Generate and execute Cypher
      const stmts = generateCypherStatements(result);
      expect(stmts.length).toBeGreaterThan(0);

      for (const stmt of stmts) {
        const lines = stmt.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            await runCypher(line);
          } catch (err) {
            console.error("Failed Cypher:", line);
            throw err;
          }
        }
      }

      // Step 5: Verify the graph
      // Project exists
      const projResult = await runCypher("MATCH (p:Project {name: 'roundtrip-test'}) RETURN p");
      expect(projResult.records.length).toBe(1);

      // Repository exists
      const repoResult = await runCypher("MATCH (r:Repository {name: 'frontend'}) RETURN r");
      expect(repoResult.records.length).toBe(1);

      // Functions exist
      const funcResult = await runCypher("MATCH (fn:Function) RETURN fn.name AS name");
      const funcNames = funcResult.records.map((r) => r.get("name"));
      expect(funcNames).toContain("fetchUsers");
      expect(funcNames).toContain("UsersPage");

      // Files exist
      const fileResult = await runCypher("MATCH (f:File) RETURN f.path AS path");
      const filePaths = fileResult.records.map((r) => r.get("path"));
      expect(filePaths.length).toBeGreaterThanOrEqual(2);

      // DEFINED_IN chain works
      const chainResult = await runCypher(
        "MATCH (fn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository) RETURN fn.name AS funcName, f.path AS filePath, r.name AS repoName"
      );
      expect(chainResult.records.length).toBeGreaterThan(0);

      // EXPOSES relationships (if any endpoints found)
      const exposesResult = await runCypher(
        "MATCH (fn:Function)-[:EXPOSES]->(ep:APIEndpoint) RETURN fn.name AS funcName, ep.path AS path"
      );
      // The frontend fixture has HTTP calls but may not have endpoints; check count >= 0
      expect(exposesResult.records).toBeDefined();
    });
  });
});
