import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../server.js";
import type { Express } from "express";

// Mock neo4j service
vi.mock("../services/neo4j.js", () => ({
  runQuery: vi.fn(),
}));

// Mock language-detect service
vi.mock("../services/language-detect.js", () => ({
  detectLanguage: vi.fn().mockReturnValue("typescript"),
}));

// Mock fs.existsSync for repository path validation
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

import { runQuery } from "../services/neo4j.js";
import { detectLanguage } from "../services/language-detect.js";
import * as fs from "node:fs";

const mockRunQuery = vi.mocked(runQuery);
const mockDetectLanguage = vi.mocked(detectLanguage);
const mockExistsSync = vi.mocked(fs.existsSync);

let app: Express;

beforeEach(() => {
  app = createApp();
  vi.clearAllMocks();
  mockDetectLanguage.mockReturnValue("typescript");
  mockExistsSync.mockReturnValue(true);
});

describe("POST /api/projects", () => {
  it("creates a new project and returns 201", async () => {
    // First call: check if project exists
    mockRunQuery.mockResolvedValueOnce([]);
    // Second call: create project
    mockRunQuery.mockResolvedValueOnce([{
      p: { id: "test-uuid", name: "my-project", createdAt: 1711756800000 },
    }]);

    const res = await request(app)
      .post("/api/projects")
      .send({ name: "my-project" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "test-uuid",
      name: "my-project",
      createdAt: 1711756800000,
    });
  });

  it("returns 409 for duplicate project", async () => {
    // Project already exists
    mockRunQuery.mockResolvedValueOnce([{
      p: { id: "existing-id", name: "my-project", createdAt: 1711756800000 },
    }]);

    const res = await request(app)
      .post("/api/projects")
      .send({ name: "my-project" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("returns 400 if name is missing", async () => {
    const res = await request(app)
      .post("/api/projects")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("name is required");
  });
});

describe("GET /api/projects", () => {
  it("returns project list with repository counts", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        p: { id: "p1", name: "project-a", createdAt: 1711756800000 },
        repositoryCount: 3,
      },
      {
        p: { id: "p2", name: "project-b", createdAt: 1711670400000 },
        repositoryCount: 0,
      },
    ]);

    const res = await request(app).get("/api/projects");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "p1", name: "project-a", createdAt: 1711756800000, repositoryCount: 3 },
      { id: "p2", name: "project-b", createdAt: 1711670400000, repositoryCount: 0 },
    ]);
  });
});

describe("POST /api/projects/:name/repositories", () => {
  it("adds a repository to a project", async () => {
    // Check project exists
    mockRunQuery.mockResolvedValueOnce([{ p: { id: "p1", name: "my-project" } }]);
    // Create repository
    mockRunQuery.mockResolvedValueOnce([{
      r: { id: "r1", name: "frontend", url: "/path/to/frontend", language: "typescript", status: "pending" },
    }]);

    const res = await request(app)
      .post("/api/projects/my-project/repositories")
      .send({ name: "frontend", path: "/path/to/frontend" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "r1",
      name: "frontend",
      path: "/path/to/frontend",
      language: "typescript",
      status: "pending",
    });
    expect(mockDetectLanguage).toHaveBeenCalledWith("/path/to/frontend");
  });

  it("returns 400 if path does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await request(app)
      .post("/api/projects/my-project/repositories")
      .send({ name: "frontend", path: "/nonexistent/path" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not exist");
  });

  it("returns 400 if repo name is missing", async () => {
    const res = await request(app)
      .post("/api/projects/my-project/repositories")
      .send({ path: "/some/path" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("name is required");
  });

  it("returns 404 if project not found", async () => {
    mockRunQuery.mockResolvedValueOnce([]); // project not found

    const res = await request(app)
      .post("/api/projects/nonexistent/repositories")
      .send({ name: "frontend", path: "/some/path" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("GET /api/projects/:name/repositories", () => {
  it("returns repositories for a project", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "r1", name: "frontend", url: "/path/to/frontend", language: "typescript", lastAnalyzedAt: null, status: "pending" },
      { id: "r2", name: "backend", url: "/path/to/backend", language: "python", lastAnalyzedAt: "2024-01-01T00:00:00Z", status: "analyzed" },
    ]);

    const res = await request(app).get("/api/projects/my-project/repositories");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("frontend");
    expect(res.body[0].status).toBe("pending");
    expect(res.body[1].status).toBe("analyzed");
  });
});

describe("DELETE /api/projects/:name/repositories/:repoName", () => {
  it("deletes a repository and returns 204", async () => {
    // Check repo exists
    mockRunQuery.mockResolvedValueOnce([{ r: { id: "r1", name: "frontend" } }]);
    // Delete
    mockRunQuery.mockResolvedValueOnce([]);

    const res = await request(app)
      .delete("/api/projects/my-project/repositories/frontend");

    expect(res.status).toBe(204);
  });

  it("returns 404 if repo not found", async () => {
    mockRunQuery.mockResolvedValueOnce([]); // repo not found

    const res = await request(app)
      .delete("/api/projects/my-project/repositories/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("POST /api/analysis/run", () => {
  it("returns runId with 202 status", async () => {
    // triggerAnalysis calls: project lookup, repo lookup
    mockRunQuery.mockResolvedValueOnce([{ p: { id: "p1", name: "my-project" } }]);
    mockRunQuery.mockResolvedValueOnce([
      { name: "frontend", url: "/path/to/frontend", language: "typescript" },
    ]);

    const res = await request(app)
      .post("/api/analysis/run")
      .send({ projectName: "my-project" });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
    expect(typeof res.body.runId).toBe("string");
  });

  it("returns 400 if projectName is missing", async () => {
    const res = await request(app)
      .post("/api/analysis/run")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("projectName");
  });

  it("returns 404 if project not found", async () => {
    mockRunQuery.mockResolvedValueOnce([]); // project not found

    const res = await request(app)
      .post("/api/analysis/run")
      .send({ projectName: "nonexistent" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

describe("GET /api/analysis/status/:runId", () => {
  it("returns 404 for unknown runId", async () => {
    const res = await request(app)
      .get("/api/analysis/status/nonexistent-run-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns progress for a running analysis", async () => {
    // First trigger an analysis to get a runId
    mockRunQuery.mockResolvedValueOnce([{ p: { id: "p1", name: "my-project" } }]);
    mockRunQuery.mockResolvedValueOnce([
      { name: "frontend", url: "/path/to/frontend", language: "typescript" },
    ]);

    const triggerRes = await request(app)
      .post("/api/analysis/run")
      .send({ projectName: "my-project" });

    const { runId } = triggerRes.body;

    const statusRes = await request(app)
      .get(`/api/analysis/status/${runId}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.runId).toBe(runId);
    expect(statusRes.body.projectName).toBe("my-project");
    expect(["pending", "running", "completed", "failed"]).toContain(statusRes.body.status);
  });
});
