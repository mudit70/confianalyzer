import { describe, it, expect } from "vitest";
import { stitchCrossLanguageApis, normalizePath } from "../stitcher.js";
import type { ApiCaller, ApiEndpoint } from "../types.js";

describe("normalizePath", () => {
  it("normalizes Express :id params", () => {
    const result = normalizePath("/api/users/:id");
    expect(result.normalized).toBe("api/users/{param}");
  });

  it("normalizes FastAPI {id} params", () => {
    const result = normalizePath("/api/users/{user_id}");
    expect(result.normalized).toBe("api/users/{param}");
  });

  it("normalizes Flask <id> params", () => {
    const result = normalizePath("/api/users/<id>");
    expect(result.normalized).toBe("api/users/{param}");
  });

  it("normalizes Flask <int:id> params", () => {
    const result = normalizePath("/api/users/<int:id>");
    expect(result.normalized).toBe("api/users/{param}");
  });

  it("normalizes Next.js [id] params", () => {
    const result = normalizePath("/api/users/[id]");
    expect(result.normalized).toBe("api/users/{param}");
  });

  it("strips URL host prefix", () => {
    const result = normalizePath("http://localhost:8000/api/users");
    expect(result.normalized).toBe("api/users");
  });
});

describe("stitchCrossLanguageApis", () => {
  it("matches exact paths with same HTTP method", () => {
    const callers: ApiCaller[] = [
      { functionId: "caller-1", httpMethod: "GET", urlPattern: "/api/users", repoName: "frontend" },
    ];
    const endpoints: ApiEndpoint[] = [
      { functionId: "endpoint-1", httpMethod: "GET", routePath: "/api/users", repoName: "backend" },
    ];

    const links = stitchCrossLanguageApis(callers, endpoints);

    expect(links).toHaveLength(1);
    expect(links[0].callerId).toBe("caller-1");
    expect(links[0].endpointId).toBe("endpoint-1");
    expect(links[0].matchConfidence).toBe("exact");
  });

  it("matches suffix paths (caller has base URL)", () => {
    const callers: ApiCaller[] = [
      { functionId: "caller-1", httpMethod: "GET", urlPattern: "http://localhost:8000/api/users", repoName: "frontend" },
    ];
    const endpoints: ApiEndpoint[] = [
      { functionId: "endpoint-1", httpMethod: "GET", routePath: "/api/users", repoName: "backend" },
    ];

    const links = stitchCrossLanguageApis(callers, endpoints);

    expect(links).toHaveLength(1);
    expect(links[0].matchConfidence).toBe("exact");
  });

  it("matches parameterized paths across frameworks", () => {
    const callers: ApiCaller[] = [
      { functionId: "caller-1", httpMethod: "GET", urlPattern: "/api/users/:id", repoName: "frontend" },
    ];
    const endpoints: ApiEndpoint[] = [
      { functionId: "endpoint-1", httpMethod: "GET", routePath: "/api/users/{user_id}", repoName: "backend" },
    ];

    const links = stitchCrossLanguageApis(callers, endpoints);

    expect(links).toHaveLength(1);
    expect(links[0].matchConfidence).toBe("exact");
  });

  it("matches version-stripped paths", () => {
    const callers: ApiCaller[] = [
      { functionId: "caller-1", httpMethod: "GET", urlPattern: "/v1/users", repoName: "frontend" },
    ];
    const endpoints: ApiEndpoint[] = [
      { functionId: "endpoint-1", httpMethod: "GET", routePath: "/v2/users", repoName: "backend" },
    ];

    const links = stitchCrossLanguageApis(callers, endpoints);

    expect(links).toHaveLength(1);
    expect(links[0].matchConfidence).toBe("version-stripped");
  });

  it("does not match when HTTP methods differ", () => {
    const callers: ApiCaller[] = [
      { functionId: "caller-1", httpMethod: "POST", urlPattern: "/api/users", repoName: "frontend" },
    ];
    const endpoints: ApiEndpoint[] = [
      { functionId: "endpoint-1", httpMethod: "GET", routePath: "/api/users", repoName: "backend" },
    ];

    const links = stitchCrossLanguageApis(callers, endpoints);

    expect(links).toHaveLength(0);
  });

  it("does not match completely different paths", () => {
    const callers: ApiCaller[] = [
      { functionId: "caller-1", httpMethod: "GET", urlPattern: "/api/users", repoName: "frontend" },
    ];
    const endpoints: ApiEndpoint[] = [
      { functionId: "endpoint-1", httpMethod: "GET", routePath: "/api/products", repoName: "backend" },
    ];

    const links = stitchCrossLanguageApis(callers, endpoints);

    expect(links).toHaveLength(0);
  });
});
