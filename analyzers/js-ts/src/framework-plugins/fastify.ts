import ts from "typescript";
import type { FrameworkPlugin, FunctionAnalysisResult } from "./index.js";
import type { CallIR, FunctionIR, Enrichment } from "../types.js";

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "options", "head", "all"]);

// Receivers that indicate a Fastify instance
const FASTIFY_RECEIVERS = /^(fastify|server|instance|app)$/i;
// Also match names containing "fastify" (e.g. fastifyInstance, myFastify)
const FASTIFY_PATTERN = /fastify/i;

function isFastifyReceiver(receiver: string): boolean {
  if (FASTIFY_RECEIVERS.test(receiver)) return true;
  if (FASTIFY_PATTERN.test(receiver)) return true;
  return false;
}

export function createFastifyPlugin(): FrameworkPlugin {
  return {
    name: "fastify",

    analyzeCall(
      call: CallIR,
      _node: ts.CallExpression,
      _sourceFile: ts.SourceFile,
    ): Enrichment | null {
      // Match patterns like fastify.get("/path", handler)
      if (!call.method || !HTTP_METHODS.has(call.method)) return null;
      if (!call.stringArgs || call.stringArgs.length === 0) return null;
      if (!call.receiver) return null;
      if (!isFastifyReceiver(call.receiver)) return null;

      const routePath = call.stringArgs[0];
      const httpMethod = call.method.toUpperCase();

      return {
        pluginName: "fastify",
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
      calls: CallIR[],
    ): FunctionAnalysisResult | null {
      for (const call of calls) {
        if (!call.method || !HTTP_METHODS.has(call.method)) continue;
        if (!call.receiver || !call.stringArgs || call.stringArgs.length === 0) continue;
        if (!isFastifyReceiver(call.receiver)) continue;

        if (call.enclosingFunction === func.name || call.enclosingFunction === func.qualifiedName) {
          const routePath = call.stringArgs[0];
          const httpMethod = call.method.toUpperCase();
          return {
            endpointInfo: { method: httpMethod, path: routePath },
            enrichment: {
              pluginName: "fastify",
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
