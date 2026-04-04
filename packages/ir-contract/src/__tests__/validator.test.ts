import { describe, it, expect } from "vitest";
import { validateIrDocument } from "../validator.js";
import type { IrDocument } from "../types.js";

function makeMinimalDocument(overrides?: Partial<IrDocument>): IrDocument {
  return {
    $schema: "confianalyzer-ir-v1",
    version: "1.0.0",
    generatedAt: "2026-03-30T00:00:00Z",
    analyzer: {
      name: "test-analyzer",
      version: "0.1.0",
      language: "typescript",
    },
    repository: {
      name: "test-repo",
      rootPath: "/tmp/test-repo",
    },
    files: [],
    ...overrides,
  };
}

function makeDocumentWithFile(): IrDocument {
  return {
    ...makeMinimalDocument(),
    files: [
      {
        path: "/tmp/test-repo/src/index.ts",
        relativePath: "src/index.ts",
        language: "typescript",
        size: 256,
        hash: "abc123",
        functions: [
          {
            kind: "function",
            name: "hello",
            qualifiedName: null,
            signature: "function hello(): void",
            parameters: [],
            returnType: "void",
            isExported: true,
            isAsync: false,
            location: { startLine: 1, endLine: 3, startColumn: 0, endColumn: 1 },
          },
        ],
        calls: [
          {
            kind: "call",
            callee: "console.log",
            receiver: "console",
            method: "log",
            argumentCount: 1,
            enclosingFunction: "hello",
            location: { startLine: 2, endLine: 2, startColumn: 2, endColumn: 25 },
          },
        ],
        imports: [
          {
            kind: "import",
            modulePath: "fs",
            resolvedPath: null,
            isExternal: true,
            symbols: [{ name: "readFile", alias: null }],
            defaultImport: null,
            namespaceImport: null,
            location: { startLine: 1, endLine: 1, startColumn: 0, endColumn: 30 },
          },
        ],
        exports: [
          {
            kind: "export",
            name: "hello",
            localName: "hello",
            isDefault: false,
            fromModule: null,
            location: { startLine: 1, endLine: 3, startColumn: 0, endColumn: 1 },
          },
        ],
        classes: [],
      },
    ],
  };
}

describe("validateIrDocument", () => {
  it("accepts a valid minimal IR document", () => {
    const result = validateIrDocument(makeMinimalDocument());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.document).not.toBeNull();
    expect(result.document!.$schema).toBe("confianalyzer-ir-v1");
  });

  it("accepts a valid document with files, functions, calls, imports, exports", () => {
    const result = validateIrDocument(makeDocumentWithFile());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.document!.files).toHaveLength(1);
  });

  it("rejects when required top-level fields are missing", () => {
    const result = validateIrDocument({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.document).toBeNull();
  });

  it("rejects an invalid $schema value", () => {
    const doc = makeMinimalDocument();
    const invalid = { ...doc, $schema: "wrong-schema" };
    const result = validateIrDocument(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("$schema"))).toBe(true);
  });

  it("rejects invalid types (string where number expected)", () => {
    const doc = makeDocumentWithFile();
    (doc.files[0] as Record<string, unknown>).size = "not-a-number";
    const result = validateIrDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("size"))).toBe(true);
  });

  it("rejects when analyzer is missing required fields", () => {
    const doc = makeMinimalDocument();
    (doc as Record<string, unknown>).analyzer = { name: "test" };
    const result = validateIrDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects when a function is missing required fields", () => {
    const doc = makeDocumentWithFile();
    (doc.files[0].functions[0] as Record<string, unknown>) = { kind: "function", name: "bad" };
    const result = validateIrDocument(doc);
    expect(result.valid).toBe(false);
  });

  it("rejects unknown fields at the top level (additionalProperties: false)", () => {
    const doc = makeMinimalDocument();
    const withExtra = { ...doc, unknownField: "surprise" };
    const result = validateIrDocument(withExtra);
    expect(result.valid).toBe(false);
  });
});
