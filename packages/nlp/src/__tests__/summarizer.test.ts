import { describe, it, expect, beforeEach, vi } from "vitest";
import { summarizeSubgraph, summarizeRuleBased } from "../summarizer.js";
import type { SummarizeRequest } from "../summarizer.js";

// Mock the Anthropic SDK so summarizeSubgraph falls through to rule-based
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: vi.fn() },
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("summarizeRuleBased", () => {
  it("should summarize a simple linear flow (UI -> API_CALLER -> API_ENDPOINT -> DB_CALL)", () => {
    const request: SummarizeRequest = {
      nodes: [
        { id: "frontend:UsersPage", label: "UsersPage", name: "UsersPage", type: "function", category: "UI_INTERACTION" },
        { id: "frontend:fetchUsers", label: "fetchUsers", name: "fetchUsers", type: "function", category: "API_CALLER" },
        { id: "backend:getUsers", label: "GET /api/users", name: "GET /api/users", type: "function", category: "API_ENDPOINT" },
        { id: "backend:queryUsersDB", label: "queryUsersDB", name: "queryUsersDB", type: "function", category: "DB_CALL" },
      ],
      relationships: [
        { type: "CALLS", sourceId: "frontend:UsersPage", targetId: "frontend:fetchUsers" },
        { type: "CALLS_API", sourceId: "frontend:fetchUsers", targetId: "backend:getUsers" },
        { type: "CALLS", sourceId: "backend:getUsers", targetId: "backend:queryUsersDB" },
      ],
    };

    const result = summarizeRuleBased(request);

    expect(result.summary).toContain("UsersPage");
    expect(result.summary).toContain("fetchUsers");
    expect(result.summary).toContain("GET /api/users");
    expect(result.summary).toContain("queryUsersDB");
    // Should mention multiple layers
    expect(result.summary).toContain("4 architectural layers");
    expect(result.summary).toContain("UI");
    expect(result.summary).toContain("Database");

    // Key entities should include endpoint, DB call, and UI interaction
    expect(result.keyEntities).toContain("GET /api/users");
    expect(result.keyEntities).toContain("queryUsersDB");
    expect(result.keyEntities).toContain("UsersPage");
  });

  it("should detect cross-repo edges", () => {
    const request: SummarizeRequest = {
      nodes: [
        { id: "frontend:fetchUsers", label: "fetchUsers", name: "fetchUsers", type: "function", category: "API_CALLER" },
        { id: "backend:getUsers", label: "getUsers", name: "getUsers", type: "function", category: "API_ENDPOINT" },
      ],
      relationships: [
        { type: "CALLS_API", sourceId: "frontend:fetchUsers", targetId: "backend:getUsers" },
      ],
    };

    const result = summarizeRuleBased(request);

    expect(result.concerns.length).toBeGreaterThan(0);
    expect(result.concerns[0]).toContain("repositories");
  });

  it("should list key entities (endpoints, DB tables)", () => {
    const request: SummarizeRequest = {
      nodes: [
        { id: "a:ep1", label: "GET /users", name: "GET /users", type: "function", category: "API_ENDPOINT" },
        { id: "a:db1", label: "selectUsers", name: "selectUsers", type: "function", category: "DB_CALL" },
        { id: "a:db2", label: "insertUser", name: "insertUser", type: "function", category: "DB_CALL" },
      ],
      relationships: [
        { type: "CALLS", sourceId: "a:ep1", targetId: "a:db1" },
        { type: "CALLS", sourceId: "a:ep1", targetId: "a:db2" },
      ],
    };

    const result = summarizeRuleBased(request);

    expect(result.keyEntities).toContain("GET /users");
    expect(result.keyEntities).toContain("selectUsers");
    expect(result.keyEntities).toContain("insertUser");
  });

  it("should handle empty subgraph", () => {
    const request: SummarizeRequest = {
      nodes: [],
      relationships: [],
    };

    const result = summarizeRuleBased(request);

    expect(result.summary).toBeDefined();
    expect(result.keyEntities).toEqual([]);
    expect(result.concerns).toEqual([]);
  });

  it("should include context string in summary", () => {
    const request: SummarizeRequest = {
      nodes: [
        { id: "a:fn1", label: "handleCheckout", name: "handleCheckout", type: "function", category: "HANDLER" },
      ],
      relationships: [],
      context: "This is a flow trace starting from handleCheckout",
    };

    const result = summarizeRuleBased(request);

    expect(result.summary).toContain("flow trace starting from handleCheckout");
  });

  it("should detect high fan-out concerns", () => {
    const nodes = [
      { id: "a:hub", label: "hub", name: "hub", type: "function", category: "HANDLER" },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `a:target${i}`,
        label: `target${i}`,
        name: `target${i}`,
        type: "function",
        category: "UTILITY" as string,
      })),
    ];

    const relationships = Array.from({ length: 6 }, (_, i) => ({
      type: "CALLS",
      sourceId: "a:hub",
      targetId: `a:target${i}`,
    }));

    const result = summarizeRuleBased({ nodes, relationships });

    expect(result.concerns.some((c) => c.includes("fan-out"))).toBe(true);
    expect(result.concerns.some((c) => c.includes("hub"))).toBe(true);
  });
});

describe("summarizeSubgraph", () => {
  it("should return empty-subgraph response for no nodes", async () => {
    const result = await summarizeSubgraph({
      nodes: [],
      relationships: [],
    });

    expect(result.summary).toContain("Empty subgraph");
    expect(result.keyEntities).toEqual([]);
    expect(result.concerns).toEqual([]);
  });

  it("should fall back to rule-based when no API key is available", async () => {
    const result = await summarizeSubgraph({
      nodes: [
        { id: "a:fn", label: "myFunc", name: "myFunc", type: "function", category: "HANDLER" },
      ],
      relationships: [],
    });

    // Should still produce a valid result via rule-based path
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
