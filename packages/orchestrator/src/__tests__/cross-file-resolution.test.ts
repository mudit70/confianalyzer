import { describe, it, expect } from "vitest";
import { resolveCrossFileConnections } from "../cross-file-resolution.js";
import type { IrDocument } from "../types.js";

function makeDoc(files: IrDocument["files"]): IrDocument {
  return {
    $schema: "confianalyzer-ir-v1",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    analyzer: { name: "test", version: "1.0.0", language: "typescript" },
    repository: { name: "test-repo", rootPath: "/test" },
    files,
  };
}

function loc(line: number) {
  return { startLine: line, endLine: line, startColumn: 0, endColumn: 0 };
}

describe("resolveCrossFileConnections", () => {
  it("resolves a named import call from file A to file B", () => {
    const doc = makeDoc([
      {
        path: "/test/src/utils.ts",
        relativePath: "src/utils.ts",
        language: "typescript",
        size: 100,
        hash: "abc",
        functions: [
          {
            kind: "function",
            name: "helper",
            qualifiedName: null,
            signature: "function helper(): void",
            parameters: [],
            returnType: "void",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [],
        imports: [],
        exports: [
          { kind: "export", name: "helper", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
      {
        path: "/test/src/main.ts",
        relativePath: "src/main.ts",
        language: "typescript",
        size: 200,
        hash: "def",
        functions: [
          {
            kind: "function",
            name: "run",
            qualifiedName: null,
            signature: "function run(): void",
            parameters: [],
            returnType: "void",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [
          {
            kind: "call",
            callee: "helper",
            receiver: null,
            method: null,
            argumentCount: 0,
            enclosingFunction: "run",
            location: loc(5),
          },
        ],
        imports: [
          {
            kind: "import",
            modulePath: "./utils",
            resolvedPath: "src/utils.ts",
            isExternal: false,
            symbols: [{ name: "helper", alias: null }],
            defaultImport: null,
            namespaceImport: null,
            location: loc(1),
          },
        ],
        exports: [
          { kind: "export", name: "run", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
    ]);

    const irDocs = new Map([["test-repo", doc]]);
    const calls = resolveCrossFileConnections(irDocs);

    expect(calls).toHaveLength(1);
    expect(calls[0].callerId).toBe("test-repo::src/main.ts::run");
    expect(calls[0].targetId).toBe("test-repo::src/utils.ts::helper");
    expect(calls[0].callSite).toBe(5);
  });

  it("resolves a default import", () => {
    const doc = makeDoc([
      {
        path: "/test/src/db.ts",
        relativePath: "src/db.ts",
        language: "typescript",
        size: 100,
        hash: "abc",
        functions: [
          {
            kind: "function",
            name: "createConnection",
            qualifiedName: null,
            signature: "function createConnection(): Connection",
            parameters: [],
            returnType: "Connection",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [],
        imports: [],
        exports: [
          { kind: "export", name: "createConnection", localName: null, isDefault: true, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
      {
        path: "/test/src/app.ts",
        relativePath: "src/app.ts",
        language: "typescript",
        size: 200,
        hash: "def",
        functions: [
          {
            kind: "function",
            name: "init",
            qualifiedName: null,
            signature: "function init(): void",
            parameters: [],
            returnType: "void",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [
          {
            kind: "call",
            callee: "initDb",
            receiver: null,
            method: null,
            argumentCount: 0,
            enclosingFunction: "init",
            location: loc(3),
          },
        ],
        imports: [
          {
            kind: "import",
            modulePath: "./db",
            resolvedPath: "src/db.ts",
            isExternal: false,
            symbols: [],
            defaultImport: "initDb",
            namespaceImport: null,
            location: loc(1),
          },
        ],
        exports: [
          { kind: "export", name: "init", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
    ]);

    const irDocs = new Map([["test-repo", doc]]);
    const calls = resolveCrossFileConnections(irDocs);

    expect(calls).toHaveLength(1);
    expect(calls[0].callerId).toBe("test-repo::src/app.ts::init");
    expect(calls[0].targetId).toBe("test-repo::src/db.ts::createConnection");
    expect(calls[0].callSite).toBe(3);
  });

  it("resolves a namespace import with member access", () => {
    const doc = makeDoc([
      {
        path: "/test/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript",
        size: 100,
        hash: "abc",
        functions: [
          {
            kind: "function",
            name: "add",
            qualifiedName: null,
            signature: "function add(a: number, b: number): number",
            parameters: [],
            returnType: "number",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [],
        imports: [],
        exports: [
          { kind: "export", name: "add", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
      {
        path: "/test/src/calc.ts",
        relativePath: "src/calc.ts",
        language: "typescript",
        size: 200,
        hash: "def",
        functions: [
          {
            kind: "function",
            name: "calculate",
            qualifiedName: null,
            signature: "function calculate(): number",
            parameters: [],
            returnType: "number",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [
          {
            kind: "call",
            callee: "MathUtils.add",
            receiver: "MathUtils",
            method: "add",
            argumentCount: 2,
            enclosingFunction: "calculate",
            location: loc(4),
          },
        ],
        imports: [
          {
            kind: "import",
            modulePath: "./math",
            resolvedPath: "src/math.ts",
            isExternal: false,
            symbols: [],
            defaultImport: null,
            namespaceImport: "MathUtils",
            location: loc(1),
          },
        ],
        exports: [
          { kind: "export", name: "calculate", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
    ]);

    const irDocs = new Map([["test-repo", doc]]);
    const calls = resolveCrossFileConnections(irDocs);

    expect(calls).toHaveLength(1);
    expect(calls[0].callerId).toBe("test-repo::src/calc.ts::calculate");
    expect(calls[0].targetId).toBe("test-repo::src/math.ts::add");
    expect(calls[0].callSite).toBe(4);
  });

  it("does not create edges for unresolved external calls", () => {
    const doc = makeDoc([
      {
        path: "/test/src/main.ts",
        relativePath: "src/main.ts",
        language: "typescript",
        size: 200,
        hash: "def",
        functions: [
          {
            kind: "function",
            name: "run",
            qualifiedName: null,
            signature: "function run(): void",
            parameters: [],
            returnType: "void",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [
          {
            kind: "call",
            callee: "console.log",
            receiver: "console",
            method: "log",
            argumentCount: 1,
            enclosingFunction: "run",
            location: loc(3),
          },
          {
            kind: "call",
            callee: "unknownFunction",
            receiver: null,
            method: null,
            argumentCount: 0,
            enclosingFunction: "run",
            location: loc(4),
          },
        ],
        imports: [
          {
            kind: "import",
            modulePath: "lodash",
            resolvedPath: null,
            isExternal: true,
            symbols: [{ name: "map", alias: null }],
            defaultImport: null,
            namespaceImport: null,
            location: loc(1),
          },
        ],
        exports: [
          { kind: "export", name: "run", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
    ]);

    const irDocs = new Map([["test-repo", doc]]);
    const calls = resolveCrossFileConnections(irDocs);

    expect(calls).toHaveLength(0);
  });

  it("resolves import with absolute resolvedPath matching a file indexed by relativePath", () => {
    const doc: IrDocument = {
      $schema: "confianalyzer-ir-v1",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      analyzer: { name: "test", version: "1.0.0", language: "typescript" },
      repository: { name: "test-repo", rootPath: "/Users/foo/project" },
      files: [
        {
          path: "/Users/foo/project/src/utils.ts",
          relativePath: "src/utils.ts",
          language: "typescript",
          size: 100,
          hash: "abc",
          functions: [
            {
              kind: "function",
              name: "helper",
              qualifiedName: null,
              signature: "function helper(): void",
              parameters: [],
              returnType: "void",
              isExported: true,
              isAsync: false,
              location: loc(1),
            },
          ],
          calls: [],
          imports: [],
          exports: [
            { kind: "export", name: "helper", localName: null, isDefault: false, fromModule: null, location: loc(1) },
          ],
          classes: [],
        },
        {
          path: "/Users/foo/project/src/main.ts",
          relativePath: "src/main.ts",
          language: "typescript",
          size: 200,
          hash: "def",
          functions: [
            {
              kind: "function",
              name: "run",
              qualifiedName: null,
              signature: "function run(): void",
              parameters: [],
              returnType: "void",
              isExported: true,
              isAsync: false,
              location: loc(1),
            },
          ],
          calls: [
            {
              kind: "call",
              callee: "helper",
              receiver: null,
              method: null,
              argumentCount: 0,
              enclosingFunction: "run",
              location: loc(5),
            },
          ],
          imports: [
            {
              kind: "import",
              modulePath: "./utils",
              resolvedPath: "/Users/foo/project/src/utils.ts",
              isExternal: false,
              symbols: [{ name: "helper", alias: null }],
              defaultImport: null,
              namespaceImport: null,
              location: loc(1),
            },
          ],
          exports: [
            { kind: "export", name: "run", localName: null, isDefault: false, fromModule: null, location: loc(1) },
          ],
          classes: [],
        },
      ],
    };

    const irDocs = new Map([["test-repo", doc]]);
    const calls = resolveCrossFileConnections(irDocs);

    expect(calls).toHaveLength(1);
    expect(calls[0].callerId).toBe("test-repo::src/main.ts::run");
    expect(calls[0].targetId).toBe("test-repo::src/utils.ts::helper");
    expect(calls[0].callSite).toBe(5);
  });

  it("resolves import with relative modulePath when resolvedPath is absent", () => {
    const doc = makeDoc([
      {
        path: "/test/src/lib/format.ts",
        relativePath: "src/lib/format.ts",
        language: "typescript",
        size: 100,
        hash: "abc",
        functions: [
          {
            kind: "function",
            name: "formatDate",
            qualifiedName: null,
            signature: "function formatDate(): string",
            parameters: [],
            returnType: "string",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [],
        imports: [],
        exports: [
          { kind: "export", name: "formatDate", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
      {
        path: "/test/src/app.ts",
        relativePath: "src/app.ts",
        language: "typescript",
        size: 200,
        hash: "def",
        functions: [
          {
            kind: "function",
            name: "render",
            qualifiedName: null,
            signature: "function render(): void",
            parameters: [],
            returnType: "void",
            isExported: true,
            isAsync: false,
            location: loc(1),
          },
        ],
        calls: [
          {
            kind: "call",
            callee: "formatDate",
            receiver: null,
            method: null,
            argumentCount: 0,
            enclosingFunction: "render",
            location: loc(3),
          },
        ],
        imports: [
          {
            kind: "import",
            modulePath: "./lib/format",
            resolvedPath: null,
            isExternal: false,
            symbols: [{ name: "formatDate", alias: null }],
            defaultImport: null,
            namespaceImport: null,
            location: loc(1),
          },
        ],
        exports: [
          { kind: "export", name: "render", localName: null, isDefault: false, fromModule: null, location: loc(1) },
        ],
        classes: [],
      },
    ]);

    const irDocs = new Map([["test-repo", doc]]);
    const calls = resolveCrossFileConnections(irDocs);

    expect(calls).toHaveLength(1);
    expect(calls[0].callerId).toBe("test-repo::src/app.ts::render");
    expect(calls[0].targetId).toBe("test-repo::src/lib/format.ts::formatDate");
    expect(calls[0].callSite).toBe(3);
  });
});
