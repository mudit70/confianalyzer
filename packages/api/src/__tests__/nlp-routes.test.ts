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

describe("POST /api/query/nlp", () => {
  it("returns 400 when question is missing", async () => {
    const res = await request(app)
      .post("/api/query/nlp")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("question");
  });

  it("returns 400 when question is not a string", async () => {
    const res = await request(app)
      .post("/api/query/nlp")
      .send({ question: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("question");
  });

  it("returns 503 when NLP module is unavailable", async () => {
    // The dynamic import of the NLP module will fail in test environment
    const res = await request(app)
      .post("/api/query/nlp")
      .send({ question: "What functions call the database?" });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("NLP translator");
  });
});

describe("POST /api/query/nlp/summarize", () => {
  it("returns 400 when nodes is missing", async () => {
    const res = await request(app)
      .post("/api/query/nlp/summarize")
      .send({ relationships: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("nodes");
  });

  it("returns 400 when relationships is missing", async () => {
    const res = await request(app)
      .post("/api/query/nlp/summarize")
      .send({ nodes: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("relationships");
  });

  it("returns 400 when nodes is not an array", async () => {
    const res = await request(app)
      .post("/api/query/nlp/summarize")
      .send({ nodes: "invalid", relationships: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("nodes");
  });

  it("returns summarization result or 503 if NLP module not built", async () => {
    const res = await request(app)
      .post("/api/query/nlp/summarize")
      .send({
        nodes: [
          { id: "a:fn1", label: "myFunc", name: "myFunc", type: "function", category: "HANDLER" },
        ],
        relationships: [],
        context: "Test context",
      });

    // In test env the dynamic import may fail → 503, or succeed → 200
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("summary");
      expect(res.body).toHaveProperty("keyEntities");
      expect(res.body).toHaveProperty("concerns");
    }
  });
});
