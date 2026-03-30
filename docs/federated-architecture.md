# VeoGraph Federated Analyzer Architecture

**Author:** System Architect
**Status:** Design Document (v1.0)
**Date:** 2026-03-30

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The IR JSON Contract (veograph-ir-v1)](#2-the-ir-json-contract-veograph-ir-v1)
3. [Worked Example: React Frontend + Python Backend](#3-worked-example-react-frontend--python-backend)
4. [Analyzer CLI Interface](#4-analyzer-cli-interface)
5. [Orchestrator Pipeline](#5-orchestrator-pipeline)
6. [Cross-Language Stitching Algorithm](#6-cross-language-stitching-algorithm)
7. [Migration Path](#7-migration-path)
8. [IR Contract Versioning](#8-ir-contract-versioning)

---

## 1. Architecture Overview

### System Diagram

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                         VeoGraph Orchestrator                       │
 │                                                                     │
 │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
 │  │ Analyzer   │  │ Analyzer   │  │ Analyzer   │  │ Analyzer   │      │
 │  │ Discovery  │  │ Invocation │  │ IR Merge   │  │ Stitching  │      │
 │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘      │
 │        │              │              │              │               │
 └────────┼──────────────┼──────────────┼──────────────┼───────────────┘
          │              │              │              │
    ┌─────┴──────┐  ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │  Registry  │  │ Spawn   │   │ Read    │   │ Cross-  │
    │  (config)  │  │ CLI     │   │ IR JSON │   │ repo    │
    │            │  │ procs   │   │ files   │   │ match   │
    └────────────┘  └────┬────┘   └─────────┘   └─────────┘
                         │
          ┌──────────────┼──────────────────┐
          │              │                  │
  ┌───────┴──────┐ ┌─────┴──────┐  ┌───────┴──────┐
  │ JS/TS        │ │ Python     │  │ Go           │
  │ Analyzer     │ │ Analyzer   │  │ Analyzer     │
  │              │ │            │  │              │
  │ TypeScript   │ │ Python     │  │ Go           │
  │ Compiler API │ │ AST module │  │ go/ast       │
  │              │ │            │  │              │
  │ Outputs:     │ │ Outputs:   │  │ Outputs:     │
  │ ir.json      │ │ ir.json    │  │ ir.json      │
  └──────────────┘ └────────────┘  └──────────────┘
          │              │                  │
          └──────────────┼──────────────────┘
                         │
                  ┌──────┴──────┐
                  │ veograph-   │
                  │ ir-v1.json  │
                  │ (per repo)  │
                  └──────┬──────┘
                         │
                  ┌──────┴──────┐
                  │  Neo4j DB   │
                  └──────┬──────┘
                         │
                  ┌──────┴──────┐
                  │   Web UI    │
                  └─────────────┘
```

### Data Flow

The federated architecture separates **language-specific parsing** from **language-neutral analysis**. Each analyzer is a standalone process that:

1. Receives a repository path as input.
2. Parses every source file using language-native tooling (TypeScript Compiler API, Python `ast` module, Go `go/ast`, etc.).
3. Transforms the parsed AST into the shared `veograph-ir-v1` JSON format.
4. Writes the IR JSON to a file on disk.

The orchestrator then:

1. Discovers which analyzers are available (via a configuration registry or PATH lookup).
2. Invokes all relevant analyzers in parallel, one per repository.
3. Reads the resulting IR JSON files.
4. Performs cross-file resolution within each repository (matching imports to exports).
5. Performs cross-repo stitching (matching API callers to API endpoints across languages).
6. Categorizes all functions.
7. Writes the unified graph to Neo4j.

### Analyzer Discovery

Analyzers are discovered through a configuration file at the project level:

```json
{
  "analyzers": {
    "typescript": {
      "command": "veograph-analyze-ts",
      "extensions": [".ts", ".tsx", ".js", ".jsx"],
      "version": ">=1.0.0"
    },
    "python": {
      "command": "veograph-analyze-python",
      "extensions": [".py"],
      "version": ">=1.0.0"
    },
    "go": {
      "command": "veograph-analyze-go",
      "extensions": [".go"],
      "version": ">=1.0.0"
    }
  }
}
```

The orchestrator selects analyzers based on file extensions found in each repository. A repository containing `.ts` and `.tsx` files triggers the `typescript` analyzer; one containing `.py` files triggers the `python` analyzer. A single repository with mixed languages (rare but possible) would be processed by multiple analyzers, with their IR outputs merged.

### Why Federated?

The current monolithic architecture (`packages/parsers` + `packages/analysis`) works well for JavaScript/TypeScript because the entire pipeline runs in Node.js. But supporting Python, Go, Java, and Rust means either:

**(A)** Writing parsers for every language in TypeScript (brittle, can't leverage native tooling), or
**(B)** Letting each language use its own best-in-class tooling, communicating through a shared JSON contract.

Option B is the federated approach. It means:

- The Python analyzer is written **in Python**, using the `ast` module and `astroid` for type inference.
- The Go analyzer is written **in Go**, using `go/ast` and `go/types`.
- Each analyzer is independently versioned, tested, and deployed.
- The orchestrator only needs to understand JSON -- it never touches language-specific ASTs.

---

## 2. The IR JSON Contract (veograph-ir-v1)

This is the contract between analyzers and the orchestrator. Every analyzer MUST produce a JSON file conforming to this schema. The orchestrator MUST accept any conforming file regardless of which analyzer produced it.

### Top-Level Structure

```json
{
  "$schema": "veograph-ir-v1",
  "version": "1.0.0",
  "generatedAt": "2026-03-30T14:22:00Z",
  "analyzer": {
    "name": "veograph-analyze-python",
    "version": "1.2.0",
    "language": "python"
  },
  "repository": {
    "name": "backend",
    "rootPath": "/home/user/projects/backend"
  },
  "files": [
    { /* FileIR object */ }
  ]
}
```

### Full JSON Schema

#### Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | `string` | Yes | Always `"veograph-ir-v1"`. Used for format detection. |
| `version` | `string` | Yes | Semantic version of the IR spec this file conforms to. |
| `generatedAt` | `string` | Yes | ISO-8601 timestamp of when this file was produced. |
| `analyzer` | `AnalyzerMeta` | Yes | Metadata about the analyzer that produced this file. |
| `repository` | `RepositoryMeta` | Yes | Metadata about the analyzed repository. |
| `files` | `FileIR[]` | Yes | Array of per-file analysis results. |

#### AnalyzerMeta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Analyzer executable name (e.g. `"veograph-analyze-python"`). |
| `version` | `string` | Yes | Semantic version of the analyzer. |
| `language` | `string` | Yes | Primary language this analyzer handles (e.g. `"python"`, `"typescript"`). |

#### RepositoryMeta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Short repository name (e.g. `"backend"`, `"frontend"`). |
| `rootPath` | `string` | Yes | Absolute path to the repository root on disk at analysis time. |

#### FileIR

Each entry in `files` represents one source file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | Absolute file path. |
| `relativePath` | `string` | Yes | Path relative to `repository.rootPath` (e.g. `"src/api/users.ts"`). |
| `language` | `string` | Yes | Language of this file: `"typescript"`, `"python"`, `"go"`, etc. |
| `size` | `number` | Yes | File size in bytes. |
| `hash` | `string` | Yes | SHA-256 content hash for incremental analysis. |
| `functions` | `FunctionIR[]` | Yes | All top-level functions and class methods. |
| `calls` | `CallIR[]` | Yes | All call expressions found in function bodies. |
| `imports` | `ImportIR[]` | Yes | All import statements. |
| `exports` | `ExportIR[]` | Yes | All export statements. |
| `classes` | `ClassIR[]` | Yes | All class/struct/type definitions. |
| `enrichments` | `FileEnrichment[]` | No | Framework-specific enrichments for the entire file. |

#### SourceLocation

Used by all nodes to pinpoint their position in the source file.

```json
{
  "startLine": 15,
  "endLine": 28,
  "startColumn": 0,
  "endColumn": 1
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startLine` | `number` | Yes | 1-based start line number. |
| `endLine` | `number` | Yes | 1-based end line number. |
| `startColumn` | `number` | Yes | 0-based start column offset. |
| `endColumn` | `number` | Yes | 0-based end column offset. |

#### FunctionIR

Represents a function, method, lambda, or any callable defined in the file. Class methods are emitted both as entries in `ClassIR.methods` (by name reference) and as standalone `FunctionIR` entries with a `qualifiedName` that includes the class.

```json
{
  "kind": "function",
  "name": "get_users",
  "qualifiedName": "UserService.get_users",
  "signature": "def get_users(self, skip: int = 0, limit: int = 100) -> list[User]",
  "parameters": [
    {
      "name": "self",
      "typeAnnotation": null,
      "hasDefault": false,
      "isRest": false
    },
    {
      "name": "skip",
      "typeAnnotation": "int",
      "hasDefault": true,
      "isRest": false
    },
    {
      "name": "limit",
      "typeAnnotation": "int",
      "hasDefault": true,
      "isRest": false
    }
  ],
  "returnType": "list[User]",
  "isExported": true,
  "isAsync": false,
  "isStatic": false,
  "accessibility": "public",
  "location": { "startLine": 15, "endLine": 20, "startColumn": 4, "endColumn": 0 },
  "endpointInfo": null,
  "enrichments": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"function"` | Yes | Always `"function"`. |
| `name` | `string` | Yes | Function name. Anonymous functions use `"<anonymous>"`. |
| `qualifiedName` | `string \| null` | No | For methods: `"ClassName.methodName"`. `null` for top-level functions. |
| `signature` | `string` | Yes | Full signature as written in source (language-specific syntax is fine). |
| `parameters` | `ParameterIR[]` | Yes | Ordered parameter list. May be empty. |
| `returnType` | `string \| null` | No | Return type annotation if present. `null` if absent or inferred. |
| `isExported` | `boolean` | Yes | Whether this function is exported / publicly accessible from outside the module. For Python: top-level functions without a leading `_` are considered exported. |
| `isAsync` | `boolean` | Yes | Whether the function is async (`async def`, `async function`, etc.). |
| `isStatic` | `boolean` | No | Whether this is a static method. Only relevant for class methods. Default: `false`. |
| `accessibility` | `"public" \| "protected" \| "private" \| null` | No | Visibility modifier. `null` if the language has no visibility system (Python uses convention: `_` prefix = private). |
| `location` | `SourceLocation` | Yes | Position in the source file. |
| `endpointInfo` | `EndpointInfo \| null` | No | If this function is an API endpoint handler, the HTTP method and route. Set by the analyzer when it can detect route decorators/registration. |
| `enrichments` | `Enrichment[]` | No | Framework-specific enrichments. Default: empty array. |

#### ParameterIR

```json
{
  "name": "user_id",
  "typeAnnotation": "int",
  "hasDefault": false,
  "isRest": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Parameter name as written in source. |
| `typeAnnotation` | `string \| null` | No | Type annotation if present. `null` if absent. |
| `hasDefault` | `boolean` | Yes | Whether the parameter has a default value. |
| `isRest` | `boolean` | Yes | Whether this is a rest/variadic parameter (`*args`, `...rest`, `...`). |

#### CallIR

Represents a function or method call expression found inside a function body. These are the raw edges of the call graph.

```json
{
  "kind": "call",
  "callee": "db.query",
  "receiver": "db",
  "method": "query",
  "argumentCount": 2,
  "argumentRefs": ["User"],
  "stringArgs": ["SELECT * FROM users WHERE id = $1"],
  "enclosingFunction": "get_users",
  "location": { "startLine": 18, "endLine": 18, "startColumn": 8, "endColumn": 55 },
  "enrichments": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"call"` | Yes | Always `"call"`. |
| `callee` | `string` | Yes | The full callee expression: `"fetchUser"`, `"this.validate"`, `"axios.get"`, `"db.query"`. |
| `receiver` | `string \| null` | No | For member calls: the object part. `"axios"` in `axios.get(...)`. `null` for plain function calls. |
| `method` | `string \| null` | No | For member calls: the method part. `"get"` in `axios.get(...)`. `null` for plain function calls. |
| `argumentCount` | `number` | Yes | Number of arguments at the call site. |
| `argumentRefs` | `string[]` | No | Identifier names passed as arguments (e.g., function references, class names). Only includes identifiers, not literals or expressions. Default: empty. |
| `stringArgs` | `string[]` | No | String literal values from arguments. **Critical for cross-repo stitching**: this is where route paths like `"/api/users"` and SQL query strings are captured. Default: empty. |
| `enclosingFunction` | `string \| null` | No | Name of the function/method containing this call. Set by the analyzer. `null` if at module scope. |
| `location` | `SourceLocation` | Yes | Position of the call expression. |
| `enrichments` | `Enrichment[]` | No | Framework-specific enrichments. Default: empty array. |

**Why `stringArgs` is critical:** Cross-repo stitching works by matching URL patterns. When a frontend calls `axios.get("/api/users")`, the string `"/api/users"` appears in `stringArgs`. When a backend declares `@router.get("/api/users")`, the string `"/api/users"` appears either in `stringArgs` of the decorator call or in `endpointInfo.path`. Without `stringArgs`, cross-language stitching is impossible.

#### ImportIR

```json
{
  "kind": "import",
  "modulePath": "./services/user_service",
  "resolvedPath": "/home/user/projects/backend/app/services/user_service.py",
  "isExternal": false,
  "symbols": [
    { "name": "get_all_users", "alias": null },
    { "name": "create_user", "alias": "make_user" }
  ],
  "defaultImport": null,
  "namespaceImport": null,
  "location": { "startLine": 3, "endLine": 3, "startColumn": 0, "endColumn": 52 }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"import"` | Yes | Always `"import"`. |
| `modulePath` | `string` | Yes | Module specifier as written in source: `"./utils"`, `"express"`, `"from app.models import User"`. |
| `resolvedPath` | `string \| null` | No | Resolved absolute file path. Set by the analyzer if it can resolve the import. `null` for external packages or unresolvable paths. The orchestrator may also resolve this during cross-file resolution. |
| `isExternal` | `boolean` | Yes | `true` if the import targets a third-party package (npm, pip, go module, Maven, etc.). `false` for local/relative imports. |
| `symbols` | `ImportedSymbolIR[]` | Yes | Named symbols imported. Empty for namespace/wildcard/side-effect imports. |
| `defaultImport` | `string \| null` | No | Name of the default import binding. JS/TS: `import Foo from '...'` produces `"Foo"`. Python: N/A (use `null`). |
| `namespaceImport` | `string \| null` | No | Namespace binding. JS/TS: `import * as utils from '...'` produces `"utils"`. Python: `import os` produces `"os"`. |
| `location` | `SourceLocation` | Yes | Position of the import statement. |

#### ImportedSymbolIR

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | The exported name from the source module. |
| `alias` | `string \| null` | No | Local alias if renamed. JS: `import { foo as bar }` produces `alias: "bar"`. Python: `from x import foo as bar` produces `alias: "bar"`. |

#### ExportIR

```json
{
  "kind": "export",
  "name": "get_users",
  "localName": "get_users",
  "isDefault": false,
  "fromModule": null,
  "location": { "startLine": 10, "endLine": 10, "startColumn": 0, "endColumn": 20 }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"export"` | Yes | Always `"export"`. |
| `name` | `string` | Yes | Exported symbol name. `"default"` for default exports. |
| `localName` | `string \| null` | No | Local name if different from exported name. |
| `isDefault` | `boolean` | Yes | Whether this is the default export. |
| `fromModule` | `string \| null` | No | If this is a re-export, the source module specifier. |
| `location` | `SourceLocation` | Yes | Position of the export statement. |

**Python note:** Python does not have explicit export statements. The analyzer should synthesize `ExportIR` entries for all top-level functions, classes, and variables that do not start with `_`. The `__all__` list, if present, takes precedence.

**Go note:** Go exports via capitalization. The analyzer should synthesize `ExportIR` entries for all capitalized identifiers.

#### ClassIR

```json
{
  "kind": "class",
  "name": "UserService",
  "superClass": "BaseService",
  "implements": [],
  "isExported": true,
  "isAbstract": false,
  "methods": ["get_all_users", "create_user", "delete_user"],
  "location": { "startLine": 8, "endLine": 45, "startColumn": 0, "endColumn": 0 }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | `"class"` | Yes | Always `"class"`. |
| `name` | `string` | Yes | Class name. Anonymous classes use `"<anonymous>"`. |
| `superClass` | `string \| null` | No | Superclass name if extends another class. |
| `implements` | `string[]` | Yes | Implemented interfaces (TypeScript, Java, Go). Empty if none. |
| `isExported` | `boolean` | Yes | Whether the class is exported. |
| `isAbstract` | `boolean` | Yes | Whether the class is abstract. |
| `methods` | `string[]` | Yes | Names of methods defined in this class. The actual method details appear as `FunctionIR` entries with `qualifiedName` set. |
| `location` | `SourceLocation` | Yes | Position of the class definition. |

#### EndpointInfo

Attached to a `FunctionIR` when the function is a route handler.

```json
{
  "method": "GET",
  "path": "/api/users"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | `string` | Yes | HTTP method: `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, `"OPTIONS"`, `"HEAD"`. |
| `path` | `string` | Yes | Route path pattern. Must preserve path parameters in the source language's syntax: Express `:id`, FastAPI `{id}`, Gin `:id`, Spring `{id}`. Normalization is the orchestrator's job. |

#### Enrichment

Framework-specific metadata attached to functions, calls, or files.

```json
{
  "pluginName": "fastapi",
  "route": { "method": "GET", "path": "/api/users" },
  "dbOperation": null,
  "httpCall": null,
  "renders": null,
  "middlewareOrder": null,
  "suggestedCategory": "API_ENDPOINT"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pluginName` | `string` | Yes | Name of the plugin/detector that produced this enrichment. |
| `route` | `RouteInfo \| null` | No | For route handlers: HTTP method + path. |
| `dbOperation` | `DbOperationInfo \| null` | No | For ORM/database calls: table name + operation type. |
| `httpCall` | `HttpCallInfo \| null` | No | For HTTP client calls: target URL pattern + method. |
| `renders` | `string[] \| null` | No | For component rendering: child component names. |
| `middlewareOrder` | `number \| null` | No | For middleware: order in the chain. |
| `suggestedCategory` | `string \| null` | No | Suggested function category: `"UI_INTERACTION"`, `"HANDLER"`, `"API_CALLER"`, `"API_ENDPOINT"`, `"DB_CALL"`, `"UTILITY"`. |

#### RouteInfo

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | `string` | Yes | HTTP method. |
| `path` | `string` | Yes | Route path pattern. |

#### DbOperationInfo

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | `string` | Yes | Database table or collection name. |
| `operation` | `"read" \| "write" \| "delete" \| "transaction"` | Yes | Type of database operation. |

#### HttpCallInfo

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | `string` | Yes | HTTP method used in the client call. |
| `urlPattern` | `string` | Yes | URL pattern or path being called. |

#### FileEnrichment

File-level enrichment for things like React component hierarchy or Next.js page routing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pluginName` | `string` | Yes | Name of the plugin. |
| `isPage` | `boolean` | No | Whether this file represents a page/route (Next.js, Nuxt, etc.). |
| `pageRoute` | `string \| null` | No | The route this page maps to. |
| `isLayout` | `boolean` | No | Whether this file is a layout component. |
| `componentName` | `string \| null` | No | Primary component exported by this file. |

### Complete Example: A Minimal IR JSON File

```json
{
  "$schema": "veograph-ir-v1",
  "version": "1.0.0",
  "generatedAt": "2026-03-30T14:22:00Z",
  "analyzer": {
    "name": "veograph-analyze-python",
    "version": "1.0.0",
    "language": "python"
  },
  "repository": {
    "name": "backend",
    "rootPath": "/home/user/projects/backend"
  },
  "files": [
    {
      "path": "/home/user/projects/backend/app/routes/users.py",
      "relativePath": "app/routes/users.py",
      "language": "python",
      "size": 1024,
      "hash": "a1b2c3d4e5f6...",
      "functions": [
        {
          "kind": "function",
          "name": "get_users",
          "qualifiedName": null,
          "signature": "async def get_users(skip: int = 0, limit: int = 100) -> list[User]",
          "parameters": [
            { "name": "skip", "typeAnnotation": "int", "hasDefault": true, "isRest": false },
            { "name": "limit", "typeAnnotation": "int", "hasDefault": true, "isRest": false }
          ],
          "returnType": "list[User]",
          "isExported": true,
          "isAsync": true,
          "isStatic": false,
          "accessibility": null,
          "location": { "startLine": 10, "endLine": 15, "startColumn": 0, "endColumn": 0 },
          "endpointInfo": { "method": "GET", "path": "/api/users" },
          "enrichments": [
            {
              "pluginName": "fastapi",
              "route": { "method": "GET", "path": "/api/users" },
              "dbOperation": null,
              "httpCall": null,
              "renders": null,
              "middlewareOrder": null,
              "suggestedCategory": "API_ENDPOINT"
            }
          ]
        }
      ],
      "calls": [
        {
          "kind": "call",
          "callee": "user_service.get_all_users",
          "receiver": "user_service",
          "method": "get_all_users",
          "argumentCount": 2,
          "argumentRefs": [],
          "stringArgs": [],
          "enclosingFunction": "get_users",
          "location": { "startLine": 13, "endLine": 13, "startColumn": 11, "endColumn": 48 },
          "enrichments": []
        }
      ],
      "imports": [
        {
          "kind": "import",
          "modulePath": "app.services.user_service",
          "resolvedPath": "/home/user/projects/backend/app/services/user_service.py",
          "isExternal": false,
          "symbols": [{ "name": "get_all_users", "alias": null }],
          "defaultImport": null,
          "namespaceImport": null,
          "location": { "startLine": 3, "endLine": 3, "startColumn": 0, "endColumn": 45 }
        }
      ],
      "exports": [
        {
          "kind": "export",
          "name": "get_users",
          "localName": "get_users",
          "isDefault": false,
          "fromModule": null,
          "location": { "startLine": 10, "endLine": 10, "startColumn": 0, "endColumn": 0 }
        }
      ],
      "classes": [],
      "enrichments": []
    }
  ]
}
```

---

## 3. Worked Example: React Frontend + Python Backend

This section walks through a complete, realistic example: a React frontend calling a FastAPI backend. For each file, we show the source code, the IR JSON output, and then demonstrate how the orchestrator stitches everything together.

### 3.1 Repository Structure

**Frontend repository (`frontend`):**
```
frontend/
├── src/
│   ├── App.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   └── UsersPage.tsx
│   ├── api/
│   │   ├── client.ts
│   │   └── users.ts
│   └── components/
│       └── UserCard.tsx
├── package.json
└── tsconfig.json
```

**Backend repository (`backend`):**
```
backend/
├── app/
│   ├── main.py
│   ├── routes/
│   │   ├── users.py
│   │   └── auth.py
│   ├── services/
│   │   ├── user_service.py
│   │   └── auth_service.py
│   └── models/
│       └── user.py
├── requirements.txt
└── pyproject.toml
```

### 3.2 Frontend Source Code + IR Output

#### `frontend/src/api/client.ts`

**Source code:**
```typescript
import axios from "axios";

const apiClient = axios.create({
  baseURL: "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

export default apiClient;
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/frontend/src/api/client.ts",
  "relativePath": "src/api/client.ts",
  "language": "typescript",
  "size": 198,
  "hash": "f8a1b2...",
  "functions": [],
  "calls": [
    {
      "kind": "call",
      "callee": "axios.create",
      "receiver": "axios",
      "method": "create",
      "argumentCount": 1,
      "argumentRefs": [],
      "stringArgs": ["http://localhost:8000", "application/json"],
      "enclosingFunction": null,
      "location": { "startLine": 3, "endLine": 6, "startColumn": 18, "endColumn": 2 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "axios",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [],
      "defaultImport": "axios",
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 26 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "default",
      "localName": "apiClient",
      "isDefault": true,
      "fromModule": null,
      "location": { "startLine": 8, "endLine": 8, "startColumn": 0, "endColumn": 25 }
    }
  ],
  "classes": []
}
```

**Mapping notes:** The `axios.create` call captures `"http://localhost:8000"` in `stringArgs`, which tells the orchestrator about the base URL for this API client. The export of `apiClient` as default allows other files to import it.

---

#### `frontend/src/api/users.ts`

**Source code:**
```typescript
import apiClient from "./client";
import type { User } from "../types";

export async function fetchUsers(): Promise<User[]> {
  const response = await apiClient.get("/api/users");
  return response.data;
}

export async function createUser(userData: Partial<User>): Promise<User> {
  const response = await apiClient.post("/api/users", userData);
  return response.data;
}
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/frontend/src/api/users.ts",
  "relativePath": "src/api/users.ts",
  "language": "typescript",
  "size": 387,
  "hash": "c3d4e5...",
  "functions": [
    {
      "kind": "function",
      "name": "fetchUsers",
      "qualifiedName": null,
      "signature": "async function fetchUsers(): Promise<User[]>",
      "parameters": [],
      "returnType": "Promise<User[]>",
      "isExported": true,
      "isAsync": true,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 4, "endLine": 7, "startColumn": 0, "endColumn": 1 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "axios",
          "route": null,
          "dbOperation": null,
          "httpCall": { "method": "GET", "urlPattern": "/api/users" },
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "API_CALLER"
        }
      ]
    },
    {
      "kind": "function",
      "name": "createUser",
      "qualifiedName": null,
      "signature": "async function createUser(userData: Partial<User>): Promise<User>",
      "parameters": [
        { "name": "userData", "typeAnnotation": "Partial<User>", "hasDefault": false, "isRest": false }
      ],
      "returnType": "Promise<User>",
      "isExported": true,
      "isAsync": true,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 9, "endLine": 12, "startColumn": 0, "endColumn": 1 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "axios",
          "route": null,
          "dbOperation": null,
          "httpCall": { "method": "POST", "urlPattern": "/api/users" },
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "API_CALLER"
        }
      ]
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "apiClient.get",
      "receiver": "apiClient",
      "method": "get",
      "argumentCount": 1,
      "argumentRefs": [],
      "stringArgs": ["/api/users"],
      "enclosingFunction": "fetchUsers",
      "location": { "startLine": 5, "endLine": 5, "startColumn": 25, "endColumn": 51 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "apiClient.post",
      "receiver": "apiClient",
      "method": "post",
      "argumentCount": 2,
      "argumentRefs": ["userData"],
      "stringArgs": ["/api/users"],
      "enclosingFunction": "createUser",
      "location": { "startLine": 10, "endLine": 10, "startColumn": 25, "endColumn": 59 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "./client",
      "resolvedPath": "/home/user/projects/frontend/src/api/client.ts",
      "isExternal": false,
      "symbols": [],
      "defaultImport": "apiClient",
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 32 }
    },
    {
      "kind": "import",
      "modulePath": "../types",
      "resolvedPath": "/home/user/projects/frontend/src/types.ts",
      "isExternal": false,
      "symbols": [{ "name": "User", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 2, "endLine": 2, "startColumn": 0, "endColumn": 34 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "fetchUsers",
      "localName": "fetchUsers",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 4, "endLine": 4, "startColumn": 0, "endColumn": 0 }
    },
    {
      "kind": "export",
      "name": "createUser",
      "localName": "createUser",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 9, "endLine": 9, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

**Mapping notes:** The `apiClient.get("/api/users")` call is the critical piece. The analyzer detects that `apiClient` is an axios instance (via the import from `./client`), so `receiver: "apiClient"` + `method: "get"` maps to `HTTP GET`. The string argument `"/api/users"` is captured in `stringArgs`. The enrichment on `fetchUsers` records the HTTP call pattern, and `suggestedCategory: "API_CALLER"` tells the orchestrator to classify this function accordingly.

---

#### `frontend/src/pages/UsersPage.tsx`

**Source code:**
```tsx
import React, { useEffect, useState } from "react";
import { fetchUsers } from "../api/users";
import UserCard from "../components/UserCard";
import type { User } from "../types";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers().then((data) => {
      setUsers(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="users-page">
      <h1>Users</h1>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/frontend/src/pages/UsersPage.tsx",
  "relativePath": "src/pages/UsersPage.tsx",
  "language": "typescript",
  "size": 612,
  "hash": "d5e6f7...",
  "functions": [
    {
      "kind": "function",
      "name": "UsersPage",
      "qualifiedName": null,
      "signature": "function UsersPage(): JSX.Element",
      "parameters": [],
      "returnType": "JSX.Element",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 6, "endLine": 27, "startColumn": 0, "endColumn": 1 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "react",
          "route": null,
          "dbOperation": null,
          "httpCall": null,
          "renders": ["UserCard"],
          "middlewareOrder": null,
          "suggestedCategory": "UI_INTERACTION"
        }
      ]
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "useState",
      "receiver": null,
      "method": null,
      "argumentCount": 1,
      "argumentRefs": [],
      "stringArgs": [],
      "enclosingFunction": "UsersPage",
      "location": { "startLine": 7, "endLine": 7, "startColumn": 28, "endColumn": 49 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "useState",
      "receiver": null,
      "method": null,
      "argumentCount": 1,
      "argumentRefs": [],
      "stringArgs": [],
      "enclosingFunction": "UsersPage",
      "location": { "startLine": 8, "endLine": 8, "startColumn": 30, "endColumn": 46 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "useEffect",
      "receiver": null,
      "method": null,
      "argumentCount": 2,
      "argumentRefs": [],
      "stringArgs": [],
      "enclosingFunction": "UsersPage",
      "location": { "startLine": 10, "endLine": 15, "startColumn": 2, "endColumn": 8 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "fetchUsers",
      "receiver": null,
      "method": null,
      "argumentCount": 0,
      "argumentRefs": [],
      "stringArgs": [],
      "enclosingFunction": "UsersPage",
      "location": { "startLine": 11, "endLine": 11, "startColumn": 4, "endColumn": 16 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "react",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [
        { "name": "useEffect", "alias": null },
        { "name": "useState", "alias": null }
      ],
      "defaultImport": "React",
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 52 }
    },
    {
      "kind": "import",
      "modulePath": "../api/users",
      "resolvedPath": "/home/user/projects/frontend/src/api/users.ts",
      "isExternal": false,
      "symbols": [{ "name": "fetchUsers", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 2, "endLine": 2, "startColumn": 0, "endColumn": 42 }
    },
    {
      "kind": "import",
      "modulePath": "../components/UserCard",
      "resolvedPath": "/home/user/projects/frontend/src/components/UserCard.tsx",
      "isExternal": false,
      "symbols": [],
      "defaultImport": "UserCard",
      "namespaceImport": null,
      "location": { "startLine": 3, "endLine": 3, "startColumn": 0, "endColumn": 45 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "default",
      "localName": "UsersPage",
      "isDefault": true,
      "fromModule": null,
      "location": { "startLine": 6, "endLine": 6, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

---

#### `frontend/src/pages/LoginPage.tsx`

**Source code:**
```tsx
import React, { useState } from "react";
import apiClient from "../api/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const response = await apiClient.post("/api/login", { email, password });
      localStorage.setItem("token", response.data.token);
      window.location.href = "/users";
    } catch (error) {
      alert("Login failed");
    }
  };

  return (
    <div className="login-page">
      <h1>Login</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/frontend/src/pages/LoginPage.tsx",
  "relativePath": "src/pages/LoginPage.tsx",
  "language": "typescript",
  "size": 715,
  "hash": "e7f8a9...",
  "functions": [
    {
      "kind": "function",
      "name": "LoginPage",
      "qualifiedName": null,
      "signature": "function LoginPage(): JSX.Element",
      "parameters": [],
      "returnType": "JSX.Element",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 4, "endLine": 26, "startColumn": 0, "endColumn": 1 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "react",
          "route": null,
          "dbOperation": null,
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "UI_INTERACTION"
        }
      ]
    },
    {
      "kind": "function",
      "name": "handleLogin",
      "qualifiedName": null,
      "signature": "async () => Promise<void>",
      "parameters": [],
      "returnType": "Promise<void>",
      "isExported": false,
      "isAsync": true,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 8, "endLine": 16, "startColumn": 8, "endColumn": 4 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "axios",
          "route": null,
          "dbOperation": null,
          "httpCall": { "method": "POST", "urlPattern": "/api/login" },
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "API_CALLER"
        }
      ]
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "apiClient.post",
      "receiver": "apiClient",
      "method": "post",
      "argumentCount": 2,
      "argumentRefs": [],
      "stringArgs": ["/api/login"],
      "enclosingFunction": "handleLogin",
      "location": { "startLine": 10, "endLine": 10, "startColumn": 30, "endColumn": 76 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "react",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [{ "name": "useState", "alias": null }],
      "defaultImport": "React",
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 40 }
    },
    {
      "kind": "import",
      "modulePath": "../api/client",
      "resolvedPath": "/home/user/projects/frontend/src/api/client.ts",
      "isExternal": false,
      "symbols": [],
      "defaultImport": "apiClient",
      "namespaceImport": null,
      "location": { "startLine": 2, "endLine": 2, "startColumn": 0, "endColumn": 37 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "default",
      "localName": "LoginPage",
      "isDefault": true,
      "fromModule": null,
      "location": { "startLine": 4, "endLine": 4, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

---

#### `frontend/src/components/UserCard.tsx`

**Source code:**
```tsx
import React from "react";
import type { User } from "../types";

interface UserCardProps {
  user: User;
}

export default function UserCard({ user }: UserCardProps) {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/frontend/src/components/UserCard.tsx",
  "relativePath": "src/components/UserCard.tsx",
  "language": "typescript",
  "size": 280,
  "hash": "b1c2d3...",
  "functions": [
    {
      "kind": "function",
      "name": "UserCard",
      "qualifiedName": null,
      "signature": "function UserCard({ user }: UserCardProps): JSX.Element",
      "parameters": [
        { "name": "user", "typeAnnotation": "UserCardProps", "hasDefault": false, "isRest": false }
      ],
      "returnType": "JSX.Element",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 8, "endLine": 15, "startColumn": 0, "endColumn": 1 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "react",
          "route": null,
          "dbOperation": null,
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "UI_INTERACTION"
        }
      ]
    }
  ],
  "calls": [],
  "imports": [
    {
      "kind": "import",
      "modulePath": "react",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [],
      "defaultImport": "React",
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 26 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "default",
      "localName": "UserCard",
      "isDefault": true,
      "fromModule": null,
      "location": { "startLine": 8, "endLine": 8, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

---

#### `frontend/src/App.tsx`

**Source code:**
```tsx
import React from "react";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  const path = window.location.pathname;

  return (
    <div>
      {path === "/login" ? <LoginPage /> : <UsersPage />}
    </div>
  );
}
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/frontend/src/App.tsx",
  "relativePath": "src/App.tsx",
  "language": "typescript",
  "size": 305,
  "hash": "a9b8c7...",
  "functions": [
    {
      "kind": "function",
      "name": "App",
      "qualifiedName": null,
      "signature": "function App(): JSX.Element",
      "parameters": [],
      "returnType": "JSX.Element",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 5, "endLine": 13, "startColumn": 0, "endColumn": 1 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "react",
          "route": null,
          "dbOperation": null,
          "httpCall": null,
          "renders": ["LoginPage", "UsersPage"],
          "middlewareOrder": null,
          "suggestedCategory": "UI_INTERACTION"
        }
      ]
    }
  ],
  "calls": [],
  "imports": [
    {
      "kind": "import",
      "modulePath": "react",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [],
      "defaultImport": "React",
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 26 }
    },
    {
      "kind": "import",
      "modulePath": "./pages/LoginPage",
      "resolvedPath": "/home/user/projects/frontend/src/pages/LoginPage.tsx",
      "isExternal": false,
      "symbols": [],
      "defaultImport": "LoginPage",
      "namespaceImport": null,
      "location": { "startLine": 2, "endLine": 2, "startColumn": 0, "endColumn": 42 }
    },
    {
      "kind": "import",
      "modulePath": "./pages/UsersPage",
      "resolvedPath": "/home/user/projects/frontend/src/pages/UsersPage.tsx",
      "isExternal": false,
      "symbols": [],
      "defaultImport": "UsersPage",
      "namespaceImport": null,
      "location": { "startLine": 3, "endLine": 3, "startColumn": 0, "endColumn": 42 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "default",
      "localName": "App",
      "isDefault": true,
      "fromModule": null,
      "location": { "startLine": 5, "endLine": 5, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

---

### 3.3 Backend Source Code + IR Output

#### `backend/app/models/user.py`

**Source code:**
```python
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/backend/app/models/user.py",
  "relativePath": "app/models/user.py",
  "language": "python",
  "size": 342,
  "hash": "1a2b3c...",
  "functions": [],
  "calls": [
    {
      "kind": "call",
      "callee": "declarative_base",
      "receiver": null,
      "method": null,
      "argumentCount": 0,
      "argumentRefs": [],
      "stringArgs": [],
      "enclosingFunction": null,
      "location": { "startLine": 4, "endLine": 4, "startColumn": 7, "endColumn": 25 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "Column",
      "receiver": null,
      "method": null,
      "argumentCount": 2,
      "argumentRefs": ["Integer"],
      "stringArgs": [],
      "enclosingFunction": null,
      "location": { "startLine": 9, "endLine": 9, "startColumn": 9, "endColumn": 50 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "sqlalchemy",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [
        { "name": "Column", "alias": null },
        { "name": "Integer", "alias": null },
        { "name": "String", "alias": null }
      ],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 46 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "User",
      "localName": "User",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 6, "endLine": 6, "startColumn": 0, "endColumn": 0 }
    },
    {
      "kind": "export",
      "name": "Base",
      "localName": "Base",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 4, "endLine": 4, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": [
    {
      "kind": "class",
      "name": "User",
      "superClass": "Base",
      "implements": [],
      "isExported": true,
      "isAbstract": false,
      "methods": [],
      "location": { "startLine": 6, "endLine": 12, "startColumn": 0, "endColumn": 0 }
    }
  ]
}
```

---

#### `backend/app/services/user_service.py`

**Source code:**
```python
from sqlalchemy.orm import Session
from app.models.user import User

def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return db.query(User).offset(skip).limit(limit).all()

def create_user(db: Session, name: str, email: str, password: str) -> User:
    hashed = _hash_password(password)
    user = User(name=name, email=email, hashed_password=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def _hash_password(password: str) -> str:
    import hashlib
    return hashlib.sha256(password.encode()).hexdigest()
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/backend/app/services/user_service.py",
  "relativePath": "app/services/user_service.py",
  "language": "python",
  "size": 520,
  "hash": "4d5e6f...",
  "functions": [
    {
      "kind": "function",
      "name": "get_all_users",
      "qualifiedName": null,
      "signature": "def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]",
      "parameters": [
        { "name": "db", "typeAnnotation": "Session", "hasDefault": false, "isRest": false },
        { "name": "skip", "typeAnnotation": "int", "hasDefault": true, "isRest": false },
        { "name": "limit", "typeAnnotation": "int", "hasDefault": true, "isRest": false }
      ],
      "returnType": "list[User]",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 4, "endLine": 5, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "sqlalchemy",
          "route": null,
          "dbOperation": { "table": "users", "operation": "read" },
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "DB_CALL"
        }
      ]
    },
    {
      "kind": "function",
      "name": "create_user",
      "qualifiedName": null,
      "signature": "def create_user(db: Session, name: str, email: str, password: str) -> User",
      "parameters": [
        { "name": "db", "typeAnnotation": "Session", "hasDefault": false, "isRest": false },
        { "name": "name", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "email", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "password", "typeAnnotation": "str", "hasDefault": false, "isRest": false }
      ],
      "returnType": "User",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 7, "endLine": 13, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "sqlalchemy",
          "route": null,
          "dbOperation": { "table": "users", "operation": "write" },
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "DB_CALL"
        }
      ]
    },
    {
      "kind": "function",
      "name": "_hash_password",
      "qualifiedName": null,
      "signature": "def _hash_password(password: str) -> str",
      "parameters": [
        { "name": "password", "typeAnnotation": "str", "hasDefault": false, "isRest": false }
      ],
      "returnType": "str",
      "isExported": false,
      "isAsync": false,
      "isStatic": false,
      "accessibility": "private",
      "location": { "startLine": 15, "endLine": 17, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": null,
      "enrichments": []
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "db.query",
      "receiver": "db",
      "method": "query",
      "argumentCount": 1,
      "argumentRefs": ["User"],
      "stringArgs": [],
      "enclosingFunction": "get_all_users",
      "location": { "startLine": 5, "endLine": 5, "startColumn": 11, "endColumn": 55 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "_hash_password",
      "receiver": null,
      "method": null,
      "argumentCount": 1,
      "argumentRefs": ["password"],
      "stringArgs": [],
      "enclosingFunction": "create_user",
      "location": { "startLine": 8, "endLine": 8, "startColumn": 13, "endColumn": 36 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "db.add",
      "receiver": "db",
      "method": "add",
      "argumentCount": 1,
      "argumentRefs": ["user"],
      "stringArgs": [],
      "enclosingFunction": "create_user",
      "location": { "startLine": 10, "endLine": 10, "startColumn": 4, "endColumn": 16 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "db.commit",
      "receiver": "db",
      "method": "commit",
      "argumentCount": 0,
      "argumentRefs": [],
      "stringArgs": [],
      "enclosingFunction": "create_user",
      "location": { "startLine": 11, "endLine": 11, "startColumn": 4, "endColumn": 17 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "sqlalchemy.orm",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [{ "name": "Session", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 34 }
    },
    {
      "kind": "import",
      "modulePath": "app.models.user",
      "resolvedPath": "/home/user/projects/backend/app/models/user.py",
      "isExternal": false,
      "symbols": [{ "name": "User", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 2, "endLine": 2, "startColumn": 0, "endColumn": 32 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "get_all_users",
      "localName": "get_all_users",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 4, "endLine": 4, "startColumn": 0, "endColumn": 0 }
    },
    {
      "kind": "export",
      "name": "create_user",
      "localName": "create_user",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 7, "endLine": 7, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

**Mapping notes:** The Python analyzer detects SQLAlchemy patterns -- `db.query(User)` tells it the `User` model's `__tablename__` is `"users"`, so the enrichment records `dbOperation: { table: "users", operation: "read" }`. The `_hash_password` function starts with `_`, so `isExported: false` and `accessibility: "private"`.

---

#### `backend/app/routes/users.py`

**Source code:**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.services.user_service import get_all_users, create_user
from app.models.user import User
from app.database import get_db

router = APIRouter()

@router.get("/api/users")
async def get_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return get_all_users(db, skip, limit)

@router.post("/api/users")
async def create_new_user(name: str, email: str, password: str, db: Session = Depends(get_db)):
    return create_user(db, name, email, password)
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/backend/app/routes/users.py",
  "relativePath": "app/routes/users.py",
  "language": "python",
  "size": 482,
  "hash": "7g8h9i...",
  "functions": [
    {
      "kind": "function",
      "name": "get_users",
      "qualifiedName": null,
      "signature": "async def get_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db))",
      "parameters": [
        { "name": "skip", "typeAnnotation": "int", "hasDefault": true, "isRest": false },
        { "name": "limit", "typeAnnotation": "int", "hasDefault": true, "isRest": false },
        { "name": "db", "typeAnnotation": "Session", "hasDefault": true, "isRest": false }
      ],
      "returnType": null,
      "isExported": true,
      "isAsync": true,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 10, "endLine": 11, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": { "method": "GET", "path": "/api/users" },
      "enrichments": [
        {
          "pluginName": "fastapi",
          "route": { "method": "GET", "path": "/api/users" },
          "dbOperation": null,
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "API_ENDPOINT"
        }
      ]
    },
    {
      "kind": "function",
      "name": "create_new_user",
      "qualifiedName": null,
      "signature": "async def create_new_user(name: str, email: str, password: str, db: Session = Depends(get_db))",
      "parameters": [
        { "name": "name", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "email", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "password", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "db", "typeAnnotation": "Session", "hasDefault": true, "isRest": false }
      ],
      "returnType": null,
      "isExported": true,
      "isAsync": true,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 14, "endLine": 15, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": { "method": "POST", "path": "/api/users" },
      "enrichments": [
        {
          "pluginName": "fastapi",
          "route": { "method": "POST", "path": "/api/users" },
          "dbOperation": null,
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "API_ENDPOINT"
        }
      ]
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "get_all_users",
      "receiver": null,
      "method": null,
      "argumentCount": 3,
      "argumentRefs": ["db", "skip", "limit"],
      "stringArgs": [],
      "enclosingFunction": "get_users",
      "location": { "startLine": 11, "endLine": 11, "startColumn": 11, "endColumn": 40 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "create_user",
      "receiver": null,
      "method": null,
      "argumentCount": 4,
      "argumentRefs": ["db", "name", "email", "password"],
      "stringArgs": [],
      "enclosingFunction": "create_new_user",
      "location": { "startLine": 15, "endLine": 15, "startColumn": 11, "endColumn": 48 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "fastapi",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [
        { "name": "APIRouter", "alias": null },
        { "name": "Depends", "alias": null }
      ],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 38 }
    },
    {
      "kind": "import",
      "modulePath": "app.services.user_service",
      "resolvedPath": "/home/user/projects/backend/app/services/user_service.py",
      "isExternal": false,
      "symbols": [
        { "name": "get_all_users", "alias": null },
        { "name": "create_user", "alias": null }
      ],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 3, "endLine": 3, "startColumn": 0, "endColumn": 60 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "get_users",
      "localName": "get_users",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 10, "endLine": 10, "startColumn": 0, "endColumn": 0 }
    },
    {
      "kind": "export",
      "name": "create_new_user",
      "localName": "create_new_user",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 14, "endLine": 14, "startColumn": 0, "endColumn": 0 }
    },
    {
      "kind": "export",
      "name": "router",
      "localName": "router",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 7, "endLine": 7, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

**Mapping notes:** The FastAPI analyzer detects `@router.get("/api/users")` as a decorator on `get_users`. It sets `endpointInfo.method = "GET"` and `endpointInfo.path = "/api/users"`. The enrichment mirrors this. This is the data that the orchestrator will match against the frontend's `apiClient.get("/api/users")`.

---

#### `backend/app/routes/auth.py`

**Source code:**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.services.auth_service import authenticate
from app.database import get_db

router = APIRouter()

@router.post("/api/login")
async def login(email: str, password: str, db: Session = Depends(get_db)):
    return authenticate(db, email, password)
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/backend/app/routes/auth.py",
  "relativePath": "app/routes/auth.py",
  "language": "python",
  "size": 310,
  "hash": "j1k2l3...",
  "functions": [
    {
      "kind": "function",
      "name": "login",
      "qualifiedName": null,
      "signature": "async def login(email: str, password: str, db: Session = Depends(get_db))",
      "parameters": [
        { "name": "email", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "password", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "db", "typeAnnotation": "Session", "hasDefault": true, "isRest": false }
      ],
      "returnType": null,
      "isExported": true,
      "isAsync": true,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 9, "endLine": 10, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": { "method": "POST", "path": "/api/login" },
      "enrichments": [
        {
          "pluginName": "fastapi",
          "route": { "method": "POST", "path": "/api/login" },
          "dbOperation": null,
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "API_ENDPOINT"
        }
      ]
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "authenticate",
      "receiver": null,
      "method": null,
      "argumentCount": 3,
      "argumentRefs": ["db", "email", "password"],
      "stringArgs": [],
      "enclosingFunction": "login",
      "location": { "startLine": 10, "endLine": 10, "startColumn": 11, "endColumn": 43 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "app.services.auth_service",
      "resolvedPath": "/home/user/projects/backend/app/services/auth_service.py",
      "isExternal": false,
      "symbols": [{ "name": "authenticate", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 3, "endLine": 3, "startColumn": 0, "endColumn": 52 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "login",
      "localName": "login",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 9, "endLine": 9, "startColumn": 0, "endColumn": 0 }
    },
    {
      "kind": "export",
      "name": "router",
      "localName": "router",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 6, "endLine": 6, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

---

#### `backend/app/services/auth_service.py`

**Source code:**
```python
from sqlalchemy.orm import Session
from app.models.user import User

def authenticate(db: Session, email: str, password: str) -> dict:
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise ValueError("User not found")
    # simplified -- real code would verify hashed password
    return {"token": _generate_token(user), "user_id": user.id}

def _generate_token(user: User) -> str:
    import jwt
    return jwt.encode({"sub": user.id}, "secret", algorithm="HS256")
```

**IR JSON output:**
```json
{
  "path": "/home/user/projects/backend/app/services/auth_service.py",
  "relativePath": "app/services/auth_service.py",
  "language": "python",
  "size": 410,
  "hash": "m4n5o6...",
  "functions": [
    {
      "kind": "function",
      "name": "authenticate",
      "qualifiedName": null,
      "signature": "def authenticate(db: Session, email: str, password: str) -> dict",
      "parameters": [
        { "name": "db", "typeAnnotation": "Session", "hasDefault": false, "isRest": false },
        { "name": "email", "typeAnnotation": "str", "hasDefault": false, "isRest": false },
        { "name": "password", "typeAnnotation": "str", "hasDefault": false, "isRest": false }
      ],
      "returnType": "dict",
      "isExported": true,
      "isAsync": false,
      "isStatic": false,
      "accessibility": null,
      "location": { "startLine": 4, "endLine": 9, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": null,
      "enrichments": [
        {
          "pluginName": "sqlalchemy",
          "route": null,
          "dbOperation": { "table": "users", "operation": "read" },
          "httpCall": null,
          "renders": null,
          "middlewareOrder": null,
          "suggestedCategory": "DB_CALL"
        }
      ]
    },
    {
      "kind": "function",
      "name": "_generate_token",
      "qualifiedName": null,
      "signature": "def _generate_token(user: User) -> str",
      "parameters": [
        { "name": "user", "typeAnnotation": "User", "hasDefault": false, "isRest": false }
      ],
      "returnType": "str",
      "isExported": false,
      "isAsync": false,
      "isStatic": false,
      "accessibility": "private",
      "location": { "startLine": 11, "endLine": 13, "startColumn": 0, "endColumn": 0 },
      "endpointInfo": null,
      "enrichments": []
    }
  ],
  "calls": [
    {
      "kind": "call",
      "callee": "db.query",
      "receiver": "db",
      "method": "query",
      "argumentCount": 1,
      "argumentRefs": ["User"],
      "stringArgs": [],
      "enclosingFunction": "authenticate",
      "location": { "startLine": 5, "endLine": 5, "startColumn": 11, "endColumn": 57 },
      "enrichments": []
    },
    {
      "kind": "call",
      "callee": "_generate_token",
      "receiver": null,
      "method": null,
      "argumentCount": 1,
      "argumentRefs": ["user"],
      "stringArgs": [],
      "enclosingFunction": "authenticate",
      "location": { "startLine": 9, "endLine": 9, "startColumn": 15, "endColumn": 37 },
      "enrichments": []
    }
  ],
  "imports": [
    {
      "kind": "import",
      "modulePath": "sqlalchemy.orm",
      "resolvedPath": null,
      "isExternal": true,
      "symbols": [{ "name": "Session", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 1, "endLine": 1, "startColumn": 0, "endColumn": 34 }
    },
    {
      "kind": "import",
      "modulePath": "app.models.user",
      "resolvedPath": "/home/user/projects/backend/app/models/user.py",
      "isExternal": false,
      "symbols": [{ "name": "User", "alias": null }],
      "defaultImport": null,
      "namespaceImport": null,
      "location": { "startLine": 2, "endLine": 2, "startColumn": 0, "endColumn": 32 }
    }
  ],
  "exports": [
    {
      "kind": "export",
      "name": "authenticate",
      "localName": "authenticate",
      "isDefault": false,
      "fromModule": null,
      "location": { "startLine": 4, "endLine": 4, "startColumn": 0, "endColumn": 0 }
    }
  ],
  "classes": []
}
```

---

### 3.4 Orchestrator Stitching Walkthrough

After both analyzers run and produce IR JSON, the orchestrator performs the following steps:

#### Step 1: Load Both IR Files

The orchestrator reads `frontend-ir.json` and `backend-ir.json`, creating a unified in-memory index of all functions, calls, imports, and exports across both repositories.

#### Step 2: Cross-File Resolution (Within Each Repo)

**Frontend repo:**
- `UsersPage.tsx` imports `fetchUsers` from `../api/users.ts`. The orchestrator resolves this: function `UsersPage` calls `fetchUsers` (via the `useEffect` → `fetchUsers` call chain). A `CALLS` edge is created: `UsersPage → fetchUsers`.
- `LoginPage.tsx` imports `apiClient` from `../api/client.ts`. The `handleLogin` function calls `apiClient.post(...)`. The orchestrator traces through the import to understand `apiClient` is an axios instance.
- `App.tsx` imports `LoginPage` and `UsersPage`. The `renders` enrichment creates rendering relationships.

**Backend repo:**
- `routes/users.py` imports `get_all_users` and `create_user` from `services/user_service.py`. The calls inside `get_users` → `get_all_users` and `create_new_user` → `create_user` are resolved as `CALLS` edges.
- `routes/auth.py` imports `authenticate` from `services/auth_service.py`. The call `login` → `authenticate` is resolved.
- `services/user_service.py` imports `User` from `models/user.py` (for ORM calls).
- `services/auth_service.py` imports `User` from `models/user.py`.

#### Step 3: Function Categorization

Using enrichments and heuristics:

| Function | Category | Basis |
|----------|----------|-------|
| `App` | UI_INTERACTION | React component (renders other components) |
| `LoginPage` | UI_INTERACTION | React component with onClick handler |
| `handleLogin` | API_CALLER | Calls `apiClient.post("/api/login")` |
| `UsersPage` | UI_INTERACTION | React component with useEffect |
| `fetchUsers` | API_CALLER | Calls `apiClient.get("/api/users")` via enrichment |
| `createUser` | API_CALLER | Calls `apiClient.post("/api/users")` via enrichment |
| `UserCard` | UI_INTERACTION | React component |
| `get_users` | API_ENDPOINT | `endpointInfo: { method: "GET", path: "/api/users" }` |
| `create_new_user` | API_ENDPOINT | `endpointInfo: { method: "POST", path: "/api/users" }` |
| `login` | API_ENDPOINT | `endpointInfo: { method: "POST", path: "/api/login" }` |
| `get_all_users` | DB_CALL | `dbOperation: { table: "users", operation: "read" }` |
| `create_user` | DB_CALL | `dbOperation: { table: "users", operation: "write" }` |
| `authenticate` | DB_CALL | `dbOperation: { table: "users", operation: "read" }` |
| `_hash_password` | UTILITY | No enrichment, private function |
| `_generate_token` | UTILITY | No enrichment, private function |

#### Step 4: Cross-Repo API Stitching

The orchestrator collects all API_CALLER functions and all API_ENDPOINT functions, then matches by HTTP method + URL pattern:

**Match 1: `fetchUsers` (frontend) → `GET /api/users` → `get_users` (backend)**
```
Caller:   fetchUsers      | httpCall.method = "GET"  | httpCall.urlPattern = "/api/users"
Endpoint: get_users       | endpointInfo.method = "GET" | endpointInfo.path = "/api/users"
          ↓ normalize both paths
          "api/users" === "api/users"  ✓ MATCH
```
Creates: `fetchUsers --CALLS_API--> APIEndpoint(GET /api/users) <--EXPOSES-- get_users`

**Match 2: `createUser` (frontend) → `POST /api/users` → `create_new_user` (backend)**
```
Caller:   createUser          | httpCall.method = "POST" | httpCall.urlPattern = "/api/users"
Endpoint: create_new_user     | endpointInfo.method = "POST" | endpointInfo.path = "/api/users"
          ↓ normalize
          "api/users" === "api/users"  ✓ MATCH
```
Creates: `createUser --CALLS_API--> APIEndpoint(POST /api/users) <--EXPOSES-- create_new_user`

**Match 3: `handleLogin` (frontend) → `POST /api/login` → `login` (backend)**
```
Caller:   handleLogin    | httpCall.method = "POST" | httpCall.urlPattern = "/api/login"
Endpoint: login          | endpointInfo.method = "POST" | endpointInfo.path = "/api/login"
          ↓ normalize
          "api/login" === "api/login"  ✓ MATCH
```
Creates: `handleLogin --CALLS_API--> APIEndpoint(POST /api/login) <--EXPOSES-- login`

#### Step 5: Resulting Neo4j Graph

**Nodes:**

| Label | ID / Key | Properties |
|-------|----------|------------|
| Project | `proj-1` | `name: "my-fullstack-app"` |
| Repository | `repo-fe` | `name: "frontend"` |
| Repository | `repo-be` | `name: "backend"` |
| File | `file-app` | `path: "src/App.tsx"` |
| File | `file-login` | `path: "src/pages/LoginPage.tsx"` |
| File | `file-users-page` | `path: "src/pages/UsersPage.tsx"` |
| File | `file-api-users` | `path: "src/api/users.ts"` |
| File | `file-api-client` | `path: "src/api/client.ts"` |
| File | `file-usercard` | `path: "src/components/UserCard.tsx"` |
| File | `file-routes-users` | `path: "app/routes/users.py"` |
| File | `file-routes-auth` | `path: "app/routes/auth.py"` |
| File | `file-svc-user` | `path: "app/services/user_service.py"` |
| File | `file-svc-auth` | `path: "app/services/auth_service.py"` |
| File | `file-model-user` | `path: "app/models/user.py"` |
| Function | `fn-app` | `name: "App", category: UI_INTERACTION` |
| Function | `fn-loginpage` | `name: "LoginPage", category: UI_INTERACTION` |
| Function | `fn-handlelogin` | `name: "handleLogin", category: API_CALLER` |
| Function | `fn-userspage` | `name: "UsersPage", category: UI_INTERACTION` |
| Function | `fn-fetchusers` | `name: "fetchUsers", category: API_CALLER` |
| Function | `fn-createuser-fe` | `name: "createUser", category: API_CALLER` |
| Function | `fn-usercard` | `name: "UserCard", category: UI_INTERACTION` |
| Function | `fn-get-users` | `name: "get_users", category: API_ENDPOINT` |
| Function | `fn-create-new-user` | `name: "create_new_user", category: API_ENDPOINT` |
| Function | `fn-login` | `name: "login", category: API_ENDPOINT` |
| Function | `fn-get-all-users` | `name: "get_all_users", category: DB_CALL` |
| Function | `fn-create-user-be` | `name: "create_user", category: DB_CALL` |
| Function | `fn-authenticate` | `name: "authenticate", category: DB_CALL` |
| APIEndpoint | `ep-get-users` | `method: "GET", path: "/api/users"` |
| APIEndpoint | `ep-post-users` | `method: "POST", path: "/api/users"` |
| APIEndpoint | `ep-post-login` | `method: "POST", path: "/api/login"` |
| DBTable | `tbl-users` | `name: "users"` |

**Relationships:**

```
repo-fe --BELONGS_TO--> proj-1
repo-be --BELONGS_TO--> proj-1

file-app --IN_REPO--> repo-fe
file-login --IN_REPO--> repo-fe
file-users-page --IN_REPO--> repo-fe
file-api-users --IN_REPO--> repo-fe
file-api-client --IN_REPO--> repo-fe
file-usercard --IN_REPO--> repo-fe

file-routes-users --IN_REPO--> repo-be
file-routes-auth --IN_REPO--> repo-be
file-svc-user --IN_REPO--> repo-be
file-svc-auth --IN_REPO--> repo-be
file-model-user --IN_REPO--> repo-be

fn-app --DEFINED_IN--> file-app
fn-loginpage --DEFINED_IN--> file-login
fn-handlelogin --DEFINED_IN--> file-login
fn-userspage --DEFINED_IN--> file-users-page
fn-fetchusers --DEFINED_IN--> file-api-users
fn-createuser-fe --DEFINED_IN--> file-api-users
fn-usercard --DEFINED_IN--> file-usercard
fn-get-users --DEFINED_IN--> file-routes-users
fn-create-new-user --DEFINED_IN--> file-routes-users
fn-login --DEFINED_IN--> file-routes-auth
fn-get-all-users --DEFINED_IN--> file-svc-user
fn-create-user-be --DEFINED_IN--> file-svc-user
fn-authenticate --DEFINED_IN--> file-svc-auth

-- Intra-repo CALLS (frontend)
fn-userspage --CALLS--> fn-fetchusers
fn-loginpage --CALLS--> fn-handlelogin

-- Intra-repo CALLS (backend)
fn-get-users --CALLS--> fn-get-all-users
fn-create-new-user --CALLS--> fn-create-user-be
fn-login --CALLS--> fn-authenticate

-- API endpoints EXPOSES
fn-get-users --EXPOSES--> ep-get-users
fn-create-new-user --EXPOSES--> ep-post-users
fn-login --EXPOSES--> ep-post-login

-- Cross-repo CALLS_API
fn-fetchusers --CALLS_API--> ep-get-users
fn-createuser-fe --CALLS_API--> ep-post-users
fn-handlelogin --CALLS_API--> ep-post-login

-- DB operations
fn-get-all-users --READS--> tbl-users
fn-create-user-be --WRITES--> tbl-users
fn-authenticate --READS--> tbl-users

-- File imports
file-users-page --IMPORTS {symbols: ["fetchUsers"]}--> file-api-users
file-login --IMPORTS {symbols: ["apiClient"]}--> file-api-client
file-app --IMPORTS {symbols: ["LoginPage"]}--> file-login
file-app --IMPORTS {symbols: ["UsersPage"]}--> file-users-page
file-routes-users --IMPORTS {symbols: ["get_all_users","create_user"]}--> file-svc-user
file-routes-auth --IMPORTS {symbols: ["authenticate"]}--> file-svc-auth
file-svc-user --IMPORTS {symbols: ["User"]}--> file-model-user
file-svc-auth --IMPORTS {symbols: ["User"]}--> file-model-user
```

#### Step 6: What the User Sees — Tracing LoginPage to Database

When a user clicks on `LoginPage` in the graph explorer and selects "Trace end-to-end flow," the UI queries Neo4j:

```cypher
MATCH path = (start:Function {name: "LoginPage"})-[:CALLS|CALLS_API|EXPOSES*]->(end)
WHERE end:DBTable OR NOT (end)-[:CALLS|CALLS_API]->()
RETURN path
```

The resulting flow visualization:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  LoginPage   │────>│ handleLogin  │────>│ APIEndpoint              │
│  (UI_INTER.) │CALLS│ (API_CALLER) │CALLS│ POST /api/login          │
│  LoginPage   │     │ LoginPage    │ API │ routes/auth.py           │
│  .tsx        │     │ .tsx         │     │                          │
└──────────────┘     └──────────────┘     └────────────┬─────────────┘
                                                       │ EXPOSES
                                                       ▼
                                          ┌──────────────────────────┐
                                          │  login                   │
                                          │  (API_ENDPOINT)          │
                                          │  routes/auth.py          │
                                          └────────────┬─────────────┘
                                                       │ CALLS
                                                       ▼
                                          ┌──────────────────────────┐
                                          │  authenticate            │
                                          │  (DB_CALL)               │
                                          │  services/auth_service.py│
                                          └────────────┬─────────────┘
                                                       │ READS
                                                       ▼
                                          ┌──────────────────────────┐
                                          │  users                   │
                                          │  (DBTable)               │
                                          └──────────────────────────┘
```

The user sees the complete chain: **LoginPage** (React component) calls **handleLogin** (API caller), which hits **POST /api/login** (API endpoint), served by **login** (FastAPI route handler), which calls **authenticate** (database function), which reads from the **users** table. Five hops, two repositories, two languages, one unified graph.

---

## 4. Analyzer CLI Interface

### Standard Command Format

Every analyzer follows the same CLI contract:

```bash
veograph-analyze-<lang> \
  --repo /path/to/repo \
  --repo-name my-repo \
  --output /path/to/output/ir.json \
  [--config /path/to/config.yaml] \
  [--incremental /path/to/previous-ir.json] \
  [--verbose]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--repo` | Yes | Absolute path to the repository root directory. |
| `--repo-name` | Yes | Short name for the repository (used in function IDs and the IR JSON). |
| `--output` | Yes | Path where the IR JSON file will be written. |
| `--config` | No | Path to an analyzer-specific configuration file. Defaults to `.veograph.yaml` in the repo root. |
| `--incremental` | No | Path to a previous IR JSON file. Only re-analyzes files whose hash has changed. |
| `--verbose` | No | Print detailed progress to stderr. |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success. IR JSON written to `--output`. |
| `1` | Partial success. IR JSON written but some files could not be parsed. Warnings printed to stderr. |
| `2` | Failure. No IR JSON written. Error details printed to stderr. |
| `3` | Configuration error. Invalid arguments or config file. |

### Stdout/Stderr Contract

- **stdout**: Reserved for structured progress JSON (one JSON line per event). The orchestrator reads these to report progress.
- **stderr**: Human-readable logs and error messages. Not parsed by the orchestrator.

Progress events on stdout (JSON Lines format):

```jsonl
{"event": "start", "totalFiles": 42, "timestamp": "2026-03-30T14:22:00Z"}
{"event": "file_complete", "file": "src/api/users.ts", "index": 1, "totalFiles": 42}
{"event": "file_complete", "file": "src/pages/LoginPage.tsx", "index": 2, "totalFiles": 42}
{"event": "file_error", "file": "src/broken.ts", "error": "Syntax error at line 15", "index": 3, "totalFiles": 42}
{"event": "complete", "filesAnalyzed": 41, "filesErrored": 1, "timestamp": "2026-03-30T14:22:05Z"}
```

### Incremental Analysis

When `--incremental` is provided, the analyzer:

1. Reads the previous IR JSON file.
2. Builds a hash index: `{ relativePath: hash }`.
3. Walks the repository, computing SHA-256 hashes for each source file.
4. For files whose hash matches the previous run: copies the existing `FileIR` entry unchanged.
5. For files whose hash differs or that are new: performs full analysis.
6. For files that existed in the previous run but no longer exist: omits them (deletion).

This reduces analysis time dramatically for large repositories where only a few files change between runs.

### Configuration File (`.veograph.yaml`)

```yaml
# .veograph.yaml — placed in repository root
include:
  - "src/**"
  - "lib/**"
  - "app/**"

exclude:
  - "**/__tests__/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/node_modules/**"
  - "**/.venv/**"
  - "**/dist/**"
  - "**/build/**"

# Framework plugins to enable (analyzer-specific)
plugins:
  - fastapi
  - sqlalchemy

# Language-specific options
options:
  # Python analyzer: which import roots to use for resolution
  import_roots:
    - "app"
  # TypeScript analyzer: path to tsconfig
  tsconfig: "tsconfig.json"
```

### Analyzer Validation

Before the orchestrator accepts an IR JSON file, it performs schema validation:

1. Check that `$schema` is `"veograph-ir-v1"`.
2. Check that `version` is a recognized version (semver compatible with the orchestrator).
3. Validate the JSON structure against the schema (all required fields present, correct types).
4. Log warnings for any unknown fields (forward compatibility).

If validation fails, the orchestrator reports the error and skips that repository from stitching (but does not abort the entire analysis).

---

## 5. Orchestrator Pipeline

The orchestrator replaces the current monolithic `runPipeline()` function in `packages/analysis/src/pipeline.ts`. Instead of receiving pre-parsed `ParsedFile[]` objects (which requires all parsing to happen in the Node.js process), it spawns external analyzer processes and reads their JSON output.

### Pipeline Steps

```
                    ┌──────────────────────────────────┐
                    │  Step 0: Analyzer Discovery       │
                    │  Read project config              │
                    │  Match repos to analyzers by ext  │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  Step 1: Invoke Analyzers         │
                    │  Spawn one process per repo       │
                    │  Run in parallel                  │
                    │  Stream progress events           │
                    │  Wait for all to complete         │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  Step 2: Read & Validate IR JSON  │
                    │  Parse each ir.json               │
                    │  Schema-validate                  │
                    │  Build in-memory indexes          │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  Step 3: Cross-File Resolution    │
                    │  Per repo: match imports→exports  │
                    │  Build function CALLS edges       │
                    │  (Same algorithm as current       │
                    │   cross-file-resolution.ts)       │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  Step 4: Function Categorization  │
                    │  Use enrichments to assign cats   │
                    │  Heuristic fallbacks              │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  Step 5: Cross-Repo Stitching     │
                    │  Collect API_CALLERs              │
                    │  Collect API_ENDPOINTs            │
                    │  Match by method + path           │
                    │  Create CALLS_API edges           │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  Step 6: Graph Storage            │
                    │  Generate Cypher statements       │
                    │  Execute against Neo4j            │
                    └──────────────────────────────────┘
```

### Step 0: Analyzer Discovery

```typescript
interface AnalyzerAssignment {
  repoName: string;
  repoPath: string;
  analyzerCommand: string;
  outputPath: string;
}

function discoverAnalyzers(
  projectConfig: ProjectConfig,
  repos: RepoConfig[],
): AnalyzerAssignment[] {
  const assignments: AnalyzerAssignment[] = [];
  for (const repo of repos) {
    // Scan repo for file extensions
    const extensions = scanExtensions(repo.rootPath);
    // Find matching analyzer
    const analyzer = projectConfig.analyzers.find(a =>
      a.extensions.some(ext => extensions.has(ext))
    );
    if (!analyzer) {
      log.warn(`No analyzer found for ${repo.name}, skipping`);
      continue;
    }
    assignments.push({
      repoName: repo.name,
      repoPath: repo.rootPath,
      analyzerCommand: analyzer.command,
      outputPath: path.join(tempDir, `${repo.name}-ir.json`),
    });
  }
  return assignments;
}
```

### Step 1: Invoke Analyzers (Parallel)

```typescript
async function invokeAnalyzers(
  assignments: AnalyzerAssignment[],
  onProgress: ProgressCallback,
): Promise<Map<string, string>> {
  const results = new Map<string, string>(); // repoName -> outputPath

  const promises = assignments.map(async (assignment) => {
    const args = [
      "--repo", assignment.repoPath,
      "--repo-name", assignment.repoName,
      "--output", assignment.outputPath,
    ];

    const proc = spawn(assignment.analyzerCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Stream progress from stdout (JSON Lines)
    const rl = readline.createInterface({ input: proc.stdout });
    for await (const line of rl) {
      try {
        const event = JSON.parse(line);
        onProgress("analyzer", `[${assignment.repoName}] ${event.event}`, 0);
      } catch {
        // Ignore non-JSON lines
      }
    }

    const exitCode = await new Promise<number>((resolve) => {
      proc.on("close", resolve);
    });

    if (exitCode === 0 || exitCode === 1) {
      results.set(assignment.repoName, assignment.outputPath);
    } else {
      log.error(`Analyzer failed for ${assignment.repoName} (exit ${exitCode})`);
    }
  });

  await Promise.all(promises);
  return results;
}
```

### Step 2: Read & Validate IR JSON

```typescript
function readIrFiles(
  irPaths: Map<string, string>,
): Map<string, IrDocument> {
  const documents = new Map<string, IrDocument>();

  for (const [repoName, filePath] of irPaths) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const doc = JSON.parse(raw) as IrDocument;

    // Validate schema version
    if (doc.$schema !== "veograph-ir-v1") {
      throw new Error(`Unknown IR schema: ${doc.$schema}`);
    }

    // Validate required fields exist
    validateIrDocument(doc);

    documents.set(repoName, doc);
  }

  return documents;
}
```

### Step 3: Cross-File Resolution

This step reuses the same algorithm as the current `resolveCrossFileConnections()` in `packages/analysis/src/steps/cross-file-resolution.ts`, but operates on the deserialized IR JSON instead of in-memory `IRNode` objects. The algorithm is:

1. Build an export index: for each file, map exported symbol names to their function IDs.
2. For each file, iterate over its imports. For each imported symbol, look up the resolved path in the export index to find the target function.
3. For each file, iterate over its calls. If a call's `callee` matches an imported symbol name, create a `CALLS` edge from the enclosing function to the resolved target function.

### Step 4: Function Categorization

Same as the current `categorizeAll()` step. The orchestrator uses enrichments from the IR JSON to assign categories:

- If `enrichments[].suggestedCategory` is set, use it.
- If `endpointInfo` is set, category = `API_ENDPOINT`.
- If `enrichments[].httpCall` is set, category = `API_CALLER`.
- If `enrichments[].dbOperation` is set, category = `DB_CALL`.
- If `enrichments[].renders` is set, category = `UI_INTERACTION`.
- Fallback: `UTILITY`.

### Step 5: Cross-Repo Stitching

Same algorithm as the current `stitchCrossRepoApis()`, but enhanced for cross-language support (see Section 6).

### Step 6: Graph Storage

Same as the current `generateCypherStatements()`. Produces Cypher MERGE statements for all nodes and relationships, then executes them against Neo4j.

---

## 6. Cross-Language Stitching Algorithm

Cross-language stitching is the core value proposition of VeoGraph's federated architecture. It connects functions across different programming languages by matching API caller signatures to API endpoint signatures.

### Input Data

From all IR files, the stitcher collects two lists:

**API Callers** — functions with `enrichments[].httpCall` or calls to known HTTP client patterns:
```
{ functionId, httpMethod, urlPattern, repoName }
```

**API Endpoints** — functions with `endpointInfo` or `enrichments[].route`:
```
{ functionId, httpMethod, routePath, repoName }
```

### Normalization Algorithm

Before matching, both caller URLs and endpoint routes are normalized to a canonical form:

```typescript
function normalizePath(path: string): NormalizedPath {
  let normalized = path
    // 1. Remove leading/trailing slashes
    .replace(/^\/+|\/+$/g, "")
    // 2. Lowercase
    .toLowerCase()
    // 3. Normalize path parameters from all syntaxes to a common form
    .replace(/:([a-zA-Z_]\w*)/g, "{param}")     // Express :id → {param}
    .replace(/\{([a-zA-Z_]\w*)\}/g, "{param}")   // FastAPI/Spring {id} → {param}
    .replace(/<([a-zA-Z_]\w*(?::[^>]+)?)>/g, "{param}") // Flask <id> or <int:id> → {param}
    .replace(/\[([a-zA-Z_]\w*)\]/g, "{param}");  // Next.js [id] → {param}

  // 4. Split into segments for partial matching
  const segments = normalized.split("/").filter(Boolean);

  return { normalized, segments };
}
```

### Matching Rules

The matcher applies the following rules in order, from most specific to least specific:

**Rule 1: Exact Match**
```
normalized(caller.urlPattern) === normalized(endpoint.routePath)
AND caller.httpMethod === endpoint.httpMethod
```
Example: `GET /api/users` matches `GET /api/users`.

**Rule 2: Suffix Match (handles base URL prefixes)**
```
normalized(caller.urlPattern).endsWith(normalized(endpoint.routePath))
OR normalized(endpoint.routePath).endsWith(normalized(caller.urlPattern))
AND caller.httpMethod === endpoint.httpMethod
```
Example: `GET http://localhost:8000/api/users` matches `GET /api/users` because after normalization `"localhost:8000/api/users"` ends with `"api/users"`.

**Rule 3: Parameterized Match (handles path parameters)**

After normalizing all path parameters to `{param}`, compare segment by segment:

```
segments(caller) = ["api", "users", "{param}"]
segments(endpoint) = ["api", "users", "{param}"]
→ Match if all segments are equal
```

Example: `GET /api/users/:id` (Express) matches `GET /api/users/{user_id}` (FastAPI).

**Rule 4: Version-Aware Match**

Detect API version prefixes and match across versions if a strict match isn't found:

```typescript
function stripVersionPrefix(segments: string[]): { version: string | null, rest: string[] } {
  if (segments.length > 0 && /^v\d+$/.test(segments[0])) {
    return { version: segments[0], rest: segments.slice(1) };
  }
  return { version: null, rest: segments };
}
```

Matching logic:
1. First, try matching with version prefixes included (strict).
2. If no match, strip version prefixes from both sides and retry.
3. If a match is found with stripped versions, log a warning about version mismatch.

Example: `GET /v1/users` matches `GET /v2/users` with a warning.

### Full Stitching Function

```typescript
interface ApiCaller {
  functionId: string;
  httpMethod: string;
  urlPattern: string;
  repoName: string;
}

interface ApiEndpoint {
  functionId: string;
  httpMethod: string;
  routePath: string;
  repoName: string;
}

interface CrossRepoLink {
  callerId: string;
  endpointId: string;
  httpMethod: string;
  urlPattern: string;
  matchConfidence: "exact" | "suffix" | "parameterized" | "version-stripped";
}

function stitchCrossLanguageApis(
  callers: ApiCaller[],
  endpoints: ApiEndpoint[],
): CrossRepoLink[] {
  const links: CrossRepoLink[] = [];

  // Pre-normalize all endpoints for efficient lookup
  const normalizedEndpoints = endpoints.map(ep => ({
    ...ep,
    norm: normalizePath(ep.routePath),
    stripped: stripVersionPrefix(normalizePath(ep.routePath).segments),
  }));

  for (const caller of callers) {
    const callerNorm = normalizePath(caller.urlPattern);
    const callerStripped = stripVersionPrefix(callerNorm.segments);

    for (const ep of normalizedEndpoints) {
      // Skip same-repo matches (those are handled by cross-file resolution)
      // Actually, DO match same-repo for microservice architectures where
      // a service calls itself through HTTP
      if (caller.functionId === ep.functionId) continue;

      // Must match HTTP method
      if (caller.httpMethod.toUpperCase() !== ep.httpMethod.toUpperCase()) continue;

      let confidence: CrossRepoLink["matchConfidence"] | null = null;

      // Rule 1: Exact match
      if (callerNorm.normalized === ep.norm.normalized) {
        confidence = "exact";
      }
      // Rule 2: Suffix match
      else if (
        callerNorm.normalized.endsWith(ep.norm.normalized) ||
        ep.norm.normalized.endsWith(callerNorm.normalized)
      ) {
        confidence = "suffix";
      }
      // Rule 3: Parameterized match (segment-by-segment)
      else if (segmentsMatch(callerNorm.segments, ep.norm.segments)) {
        confidence = "parameterized";
      }
      // Rule 4: Version-stripped match
      else if (segmentsMatch(callerStripped.rest, ep.stripped.rest)) {
        confidence = "version-stripped";
      }

      if (confidence) {
        links.push({
          callerId: caller.functionId,
          endpointId: ep.functionId,
          httpMethod: caller.httpMethod,
          urlPattern: ep.routePath,
          matchConfidence: confidence,
        });
      }
    }
  }

  return links;
}

function segmentsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i]);
}
```

### Handling HTTP Client Patterns Across Languages

Each language has different HTTP client patterns. The analyzer is responsible for recognizing them and setting `enrichments[].httpCall` or including them in `stringArgs`. Here is a reference table:

| Language | Library | Call Pattern | Method Detection | URL Source |
|----------|---------|-------------|------------------|------------|
| JS/TS | `fetch` | `fetch(url, { method })` | 2nd arg `method` field, default GET | 1st arg string |
| JS/TS | `axios` | `axios.get(url)` / `axios({ method, url })` | Method name or config `method` | 1st arg or config `url` |
| JS/TS | `ky` | `ky.get(url)` | Method name | 1st arg string |
| Python | `requests` | `requests.get(url)` | Method name | 1st arg string |
| Python | `httpx` | `httpx.get(url)` / `client.get(url)` | Method name | 1st arg string |
| Python | `aiohttp` | `session.get(url)` | Method name | 1st arg string |
| Go | `net/http` | `http.Get(url)` / `http.NewRequest("GET", url, ...)` | Function name or 1st arg | URL arg |
| Go | `resty` | `client.R().Get(url)` | Method name | 1st arg string |
| Java | `RestTemplate` | `template.getForObject(url, ...)` | Method prefix | 1st arg string |
| Java | `WebClient` | `client.get().uri(url)` | Method name | `.uri()` arg |

### Handling Route Registration Patterns Across Languages

| Language | Framework | Pattern | Method | Path |
|----------|-----------|---------|--------|------|
| JS/TS | Express | `app.get("/path", handler)` | Method name | 1st string arg |
| JS/TS | Express | `router.route("/path").get(handler)` | Chained method | `.route()` arg |
| JS/TS | Fastify | `fastify.get("/path", handler)` | Method name | 1st string arg |
| JS/TS | NestJS | `@Get("/path")` decorator on method | Decorator name | Decorator arg |
| Python | FastAPI | `@router.get("/path")` decorator | Decorator method | Decorator arg |
| Python | Flask | `@app.route("/path", methods=["GET"])` | `methods` kwarg | 1st arg |
| Python | Django | `path("route/", view)` in urls.py | Inferred from view | 1st string arg |
| Go | Gin | `r.GET("/path", handler)` | Method name | 1st string arg |
| Go | Chi | `r.Get("/path", handler)` | Method name | 1st string arg |
| Go | net/http | `http.HandleFunc("/path", handler)` | Default ALL | 1st string arg |
| Java | Spring | `@GetMapping("/path")` | Annotation name | Annotation value |

---

## 7. Migration Path

The migration from the current monolithic pipeline to the federated architecture must be **incremental and verifiable** at each step. At no point should the system produce different results than the current implementation.

### Phase 1: Define IR JSON Contract (This Document)

**Status:** This document.

**Deliverable:** The `veograph-ir-v1` JSON schema specification.

**Verification:** Review by all team members. No code changes yet.

### Phase 2: Add IR JSON Export to the Current JS/TS Pipeline

**Goal:** Make the existing JS/TS analyzer capable of outputting IR JSON without changing its behavior.

**Changes:**
1. Add a new function `exportIrJson(parsedFiles: ParsedFile[], config: RepoConfig): IrDocument` in `packages/analysis/src/ir-export.ts`.
2. This function takes the same `ParsedFile[]` that `runPipeline()` receives and transforms them into the `veograph-ir-v1` JSON format.
3. Add a CLI wrapper `packages/analysis/bin/veograph-analyze-ts.ts` that:
   - Accepts `--repo`, `--repo-name`, `--output` arguments.
   - Invokes the existing TypeScript parser on all files.
   - Calls `exportIrJson()`.
   - Writes the JSON to `--output`.

**Verification:** Round-trip test. For a set of test repositories:
1. Run the current pipeline and capture the Cypher output.
2. Run the new IR JSON export, then build a new pipeline that reads the IR JSON and produces Cypher.
3. Assert the Cypher outputs are identical (modulo UUIDs and timestamps).

### Phase 3: Build Orchestrator that Reads IR JSON

**Goal:** Create a new entry point that replaces `runPipeline()` with the federated orchestrator.

**Changes:**
1. Create `packages/analysis/src/federated-pipeline.ts` with a `runFederatedPipeline()` function.
2. This function:
   - Invokes analyzer CLIs (for now, only `veograph-analyze-ts`).
   - Reads the resulting IR JSON files.
   - Converts IR JSON back into the internal `FileAnalysis` / `FunctionRecord` types.
   - Runs the existing cross-file resolution, categorization, and stitching steps unchanged.
   - Produces the same `PipelineResult`.

**Verification:** Same round-trip test as Phase 2. The federated pipeline must produce identical output to the monolithic pipeline.

### Phase 4: Build Python Analyzer

**Goal:** Create the first non-JS analyzer, written in Python.

**Implementation:**
1. New repository or directory: `analyzers/python/`.
2. Python package using `ast` module for parsing.
3. Framework plugins: FastAPI, Flask, Django, SQLAlchemy, Prisma.
4. CLI entry point: `veograph-analyze-python`.
5. Outputs `veograph-ir-v1` JSON.

**Verification:**
1. Unit tests: Python source files → IR JSON, verified against expected output.
2. Integration test: Analyze a FastAPI backend, verify endpoints appear in IR with correct `endpointInfo`.

### Phase 5: Verify Cross-Language Stitching

**Goal:** Demonstrate end-to-end React + Python stitching.

**Test case:** The exact example from Section 3 of this document.

**Verification:**
1. Create a test fixture with the React frontend and Python backend from Section 3.
2. Run the federated pipeline with both analyzers.
3. Assert the resulting Neo4j graph contains all expected nodes and relationships.
4. Specifically verify: `fetchUsers --CALLS_API--> GET /api/users <--EXPOSES-- get_users`.

### Phase 6: Deprecate Monolithic Pipeline

**Goal:** Remove the old `runPipeline()` in favor of `runFederatedPipeline()`.

**Changes:**
1. Update `packages/api` to call `runFederatedPipeline()`.
2. Keep `runPipeline()` as a private internal function (used by `runFederatedPipeline()` for the JS/TS analyzer's in-process fast path).
3. Mark direct use of `runPipeline()` as deprecated.

### Phase 7: Add More Analyzers

After the architecture is proven with JS/TS + Python:

1. **Go analyzer** — written in Go, using `go/ast` and `go/types`.
2. **Java analyzer** — written in Java or Kotlin, using Eclipse JDT or JavaParser.
3. **Rust analyzer** — written in Rust, using `syn` and `ra_ap_syntax`.

Each new analyzer follows the same pattern: implement the CLI interface, output `veograph-ir-v1` JSON, add to the analyzer registry.

---

## 8. IR Contract Versioning

### Version Numbering

The IR contract follows semantic versioning:

- **Major** (e.g. `1.0.0` → `2.0.0`): Breaking changes. Existing fields removed or renamed. Existing semantics changed. Analyzers and orchestrator must update simultaneously.
- **Minor** (e.g. `1.0.0` → `1.1.0`): Additive changes. New optional fields added. New enrichment types. Old analyzers' output is still valid. New orchestrator can read old IR files.
- **Patch** (e.g. `1.0.0` → `1.0.1`): Clarifications to the spec. No schema changes. Documentation fixes.

### Compatibility Rules

**Forward compatibility (old orchestrator, new analyzer):**
- The orchestrator MUST ignore unknown fields in the IR JSON. This allows analyzers to add experimental fields without breaking the orchestrator.
- The orchestrator MUST NOT fail if an optional field is missing. Optional fields have defined defaults.

**Backward compatibility (new orchestrator, old analyzer):**
- The orchestrator MUST accept IR files with older minor versions. For example, an orchestrator that understands `1.2.0` must accept `1.0.0` and `1.1.0` files.
- The orchestrator MUST NOT accept IR files with a different major version. If the file says `2.0.0` but the orchestrator only knows `1.x`, it must reject with a clear error.

### Version Negotiation

At startup, the orchestrator queries each analyzer for its supported IR version:

```bash
veograph-analyze-python --version
```

Output:
```json
{"name": "veograph-analyze-python", "version": "1.2.0", "irVersion": "1.1.0"}
```

The orchestrator checks that `irVersion` is compatible (same major, any minor) before invoking the analyzer.

### Adding New Fields (Minor Version Bump)

Example: adding a `decorators` field to `FunctionIR` in version `1.1.0`.

1. Add the field as **optional** with a sensible default:
   ```
   "decorators": string[] | null    // New in v1.1.0. Default: null.
   ```
2. Update the spec document with the new field and its `Since: v1.1.0` annotation.
3. Update the orchestrator to use the field if present, fall back to the default if absent.
4. Update analyzers to populate the field when they can detect decorators.
5. Old analyzers that don't know about `decorators` will omit it. The orchestrator handles this gracefully.

### Breaking Changes (Major Version Bump)

Breaking changes should be extremely rare. When necessary:

1. Define the new major version schema as a separate document (`veograph-ir-v2`).
2. Implement a **migration tool** that converts `v1` IR files to `v2` format.
3. Update the orchestrator to accept both `v1` (via migration) and `v2` (native).
4. Give analyzer authors a migration window (at least 6 months) to update.
5. After the window, remove `v1` support from the orchestrator.

### Schema Registry

The canonical JSON Schema definition for each version is published at a well-known location in the repository:

```
packages/shared/schemas/
├── veograph-ir-v1.0.0.json
├── veograph-ir-v1.1.0.json
└── veograph-ir-v1.2.0.json
```

Analyzers can use these schemas for self-validation before writing output. The orchestrator uses them for input validation.

### Deprecation Process for Fields

If a field needs to be removed in a future major version:

1. **v1.x**: Mark the field as `@deprecated` in the schema documentation. Add a replacement field alongside it.
2. **v1.x+1**: The orchestrator logs a warning when it encounters the deprecated field.
3. **v2.0**: The deprecated field is removed from the schema.

Example:
```
// v1.0: "callee" is the only way to identify what's being called
// v1.1: Add "receiver" and "method" as structured alternatives
// v1.1 spec note: "callee" is deprecated in favor of "receiver"+"method"
//                  for member expressions. Still required for plain calls.
// v2.0: "callee" is removed; use "receiver"+"method" or "functionName"
```

---

## Appendix A: Comparison to Current Architecture

| Aspect | Current (Monolithic) | Federated |
|--------|---------------------|-----------|
| Language support | JS/TS only | Any language with an analyzer |
| Parser runtime | TypeScript Compiler API in-process | Language-native, out-of-process |
| Data transfer | In-memory TypeScript objects | JSON files on disk |
| Parallelism | Sequential file analysis | Parallel per-repository |
| Adding a language | Write parser in TypeScript | Write standalone analyzer in any language |
| Framework plugins | TS-only plugin interface | Analyzer-internal (can use any framework) |
| Cross-repo stitching | Same algorithm | Same algorithm, enhanced normalization |
| Testing | Unit tests in Vitest | Each analyzer has its own test suite |

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Analyzer** | A standalone CLI tool that parses source code in a specific language and outputs IR JSON. |
| **Orchestrator** | The central pipeline component that invokes analyzers, merges IR, and writes to Neo4j. |
| **IR** | Intermediate Representation — the language-neutral data model. |
| **IR JSON** | The serialized JSON format of the IR, conforming to `veograph-ir-v1`. |
| **Stitching** | The process of connecting API callers to API endpoints across repositories/languages. |
| **Enrichment** | Framework-specific metadata attached to IR nodes by plugins or analyzers. |
| **Cross-file resolution** | Connecting function calls to their targets across files within a single repository. |
| **Cross-repo stitching** | Connecting HTTP API callers to their endpoint handlers across repositories. |
