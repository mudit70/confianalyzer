import { describe, it, expect } from "vitest";
import { categorizeFunction } from "../categorizer.js";
import type { FunctionIR } from "../types.js";

function makeFunc(overrides: Partial<FunctionIR> = {}): FunctionIR {
  return {
    kind: "function",
    name: "testFunc",
    qualifiedName: null,
    signature: "function testFunc(): void",
    parameters: [],
    returnType: "void",
    isExported: false,
    isAsync: false,
    location: { startLine: 1, endLine: 10, startColumn: 0, endColumn: 0 },
    ...overrides,
  };
}

describe("categorizeFunction", () => {
  it("returns API_ENDPOINT when endpointInfo is set", () => {
    const func = makeFunc({
      endpointInfo: { method: "GET", path: "/api/users" },
    });
    expect(categorizeFunction(func)).toBe("API_ENDPOINT");
  });

  it("returns API_CALLER when enrichments contain httpCall", () => {
    const func = makeFunc({
      enrichments: [
        {
          pluginName: "http-detector",
          route: null,
          dbOperation: null,
          httpCall: { method: "GET", urlPattern: "/api/users" },
          renders: null,
          middlewareOrder: null,
          suggestedCategory: null,
        },
      ],
    });
    expect(categorizeFunction(func)).toBe("API_CALLER");
  });

  it("returns DB_CALL when enrichments contain dbOperation", () => {
    const func = makeFunc({
      enrichments: [
        {
          pluginName: "db-detector",
          route: null,
          dbOperation: { table: "users", operation: "read" },
          httpCall: null,
          renders: null,
          middlewareOrder: null,
          suggestedCategory: null,
        },
      ],
    });
    expect(categorizeFunction(func)).toBe("DB_CALL");
  });

  it("returns UI_INTERACTION when enrichments contain renders", () => {
    const func = makeFunc({
      enrichments: [
        {
          pluginName: "react-detector",
          route: null,
          dbOperation: null,
          httpCall: null,
          renders: ["UserList", "Header"],
          middlewareOrder: null,
          suggestedCategory: null,
        },
      ],
    });
    expect(categorizeFunction(func)).toBe("UI_INTERACTION");
  });

  it("returns UTILITY as fallback", () => {
    const func = makeFunc();
    expect(categorizeFunction(func)).toBe("UTILITY");
  });

  it("uses suggestedCategory over heuristics", () => {
    const func = makeFunc({
      endpointInfo: { method: "GET", path: "/api/users" },
      enrichments: [
        {
          pluginName: "custom",
          route: null,
          dbOperation: null,
          httpCall: null,
          renders: null,
          middlewareOrder: null,
          suggestedCategory: "HANDLER",
        },
      ],
    });
    // suggestedCategory = HANDLER should win over endpointInfo -> API_ENDPOINT
    expect(categorizeFunction(func)).toBe("HANDLER");
  });
});
