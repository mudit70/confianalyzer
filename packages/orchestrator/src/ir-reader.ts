import * as fs from "node:fs";
import type { IrDocument } from "./types.js";

/**
 * Validate that an IR document has the required structure.
 */
function validateIrDocument(doc: IrDocument): void {
  if (!doc.analyzer || !doc.analyzer.name || !doc.analyzer.language) {
    throw new Error("IR document missing required analyzer metadata");
  }
  if (!doc.repository || !doc.repository.name) {
    throw new Error("IR document missing required repository metadata");
  }
  if (!Array.isArray(doc.files)) {
    throw new Error("IR document missing files array");
  }
  for (const file of doc.files) {
    if (!file.path || !file.relativePath) {
      throw new Error(`IR file entry missing path or relativePath`);
    }
    if (!Array.isArray(file.functions) || !Array.isArray(file.imports) || !Array.isArray(file.exports) || !Array.isArray(file.calls)) {
      throw new Error(`IR file "${file.path}" missing required arrays (functions, imports, exports, calls)`);
    }
  }
}

/**
 * Step 2: Read and validate IR JSON files from disk.
 * Returns a map of repoName -> IrDocument.
 */
export function readIrFiles(irPaths: Map<string, string>): Map<string, IrDocument> {
  const documents = new Map<string, IrDocument>();

  for (const [repoName, filePath] of irPaths) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const doc = JSON.parse(raw) as IrDocument;

    if (doc.$schema !== "confianalyzer-ir-v1") {
      throw new Error(`Unknown IR schema: ${doc.$schema} (expected "confianalyzer-ir-v1")`);
    }

    validateIrDocument(doc);
    documents.set(repoName, doc);
  }

  return documents;
}

/**
 * Read IR documents directly from pre-parsed objects (useful for testing / in-memory pipelines).
 */
export function readIrDocuments(documents: Map<string, IrDocument>): Map<string, IrDocument> {
  for (const [repoName, doc] of documents) {
    if (doc.$schema !== "confianalyzer-ir-v1") {
      throw new Error(`Unknown IR schema for repo "${repoName}": ${doc.$schema}`);
    }
    validateIrDocument(doc);
  }
  return documents;
}
