import { describe, it, expect } from "vitest";
import type {
  ProjectSummary,
  GraphData,
  GraphNode,
  GraphEdge,
  FlowPath,
  NlpQueryResult,
  FunctionResult,
  EndpointResult,
  NodeType,
  EdgeType,
  FunctionCategory,
} from "../types/graph";
import { CATEGORY_COLORS, NODE_TYPE_COLORS } from "../types/graph";

describe("graph types", () => {
  it("CATEGORY_COLORS covers all function categories", () => {
    const categories: FunctionCategory[] = [
      "UI_INTERACTION",
      "HANDLER",
      "API_CALLER",
      "API_ENDPOINT",
      "DB_CALL",
      "UTILITY",
    ];
    for (const cat of categories) {
      expect(CATEGORY_COLORS[cat]).toBeDefined();
      expect(typeof CATEGORY_COLORS[cat]).toBe("string");
    }
  });

  it("NODE_TYPE_COLORS covers all node types", () => {
    const nodeTypes: NodeType[] = ["function", "file", "repository", "endpoint", "dbtable"];
    for (const t of nodeTypes) {
      expect(NODE_TYPE_COLORS[t]).toBeDefined();
    }
  });

  it("can construct a valid ProjectSummary", () => {
    const summary: ProjectSummary = {
      name: "test-project",
      repositoryCount: 2,
      fileCount: 10,
      functionCount: 50,
      endpointCount: 5,
      dbTableCount: 3,
      categoryCounts: { UTILITY: 30, API_ENDPOINT: 5 },
      repositories: [
        { name: "repo-a", language: "TypeScript", fileCount: 6, functionCount: 30 },
      ],
    };
    expect(summary.name).toBe("test-project");
    expect(summary.repositories).toHaveLength(1);
  });

  it("can construct valid GraphData", () => {
    const node: GraphNode = {
      id: "n1",
      label: "myFunc",
      type: "function",
      category: "UTILITY",
      metadata: { signature: "myFunc()" },
    };
    const edge: GraphEdge = {
      id: "e1",
      source: "n1",
      target: "n2",
      type: "CALLS",
      properties: { callSite: 42 },
    };
    const data: GraphData = { nodes: [node], edges: [edge] };
    expect(data.nodes).toHaveLength(1);
    expect(data.edges[0].type).toBe("CALLS");
  });

  it("can construct a FlowPath", () => {
    const flow: FlowPath = {
      nodes: [
        { id: "a", label: "onClick", type: "function", category: "UI_INTERACTION", metadata: {} },
        { id: "b", label: "fetchData", type: "function", category: "API_CALLER", metadata: {} },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", type: "CALLS", properties: {} },
      ],
      depth: 1,
    };
    expect(flow.depth).toBe(1);
    expect(flow.nodes).toHaveLength(2);
  });

  it("can construct an NlpQueryResult", () => {
    const result: NlpQueryResult = {
      question: "What functions call the database?",
      cypher: "MATCH (f:Function)-[:READS]->(t:DBTable) RETURN f.name, t.name",
      explanation: "Functions that read from database tables",
      results: [{ "f.name": "getUser", "t.name": "users" }],
    };
    expect(result.cypher).toContain("MATCH");
  });

  it("EdgeType includes all relationship types from schema", () => {
    const edgeTypes: EdgeType[] = [
      "CALLS",
      "DEFINED_IN",
      "IMPORTS",
      "EXPOSES",
      "CALLS_API",
      "READS",
      "WRITES",
    ];
    expect(edgeTypes).toHaveLength(7);
  });

  it("can construct FunctionResult and EndpointResult", () => {
    const fn: FunctionResult = {
      id: "f1",
      name: "handleLogin",
      signature: "handleLogin(req, res)",
      category: "API_ENDPOINT",
      filePath: "src/auth.ts",
      repoName: "backend",
      startLine: 10,
      endLine: 25,
    };
    expect(fn.category).toBe("API_ENDPOINT");

    const ep: EndpointResult = {
      id: "ep1",
      method: "POST",
      path: "/login",
      fullRoute: "/api/v1/login",
      handlerName: "handleLogin",
      repoName: "backend",
    };
    expect(ep.method).toBe("POST");
  });
});
