import ts from "typescript";
import type { FrameworkPlugin } from "./index.js";
import type { CallIR, Enrichment } from "../types.js";

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "head", "options", "request"]);

export function createAxiosPlugin(): FrameworkPlugin {
  return {
    name: "axios",

    analyzeCall(
      call: CallIR,
      _node: ts.CallExpression,
      _sourceFile: ts.SourceFile
    ): Enrichment | null {
      // Match patterns like axios.get("/url"), apiClient.post("/url"), http.delete("/url")
      if (!call.method || !HTTP_METHODS.has(call.method)) return null;
      if (!call.receiver) return null;
      if (!call.stringArgs || call.stringArgs.length === 0) return null;

      // Heuristic: the receiver name or the receiver's import should be axios-like
      // We accept any receiver with http methods since it's a common pattern
      const urlPattern = call.stringArgs[0];
      const method = call.method.toUpperCase();

      return {
        pluginName: "axios",
        route: null,
        dbOperation: null,
        httpCall: { method, urlPattern },
        renders: null,
        middlewareOrder: null,
        suggestedCategory: "API_CALLER",
      };
    },
  };
}
