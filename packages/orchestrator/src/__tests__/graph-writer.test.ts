import { describe, it, expect } from "vitest";
import { generateCypherStatements } from "../graph-writer.js";
import type { PipelineResult } from "../types.js";

function makeResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    projects: [],
    repositories: [],
    files: [],
    functions: [],
    apiEndpoints: [],
    dbTables: [],
    relationships: [],
    cypherStatements: [],
    ...overrides,
  };
}

describe("generateCypherStatements", () => {
  it("generates Cypher for a Project node", () => {
    const result = makeResult({
      projects: [{ id: "proj-1", name: "My Project", createdAt: "2024-01-01T00:00:00Z" }],
    });

    const statements = generateCypherStatements(result);

    expect(statements.length).toBeGreaterThan(0);
    expect(statements[0]).toContain("MERGE (p:Project");
    expect(statements[0]).toContain("proj-1");
    expect(statements[0]).toContain("My Project");
  });

  it("generates Cypher for a Repository node with BELONGS_TO", () => {
    const result = makeResult({
      projects: [{ id: "proj-1", name: "My Project", createdAt: "2024-01-01T00:00:00Z" }],
      repositories: [{ id: "repo-1", url: "/path/to/repo", name: "frontend", language: "typescript", lastAnalyzedAt: "2024-01-01T00:00:00Z" }],
    });

    const statements = generateCypherStatements(result);
    const repoStatements = statements.filter((s) => s.includes("Repository"));

    expect(repoStatements.length).toBeGreaterThan(0);
    expect(repoStatements.some((s) => s.includes("MERGE (r:Repository"))).toBe(true);
    expect(repoStatements.some((s) => s.includes("BELONGS_TO"))).toBe(true);
  });

  it("generates Cypher for a File node with IN_REPO", () => {
    const result = makeResult({
      projects: [{ id: "proj-1", name: "Test", createdAt: "2024-01-01T00:00:00Z" }],
      repositories: [{ id: "repo-1", url: "/path", name: "frontend", language: "typescript", lastAnalyzedAt: "2024-01-01T00:00:00Z" }],
      files: [{ id: "file-1", path: "src/index.ts", language: "typescript", hash: "abc123", repoName: "frontend" }],
    });

    const statements = generateCypherStatements(result);
    const fileStatements = statements.filter((s) => s.includes("File"));

    expect(fileStatements.some((s) => s.includes("MERGE (f:File"))).toBe(true);
    expect(fileStatements.some((s) => s.includes("IN_REPO"))).toBe(true);
  });

  it("generates Cypher for a Function node with DEFINED_IN", () => {
    const result = makeResult({
      projects: [{ id: "proj-1", name: "Test", createdAt: "2024-01-01T00:00:00Z" }],
      repositories: [{ id: "repo-1", url: "/path", name: "frontend", language: "typescript", lastAnalyzedAt: "2024-01-01T00:00:00Z" }],
      files: [{ id: "file-1", path: "src/index.ts", language: "typescript", hash: "abc123", repoName: "frontend" }],
      functions: [{ id: "func-1", name: "main", signature: "function main(): void", category: "UTILITY", startLine: 1, endLine: 10, filePath: "src/index.ts", repoName: "frontend" }],
    });

    const statements = generateCypherStatements(result);
    const funcStatements = statements.filter((s) => s.includes("Function"));

    expect(funcStatements.some((s) => s.includes("MERGE (fn:Function"))).toBe(true);
    expect(funcStatements.some((s) => s.includes("DEFINED_IN"))).toBe(true);
  });

  it("generates Cypher for an APIEndpoint node", () => {
    const result = makeResult({
      apiEndpoints: [{ id: "ep-1", method: "GET", path: "/api/users", fullRoute: "/api/users" }],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("MERGE (ep:APIEndpoint"))).toBe(true);
    expect(statements.some((s) => s.includes("GET"))).toBe(true);
  });

  it("generates Cypher for a DBTable node", () => {
    const result = makeResult({
      dbTables: [{ id: "table-1", name: "users", schema: "public" }],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("MERGE (t:DBTable"))).toBe(true);
    expect(statements.some((s) => s.includes("users"))).toBe(true);
    expect(statements.some((s) => s.includes("public"))).toBe(true);
  });

  it("generates Cypher for CALLS relationships", () => {
    const result = makeResult({
      relationships: [
        { type: "CALLS", fromId: "func-1", toId: "func-2", properties: { callSite: 15 } },
      ],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("[:CALLS"))).toBe(true);
    expect(statements.some((s) => s.includes("callSite: 15"))).toBe(true);
  });

  it("generates Cypher for IMPORTS relationships", () => {
    const result = makeResult({
      relationships: [
        { type: "IMPORTS", fromId: "file-1", toId: "file-2", properties: { symbols: ["foo", "bar"] } },
      ],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("[:IMPORTS"))).toBe(true);
    expect(statements.some((s) => s.includes("symbols:"))).toBe(true);
  });

  it("generates Cypher for EXPOSES relationships", () => {
    const result = makeResult({
      relationships: [
        { type: "EXPOSES", fromId: "func-1", toId: "ep-1", properties: {} },
      ],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("[:EXPOSES]"))).toBe(true);
  });

  it("generates Cypher for CALLS_API relationships", () => {
    const result = makeResult({
      relationships: [
        { type: "CALLS_API", fromId: "func-1", toId: "ep-1", properties: { httpMethod: "GET", urlPattern: "/api/users" } },
      ],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("[:CALLS_API"))).toBe(true);
    expect(statements.some((s) => s.includes("httpMethod: 'GET'"))).toBe(true);
  });

  it("generates Cypher for READS relationships", () => {
    const result = makeResult({
      relationships: [
        { type: "READS", fromId: "func-1", toId: "table-1", properties: {} },
      ],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("[:READS]"))).toBe(true);
  });

  it("generates Cypher for WRITES relationships", () => {
    const result = makeResult({
      relationships: [
        { type: "WRITES", fromId: "func-1", toId: "table-1", properties: {} },
      ],
    });

    const statements = generateCypherStatements(result);

    expect(statements.some((s) => s.includes("[:WRITES]"))).toBe(true);
  });

  it("escapes single quotes in string values", () => {
    const result = makeResult({
      projects: [{ id: "proj-1", name: "O'Reilly's Project", createdAt: "2024-01-01T00:00:00Z" }],
    });

    const statements = generateCypherStatements(result);

    expect(statements[0]).toContain("O\\'Reilly\\'s Project");
  });
});
