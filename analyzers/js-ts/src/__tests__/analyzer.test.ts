import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import ts from "typescript";
import { walkFile } from "../ast-walker.js";
import { createDefaultPlugins } from "../framework-plugins/index.js";
import { analyzeRepository } from "../analyzer.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "confianalyzer-test-"));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function parseAndWalk(code: string, fileName = "test.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.ESNext,
    true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React,
    allowJs: true,
  };

  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile;
  host.getSourceFile = (name, languageVersion) => {
    if (name === fileName) return sourceFile;
    return originalGetSourceFile.call(host, name, languageVersion);
  };

  const program = ts.createProgram([fileName], compilerOptions, host);
  const plugins = createDefaultPlugins();

  return walkFile(sourceFile, program, plugins);
}

describe("AST Walker", () => {
  describe("Basic function extraction", () => {
    it("should extract function declarations", () => {
      const result = parseAndWalk(`
        function greet(name: string): string {
          return "hello " + name;
        }

        export async function fetchData(url: string, retries: number = 3): Promise<any> {
          return fetch(url);
        }

        const add = (a: number, b: number): number => a + b;
      `);

      expect(result.functions).toHaveLength(3);

      const greet = result.functions.find((f) => f.name === "greet");
      expect(greet).toBeDefined();
      expect(greet!.kind).toBe("function");
      expect(greet!.isAsync).toBe(false);
      expect(greet!.isExported).toBe(false);
      expect(greet!.returnType).toBe("string");
      expect(greet!.parameters).toHaveLength(1);
      expect(greet!.parameters[0].name).toBe("name");
      expect(greet!.parameters[0].typeAnnotation).toBe("string");

      const fetchData = result.functions.find((f) => f.name === "fetchData");
      expect(fetchData).toBeDefined();
      expect(fetchData!.isAsync).toBe(true);
      expect(fetchData!.isExported).toBe(true);
      expect(fetchData!.parameters).toHaveLength(2);
      expect(fetchData!.parameters[1].hasDefault).toBe(true);

      const add = result.functions.find((f) => f.name === "add");
      expect(add).toBeDefined();
      expect(add!.parameters).toHaveLength(2);
    });

    it("should extract rest parameters", () => {
      const result = parseAndWalk(`
        function log(...messages: string[]): void {}
      `);

      expect(result.functions[0].parameters[0].isRest).toBe(true);
    });
  });

  describe("Class extraction", () => {
    it("should extract classes with methods", () => {
      const result = parseAndWalk(`
        export abstract class BaseService {
          protected name: string;

          constructor(name: string) {
            this.name = name;
          }

          public async getData(): Promise<string> {
            return this.name;
          }

          private static helper(): void {}
        }

        class UserService extends BaseService implements Serializable {
          getUser(id: number): User {
            return {} as User;
          }
        }
      `);

      expect(result.classes).toHaveLength(2);

      const baseService = result.classes.find((c) => c.name === "BaseService");
      expect(baseService).toBeDefined();
      expect(baseService!.isAbstract).toBe(true);
      expect(baseService!.isExported).toBe(true);
      expect(baseService!.superClass).toBeNull();
      expect(baseService!.methods).toContain("constructor");
      expect(baseService!.methods).toContain("getData");
      expect(baseService!.methods).toContain("helper");

      const userService = result.classes.find((c) => c.name === "UserService");
      expect(userService).toBeDefined();
      expect(userService!.superClass).toBe("BaseService");
      expect(userService!.implements).toContain("Serializable");
      expect(userService!.isExported).toBe(false);

      // Check method FunctionIR details
      const getData = result.functions.find((f) => f.name === "getData");
      expect(getData).toBeDefined();
      expect(getData!.qualifiedName).toBe("BaseService.getData");
      expect(getData!.isAsync).toBe(true);
      expect(getData!.accessibility).toBe("public");

      const helper = result.functions.find((f) => f.name === "helper");
      expect(helper).toBeDefined();
      expect(helper!.isStatic).toBe(true);
      expect(helper!.accessibility).toBe("private");
    });
  });

  describe("Import/Export extraction", () => {
    it("should extract all import types", () => {
      const result = parseAndWalk(`
        import React from "react";
        import { useState, useEffect as effect } from "react";
        import * as path from "path";
        import type { FC } from "react";
      `);

      expect(result.imports.length).toBeGreaterThanOrEqual(3);

      const reactDefault = result.imports.find(
        (i) => i.modulePath === "react" && i.defaultImport === "React"
      );
      expect(reactDefault).toBeDefined();
      expect(reactDefault!.isExternal).toBe(true);

      const reactNamed = result.imports.find(
        (i) => i.modulePath === "react" && i.symbols.length > 0
      );
      expect(reactNamed).toBeDefined();
      const useStateSymbol = reactNamed!.symbols.find((s) => s.name === "useState");
      expect(useStateSymbol).toBeDefined();
      const effectSymbol = reactNamed!.symbols.find((s) => s.name === "useEffect");
      expect(effectSymbol).toBeDefined();
      expect(effectSymbol!.alias).toBe("effect");

      const pathImport = result.imports.find((i) => i.modulePath === "path");
      expect(pathImport).toBeDefined();
      expect(pathImport!.namespaceImport).toBe("path");
    });

    it("should extract require statements", () => {
      const result = parseAndWalk(`
        const express = require("express");
      `);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].modulePath).toBe("express");
      expect(result.imports[0].namespaceImport).toBe("express");
      expect(result.imports[0].isExternal).toBe(true);
    });

    it("should extract export declarations", () => {
      const result = parseAndWalk(`
        export function foo() {}
        export const bar = () => {};
        export { foo as baz } from "./other";
        export default function main() {}
      `);

      const fooExport = result.exports.find((e) => e.name === "foo" && !e.fromModule);
      expect(fooExport).toBeDefined();
      expect(fooExport!.isDefault).toBe(false);

      const barExport = result.exports.find((e) => e.name === "bar");
      expect(barExport).toBeDefined();

      const reExport = result.exports.find((e) => e.name === "baz");
      expect(reExport).toBeDefined();
      expect(reExport!.localName).toBe("foo");
      expect(reExport!.fromModule).toBe("./other");

      const defaultExport = result.exports.find((e) => e.name === "main");
      expect(defaultExport).toBeDefined();
      expect(defaultExport!.isDefault).toBe(true);
    });
  });

  describe("Call extraction with stringArgs", () => {
    it("should extract calls with receivers, methods, and string args", () => {
      const result = parseAndWalk(`
        function setup() {
          console.log("hello", "world");
          fetch("/api/users");
          db.query("SELECT * FROM users");
          nested.deep.method("arg1", someVar, "arg2");
        }
      `);

      const logCall = result.calls.find((c) => c.callee === 'console.log');
      expect(logCall).toBeDefined();
      expect(logCall!.receiver).toBe("console");
      expect(logCall!.method).toBe("log");
      expect(logCall!.stringArgs).toEqual(["hello", "world"]);
      expect(logCall!.argumentCount).toBe(2);
      expect(logCall!.enclosingFunction).toBe("setup");

      const fetchCall = result.calls.find((c) => c.callee === "fetch");
      expect(fetchCall).toBeDefined();
      expect(fetchCall!.receiver).toBeNull();
      expect(fetchCall!.method).toBeNull();
      expect(fetchCall!.stringArgs).toEqual(["/api/users"]);

      const queryCall = result.calls.find((c) => c.method === "query");
      expect(queryCall).toBeDefined();
      expect(queryCall!.receiver).toBe("db");
      expect(queryCall!.stringArgs).toEqual(["SELECT * FROM users"]);

      const deepCall = result.calls.find((c) => c.method === "method");
      expect(deepCall).toBeDefined();
      expect(deepCall!.stringArgs).toEqual(["arg1", "arg2"]);
      expect(deepCall!.argumentRefs).toEqual(["someVar"]);
      expect(deepCall!.argumentCount).toBe(3);
    });
  });

  describe("Express route detection", () => {
    it("should detect express routes and set endpointInfo", () => {
      const result = parseAndWalk(`
        function setupRoutes() {
          app.get("/users", getUsers);
          router.post("/users/:id", createUser);
        }
      `);

      // The calls should have express enrichments
      const getCall = result.calls.find(
        (c) => c.method === "get" && c.stringArgs?.includes("/users")
      );
      expect(getCall).toBeDefined();
      expect(getCall!.enrichments).toBeDefined();
      expect(getCall!.enrichments![0].pluginName).toBe("express");
      expect(getCall!.enrichments![0].route).toEqual({ method: "GET", path: "/users" });
      expect(getCall!.enrichments![0].suggestedCategory).toBe("API_ENDPOINT");

      const postCall = result.calls.find(
        (c) => c.method === "post" && c.stringArgs?.includes("/users/:id")
      );
      expect(postCall).toBeDefined();
      expect(postCall!.enrichments![0].route).toEqual({ method: "POST", path: "/users/:id" });

      // The enclosing function should get endpointInfo
      const setupFn = result.functions.find((f) => f.name === "setupRoutes");
      expect(setupFn).toBeDefined();
      expect(setupFn!.endpointInfo).toBeDefined();
      expect(setupFn!.endpointInfo!.method).toBe("GET");
    });
  });

  describe("React component detection", () => {
    it("should detect JSX component renders", () => {
      const result = parseAndWalk(
        `
        function App() {
          return (
            <div>
              <Header title="hello" />
              <UserList />
              <footer />
            </div>
          );
        }
      `,
        "test.tsx"
      );

      const appFn = result.functions.find((f) => f.name === "App");
      expect(appFn).toBeDefined();
      expect(appFn!.enrichments).toBeDefined();
      const reactEnrichment = appFn!.enrichments!.find((e) => e.pluginName === "react");
      expect(reactEnrichment).toBeDefined();
      expect(reactEnrichment!.renders).toContain("Header");
      expect(reactEnrichment!.renders).toContain("UserList");
      // "footer" and "div" are lowercase HTML elements, should NOT be included
      expect(reactEnrichment!.renders).not.toContain("footer");
      expect(reactEnrichment!.renders).not.toContain("div");
      expect(reactEnrichment!.suggestedCategory).toBe("UI_INTERACTION");
    });
  });

  describe("Express false positive avoidance", () => {
    it("should NOT detect apiClient.get as an Express route", () => {
      const result = parseAndWalk(`
        function fetchUsers() {
          apiClient.get("/api/users");
          client.post("/api/orders", data);
          axios.get("/api/items");
          http.delete("/api/items/1");
        }
      `);

      // None of these calls should have an express enrichment
      for (const call of result.calls) {
        const expressEnrichment = call.enrichments?.find((e) => e.pluginName === "express");
        expect(expressEnrichment).toBeUndefined();
      }

      // The function should NOT get endpointInfo from these non-Express calls
      const fn = result.functions.find((f) => f.name === "fetchUsers");
      expect(fn).toBeDefined();
      expect(fn!.endpointInfo).toBeUndefined();
    });
  });

  describe("Axios HTTP call detection", () => {
    it("should detect axios HTTP calls", () => {
      const result = parseAndWalk(`
        function fetchUsers() {
          axios.get("/api/users");
          apiClient.post("/api/orders", data);
        }
      `);

      const getCall = result.calls.find(
        (c) => c.method === "get" && c.stringArgs?.includes("/api/users")
      );
      expect(getCall).toBeDefined();
      const axiosEnrichment = getCall!.enrichments!.find((e) => e.pluginName === "axios");
      expect(axiosEnrichment).toBeDefined();
      expect(axiosEnrichment!.httpCall).toEqual({ method: "GET", urlPattern: "/api/users" });
      expect(axiosEnrichment!.suggestedCategory).toBe("API_CALLER");

      const postCall = result.calls.find(
        (c) => c.method === "post" && c.stringArgs?.includes("/api/orders")
      );
      expect(postCall).toBeDefined();
      const postEnrichment = postCall!.enrichments!.find((e) => e.pluginName === "axios");
      expect(postEnrichment!.httpCall).toEqual({ method: "POST", urlPattern: "/api/orders" });
    });
  });

  describe("Full analyzer integration", () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = createTempDir();

      // Write test fixture files
      fs.writeFileSync(
        path.join(tempDir, "index.ts"),
        `
        import { Router } from "express";

        export function createApp() {
          const router = Router();
          router.get("/health", (req, res) => {
            res.json({ status: "ok" });
          });
          return router;
        }
        `
      );

      fs.writeFileSync(
        path.join(tempDir, "utils.ts"),
        `
        export const add = (a: number, b: number): number => a + b;
        export const multiply = (a: number, b: number): number => a * b;
        `
      );
    });

    afterAll(() => {
      removeTempDir(tempDir);
    });

    it("should produce a valid IrDocument", async () => {
      const ir = await analyzeRepository(tempDir, "test-repo", false);

      expect(ir.$schema).toBe("confianalyzer-ir-v1");
      expect(ir.version).toBe("0.1.0");
      expect(ir.analyzer.name).toBe("@confianalyzer/js-ts-analyzer");
      expect(ir.analyzer.language).toBe("typescript");
      expect(ir.repository.name).toBe("test-repo");
      expect(ir.files).toHaveLength(2);

      const indexFile = ir.files.find((f) => f.relativePath === "index.ts");
      expect(indexFile).toBeDefined();
      expect(indexFile!.language).toBe("typescript");
      expect(indexFile!.hash).toBeTruthy();
      expect(indexFile!.functions.length).toBeGreaterThan(0);
      expect(indexFile!.imports.length).toBeGreaterThan(0);

      const utilsFile = ir.files.find((f) => f.relativePath === "utils.ts");
      expect(utilsFile).toBeDefined();
      expect(utilsFile!.functions).toHaveLength(2);
      expect(utilsFile!.exports.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Incremental analysis", () => {
    let tempDir: string;
    let previousIrPath: string;

    beforeAll(async () => {
      tempDir = createTempDir();

      fs.writeFileSync(
        path.join(tempDir, "stable.ts"),
        `export function stableFunc(): string { return "stable"; }\n`
      );

      fs.writeFileSync(
        path.join(tempDir, "changing.ts"),
        `export function changingFunc(): number { return 1; }\n`
      );

      // Run initial analysis to produce a "previous" IR
      const initialIr = await analyzeRepository(tempDir, "incr-repo", false);
      previousIrPath = path.join(tempDir, "previous-ir.json");
      fs.writeFileSync(previousIrPath, JSON.stringify(initialIr, null, 2), "utf-8");
    });

    afterAll(() => {
      removeTempDir(tempDir);
    });

    it("should reuse unchanged files from previous IR", async () => {
      // Run incremental — no files changed
      const ir = await analyzeRepository(tempDir, "incr-repo", false, previousIrPath);

      expect(ir.files).toHaveLength(2);
      const stableFile = ir.files.find((f) => f.relativePath === "stable.ts");
      expect(stableFile).toBeDefined();
      expect(stableFile!.functions).toHaveLength(1);
      expect(stableFile!.functions[0].name).toBe("stableFunc");
    });

    it("should re-analyze changed files", async () => {
      // Modify one file
      fs.writeFileSync(
        path.join(tempDir, "changing.ts"),
        `export function changingFunc(): number { return 42; }\nexport function newFunc(): void {}\n`
      );

      const ir = await analyzeRepository(tempDir, "incr-repo", false, previousIrPath);

      expect(ir.files).toHaveLength(2);

      // stable.ts should be reused (same hash)
      const stableFile = ir.files.find((f) => f.relativePath === "stable.ts");
      expect(stableFile).toBeDefined();

      // changing.ts should be re-analyzed with new content
      const changingFile = ir.files.find((f) => f.relativePath === "changing.ts");
      expect(changingFile).toBeDefined();
      expect(changingFile!.functions.length).toBe(2);
      expect(changingFile!.functions.find((f) => f.name === "newFunc")).toBeDefined();
    });

    it("should omit deleted files", async () => {
      // Delete one file
      fs.unlinkSync(path.join(tempDir, "changing.ts"));

      const ir = await analyzeRepository(tempDir, "incr-repo", false, previousIrPath);

      // Only stable.ts should remain
      expect(ir.files).toHaveLength(1);
      expect(ir.files[0].relativePath).toBe("stable.ts");

      // Restore the file for other tests
      fs.writeFileSync(
        path.join(tempDir, "changing.ts"),
        `export function changingFunc(): number { return 1; }\n`
      );
    });
  });
});
