import ts from "typescript";
import type { FrameworkPlugin } from "./index.js";
import type { CallIR, Enrichment } from "../types.js";

// Prisma CRUD operations and their DB operation type
const READ_METHODS = new Set([
  "findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
]);
const WRITE_METHODS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
const DELETE_METHODS = new Set(["delete", "deleteMany"]);
const TRANSACTION_METHODS = new Set(["$transaction", "$queryRaw", "$executeRaw"]);

function classifyOperation(method: string): "read" | "write" | "delete" | "transaction" | null {
  if (READ_METHODS.has(method)) return "read";
  if (WRITE_METHODS.has(method)) return "write";
  if (DELETE_METHODS.has(method)) return "delete";
  if (TRANSACTION_METHODS.has(method)) return "transaction";
  return null;
}

/**
 * Extract model name from receiver like "prisma.user" or "this.prisma.project".
 * Returns the segment immediately after "prisma" or "db".
 */
function extractModelName(receiver: string): string | null {
  const parts = receiver.split(".");
  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i].toLowerCase();
    if ((lower === "prisma" || lower === "db") && i + 1 < parts.length) {
      return parts[i + 1];
    }
  }
  return null;
}

function isPrismaReceiver(receiver: string): boolean {
  return /\bprisma\b/i.test(receiver);
}

export function createPrismaPlugin(): FrameworkPlugin {
  return {
    name: "prisma",

    analyzeCall(
      call: CallIR,
      _node: ts.CallExpression,
      _sourceFile: ts.SourceFile,
    ): Enrichment | null {
      if (!call.receiver || !call.method) return null;
      if (!isPrismaReceiver(call.receiver)) return null;

      const operation = classifyOperation(call.method);
      if (!operation) return null;

      const modelName = extractModelName(call.receiver);
      // For $transaction/$queryRaw, model name may be null — use "prisma" as table
      const table = modelName ?? (operation === "transaction" ? "$transaction" : null);
      if (!table) return null;

      return {
        pluginName: "prisma",
        route: null,
        dbOperation: { table, operation },
        httpCall: null,
        renders: null,
        middlewareOrder: null,
        suggestedCategory: "DB_CALL",
      };
    },
  };
}
