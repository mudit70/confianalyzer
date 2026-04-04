import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../server.js";
import type { Express } from "express";

// Mock neo4j service
vi.mock("../services/neo4j.js", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "../services/neo4j.js";
const mockRunQuery = vi.mocked(runQuery);

let app: Express;

beforeEach(() => {
  app = createApp();
  vi.clearAllMocks();
});

describe("GET /api/projects/:name/summary", () => {
  it("returns project summary", async () => {
    // First call: check project exists
    mockRunQuery.mockResolvedValueOnce([{ p: { id: "1", name: "test-project" } }]);
    // Second call: summary stats
    mockRunQuery.mockResolvedValueOnce([{
      repositoryCount: 2,
      fileCount: 10,
      functionCount: 50,
      endpointCount: 5,
      dbTableCount: 3,
    }]);
    // Third call: category counts
    mockRunQuery.mockResolvedValueOnce([
      { category: "HANDLER", cnt: 10 },
      { category: "UTILITY", cnt: 30 },
    ]);
    // Fourth call: repositories
    mockRunQuery.mockResolvedValueOnce([
      { name: "backend", language: "typescript", fileCount: 6, functionCount: 30 },
      { name: "frontend", language: "typescript", fileCount: 4, functionCount: 20 },
    ]);

    const res = await request(app).get("/api/projects/test-project/summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "test-project",
      repositoryCount: 2,
      fileCount: 10,
      functionCount: 50,
      endpointCount: 5,
      dbTableCount: 3,
      categoryCounts: { HANDLER: 10, UTILITY: 30 },
      repositories: [
        { name: "backend", language: "typescript", fileCount: 6, functionCount: 30 },
        { name: "frontend", language: "typescript", fileCount: 4, functionCount: 20 },
      ],
    });
  });

  it("returns 404 for unknown project", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/projects/nonexistent/summary");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("GET /api/functions/:id/neighbors", () => {
  it("returns function with neighbors as graph data", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      fn: { id: "fn-1", name: "handleRequest", signature: "handleRequest(req, res)", category: "HANDLER", startLine: 10, endLine: 25 },
      callers: [
        { id: "fn-2", name: "router", signature: "router()", category: "HANDLER", startLine: 1, endLine: 5 },
      ],
      callees: [
        { id: "fn-3", name: "getUser", signature: "getUser(id)", category: "DB_CALL", startLine: 30, endLine: 40 },
      ],
      f: { id: "file-1", path: "src/handler.ts", language: "typescript", hash: "abc" },
      endpoints: [],
    }]);

    const res = await request(app).get("/api/functions/fn-1/neighbors?depth=1");

    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(4); // fn + caller + callee + file
    expect(res.body.edges).toHaveLength(3); // caller->fn, fn->callee, fn->file
    expect(res.body.nodes.find((n: Record<string, unknown>) => n.id === "fn-1")).toBeDefined();
  });

  it("returns 404 for missing function", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/functions/nonexistent/neighbors");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/functions/:id/trace", () => {
  it("returns flow paths for callees", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      path: [
        {
          start: { id: "fn-1", name: "main", signature: "main()", category: "HANDLER", startLine: 1, endLine: 10 },
          relationship: { _type: "CALLS" },
          end: { id: "fn-2", name: "helper", signature: "helper()", category: "UTILITY", startLine: 20, endLine: 30 },
        },
      ],
      depth: 1,
    }]);

    const res = await request(app).get("/api/functions/fn-1/trace?direction=callees");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].depth).toBe(1);
    expect(res.body[0].nodes).toHaveLength(2);
    expect(res.body[0].edges).toHaveLength(1);
  });

  it("returns 400 for invalid direction", async () => {
    const res = await request(app).get("/api/functions/fn-1/trace?direction=invalid");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/search/functions", () => {
  it("returns matching functions", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "fn-1", name: "getUser", signature: "getUser(id)", category: "DB_CALL", filePath: "src/db.ts", repoName: "backend", startLine: 5, endLine: 15 },
    ]);

    const res = await request(app).get("/api/search/functions?q=getUser");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("getUser");
  });

  it("returns 400 if q is missing", async () => {
    const res = await request(app).get("/api/search/functions");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/search/endpoints", () => {
  it("returns matching endpoints", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "ep-1", method: "GET", path: "/users/:id", fullRoute: "/api/users/:id", handlerName: "getUser", repoName: "backend" },
    ]);

    const res = await request(app).get("/api/search/endpoints?q=users");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].method).toBe("GET");
  });
});

