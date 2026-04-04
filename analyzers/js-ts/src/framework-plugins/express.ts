import ts from "typescript";
import type { FrameworkPlugin, FunctionAnalysisResult } from "./index.js";
import type { CallIR, FunctionIR, Enrichment } from "../types.js";

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "options", "head", "all"]);

// Receivers that indicate an Express app or router instance
const EXPRESS_RECEIVER_EXACT = new Set(["app", "router", "server", "express"]);
// Patterns that should NOT be treated as Express receivers (HTTP clients, etc.)
const NON_EXPRESS_RECEIVERS = /^(apiclient|client|axios|http|https|fetch|request|instance|got|superagent|ky)$/i;

function isExpressReceiver(receiver: string): boolean {
  // Reject known HTTP client receivers first
  if (NON_EXPRESS_RECEIVERS.test(receiver)) return false;
  // Accept exact known Express identifiers
  const lower = receiver.toLowerCase();
  if (EXPRESS_RECEIVER_EXACT.has(lower)) return true;
  // Accept if the name contains app, router, or server (e.g. myApp, expressRouter, httpServer)
  if (/app|router|server/i.test(lower)) return true;
  return false;
}

export function createExpressPlugin(): FrameworkPlugin {
  // Track endpoint info discovered from calls so we can attach to the enclosing function
  const endpointsByFunction = new Map<string, { method: string; path: string }>();

  return {
    name: "express",

    analyzeCall(
      call: CallIR,
      node: ts.CallExpression,
      sourceFile: ts.SourceFile
    ): Enrichment | null {
      // Match patterns like app.get("/path", handler), router.post("/path", handler)
      if (!call.method || !HTTP_METHODS.has(call.method)) return null;
      if (!call.stringArgs || call.stringArgs.length === 0) return null;

      // The receiver should be something like "app", "router", etc.
      if (!call.receiver) return null;
      if (!isExpressReceiver(call.receiver)) return null;

      const routePath = call.stringArgs[0];
      const httpMethod = call.method.toUpperCase();

      // Track for function enrichment
      if (call.enclosingFunction) {
        endpointsByFunction.set(call.enclosingFunction, { method: httpMethod, path: routePath });
      }

      return {
        pluginName: "express",
        route: { method: httpMethod, path: routePath },
        dbOperation: null,
        httpCall: null,
        renders: null,
        middlewareOrder: null,
        suggestedCategory: "API_ENDPOINT",
      };
    },

    analyzeFunction(
      func: FunctionIR,
      _node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
      _sourceFile: ts.SourceFile,
      calls: CallIR[]
    ): FunctionAnalysisResult | null {
      // Check if any call within this function registered an endpoint
      // Look for calls that are directly in this function and match express route patterns
      for (const call of calls) {
        if (!call.method || !HTTP_METHODS.has(call.method)) continue;
        if (!call.receiver || !call.stringArgs || call.stringArgs.length === 0) continue;
        if (!isExpressReceiver(call.receiver)) continue;

        // Check if one of the handler arguments references this function, or if
        // this function is the enclosing function
        if (call.enclosingFunction === func.name || call.enclosingFunction === func.qualifiedName) {
          const routePath = call.stringArgs[0];
          const httpMethod = call.method.toUpperCase();
          return {
            endpointInfo: { method: httpMethod, path: routePath },
            enrichment: {
              pluginName: "express",
              route: { method: httpMethod, path: routePath },
              dbOperation: null,
              httpCall: null,
              renders: null,
              middlewareOrder: null,
              suggestedCategory: "API_ENDPOINT",
            },
          };
        }
      }

      return null;
    },
  };
}