describe("GET /api/files/:id", () => {
  it("returns file details with functions", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      f: { id: "file-1", path: "src/handler.ts", language: "typescript" },
      repoName: "backend",
      functions: [
        { id: "fn-1", name: "handleRequest", signature: "handleRequest()", category: "HANDLER", startLine: 1, endLine: 10 },
      ],
      importCount: 3,
    }]);

    const res = await request(app).get("/api/files/file-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("file-1");
    expect(res.body.functions).toHaveLength(1);
    expect(res.body.importCount).toBe(3);
  });

  it("returns 404 for missing file", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/files/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/files/:id/functions", () => {
  it("returns functions in a file", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "fn-1", name: "foo", signature: "foo()", category: "UTILITY", startLine: 1, endLine: 5 },
      { id: "fn-2", name: "bar", signature: "bar()", category: "HANDLER", startLine: 10, endLine: 20 },
    ]);

    const res = await request(app).get("/api/files/file-1/functions");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe("GET /api/repositories/:name/files", () => {
  it("returns files in a repository", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "f-1", path: "src/index.ts", language: "typescript", hash: "abc" },
    ]);

    const res = await request(app).get("/api/repositories/backend/files");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].path).toBe("src/index.ts");
  });
});

describe("GET /api/endpoints", () => {
  it("returns all endpoints", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "ep-1", method: "GET", path: "/users", fullRoute: "/api/users", handlerName: "listUsers", repoName: "backend" },
    ]);

    const res = await request(app).get("/api/endpoints");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("filters by repo name", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/endpoints?repo=frontend");

    expect(res.status).toBe(200);
    expect(mockRunQuery).toHaveBeenCalledWith(expect.any(String), { repo: "frontend" });
  });
});

describe("GET /api/graph/node/:id/neighborhood", () => {
  it("returns neighborhood with expected shape", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      center: { id: "fn-1", name: "handleRequest", signature: "handleRequest(req, res)", category: "HANDLER", startLine: 10, endLine: 25 },
      neighbors: [
        { id: "fn-2", name: "getUser", signature: "getUser(id)", category: "DB_CALL", startLine: 30, endLine: 40 },
        { id: "fn-3", name: "validate", signature: "validate(req)", category: "UTILITY", startLine: 50, endLine: 55 },
      ],
      allRelPaths: [
        [{ _startNodeId: "fn-1", _endNodeId: "fn-2", _type: "CALLS" }],
        [{ _startNodeId: "fn-3", _endNodeId: "fn-1", _type: "CALLS" }],
      ],
    }]);

    const res = await request(app).get("/api/graph/node/fn-1/neighborhood?depth=2&maxNodes=50");

    expect(res.status).toBe(200);
    expect(res.body.center).toBeDefined();
    expect(res.body.center.id).toBe("fn-1");
    expect(res.body.nodes).toHaveLength(2);
    expect(res.body.edges).toHaveLength(2);
    expect(res.body.depth).toBe(2);
    expect(res.body.nodeDepths).toBeDefined();
    expect(typeof res.body.nodeDepths).toBe("object");
  });

  it("returns 404 for missing node", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/graph/node/nonexistent/neighborhood");
    expect(res.status).toBe(404);
  });

  it("clamps depth to max 3", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      center: { id: "fn-1", name: "test", signature: "test()", category: "UTILITY" },
      neighbors: [],
      allRelPaths: [],
    }]);

    const res = await request(app).get("/api/graph/node/fn-1/neighborhood?depth=10");

    expect(res.status).toBe(200);
    expect(res.body.depth).toBe(3);
  });
});

describe("GET /api/graph/insights/:projectName/hotspots", () => {
  it("returns hotspots with expected shape", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "file-1", path: "src/handler.ts", importCount: 15 },
      { id: "file-2", path: "src/utils.ts", importCount: 10 },
    ]);

    const res = await request(app).get("/api/graph/insights/test-project/hotspots?limit=10");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({
      id: "file-1",
      name: "src/handler.ts",
      path: "src/handler.ts",
      count: 15,
    });
  });

  it("returns empty array when no hotspots", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/graph/insights/test-project/hotspots");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/graph/insights/:projectName/high-fanout", () => {
  it("returns high-fanout functions with expected shape", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "fn-1", name: "orchestrate", category: "HANDLER", callCount: 12 },
      { id: "fn-2", name: "processAll", category: "UTILITY", callCount: 8 },
    ]);

    const res = await request(app).get("/api/graph/insights/test-project/high-fanout?limit=5");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({
      id: "fn-1",
      name: "orchestrate",
      category: "HANDLER",
      count: 12,
    });
  });

  it("returns empty array when no high-fanout functions", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/graph/insights/test-project/high-fanout");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/graph/node/:id/entry-to-exit", () => {
  it("returns expected shape with paths and fileMap", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      path: [
        {
          start: { id: "fn-1", name: "handleRequest", signature: "handleRequest(req, res)", category: "HANDLER", startLine: 10, endLine: 25 },
          relationship: { _type: "CALLS" },
          end: { id: "fn-2", name: "getUser", signature: "getUser(id)", category: "DB_CALL", startLine: 30, endLine: 40 },
        },
      ],
      fileMap: [
        { fnId: "fn-1", filePath: "src/handler.ts" },
        { fnId: "fn-2", filePath: "src/db.ts" },
      ],
    }]);

    const res = await request(app).get("/api/graph/node/fn-1/entry-to-exit");

    expect(res.status).toBe(200);
    expect(res.body.paths).toBeDefined();
    expect(Array.isArray(res.body.paths)).toBe(true);
    expect(res.body.paths.length).toBeGreaterThan(0);
    expect(res.body.paths[0].nodes).toBeDefined();
    expect(res.body.paths[0].edges).toBeDefined();
    expect(res.body.fileMap).toBeDefined();
    expect(res.body.fileMap["fn-1"]).toBe("src/handler.ts");
    expect(res.body.fileMap["fn-2"]).toBe("src/db.ts");
  });

  it("returns empty paths when no terminal nodes reachable", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/graph/node/fn-1/entry-to-exit");

    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual([]);
    expect(res.body.fileMap).toEqual({});
  });

  it("prunes utility nodes when pruneUtility=true", async () => {
    mockRunQuery.mockResolvedValueOnce([{
      path: [
        {
          start: { id: "fn-1", name: "handler", signature: "handler()", category: "HANDLER", startLine: 1, endLine: 10 },
          relationship: { _type: "CALLS" },
          end: { id: "fn-util", name: "utils", signature: "utils()", category: "UTILITY", startLine: 20, endLine: 30 },
        },
        {
          start: { id: "fn-util", name: "utils", signature: "utils()", category: "UTILITY", startLine: 20, endLine: 30 },
          relationship: { _type: "CALLS" },
          end: { id: "fn-db", name: "queryDB", signature: "queryDB()", category: "DB_CALL", startLine: 40, endLine: 50 },
        },
      ],
      fileMap: [
        { fnId: "fn-1", filePath: "src/handler.ts" },
        { fnId: "fn-util", filePath: "src/utils.ts" },
        { fnId: "fn-db", filePath: "src/db.ts" },
      ],
    }]);

    const res = await request(app).get("/api/graph/node/fn-1/entry-to-exit?pruneUtility=true");

    expect(res.status).toBe(200);
    const allNodeIds = res.body.paths.flatMap((p: { nodes: Array<{ id: string }> }) => p.nodes.map((n: { id: string }) => n.id));
    expect(allNodeIds).not.toContain("fn-util");
  });
});

describe("GET /api/graph/category/:projectName/:category", () => {
  it("returns functions with expected shape", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "fn-1", name: "handleRequest", signature: "handleRequest(req, res)", category: "HANDLER", filePath: "src/handler.ts", repoName: "backend", startLine: 10, endLine: 25 },
      { id: "fn-2", name: "processOrder", signature: "processOrder(order)", category: "HANDLER", filePath: "src/orders.ts", repoName: "backend", startLine: 5, endLine: 20 },
    ]);

    const res = await request(app).get("/api/graph/category/test-project/HANDLER");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].category).toBe("HANDLER");
    expect(res.body[0].name).toBe("handleRequest");
  });

  it("returns empty array for category with no functions", async () => {
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/graph/category/test-project/UI_INTERACTION");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
