# ConfiAnalyzer System Architecture

**Date:** 2026-04-03

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Analysis Pipeline](#3-analysis-pipeline)
4. [IR JSON Contract](#4-ir-json-contract)
5. [Language Analyzers](#5-language-analyzers)
6. [Framework Plugin System](#6-framework-plugin-system)
7. [Orchestrator](#7-orchestrator)
8. [Cross-Repo API Stitching](#8-cross-repo-api-stitching)
9. [Graph Storage (Neo4j)](#9-graph-storage-neo4j)
10. [API Server](#10-api-server)
11. [NLP Query Engine](#11-nlp-query-engine)
12. [Frontend](#12-frontend)
13. [Extensibility Guide](#13-extensibility-guide)
14. [Deployment Architecture](#14-deployment-architecture)

---

## 1. System Overview

ConfiAnalyzer is a federated code analysis system that builds a unified relationship graph from multi-language, multi-repository codebases. It uses language-native parsers (each running in their own language runtime) to extract functions, calls, imports, exports, and framework-specific metadata, then stitches them together into a queryable graph stored in Neo4j.

The key design goals are:

- **Deterministic analysis** — identical input always produces identical output; no heuristics or regex for code structure
- **Language extensibility** — adding a new language requires a standalone analyzer that outputs standard IR JSON; no other component changes
- **Multi-repository support** — a project spans multiple repos in different languages; cross-repo relationships are first-class
- **Modularity via contracts** — the IR JSON contract is the only boundary between analyzers and the rest of the system
- **Framework extensibility** — each analyzer has a plugin system for detecting framework-specific patterns (routes, ORM calls, HTTP clients)

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User Interface                              │
│  ┌──────────┐ ┌──────────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │Dashboard │ │Graph Explorer│ │Flow Tracer│ │NLP Query Bar     │  │
│  └──────────┘ └──────────────┘ └───────────┘ └───────────────────┘  │
│  React + Vite + Cytoscape.js                         Port 5176      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST API
┌───────────────────────────────┴──────────────────────────────────────┐
│                          API Server                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │Projects  │ │Graph     │ │Analysis      │ │NLP Translation    │  │
│  │Routes    │ │Routes    │ │Routes        │ │Routes             │  │
│  └──────────┘ └──────────┘ └──────────────┘ └────────────────────┘  │
│  Express.js                                          Port 3006      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Cypher
┌───────────────────────────────┴──────────────────────────────────────┐
│                         Neo4j Graph Database                         │
│                                                                      │
│  Project ─[HAS_REPO]→ Repository ─[CONTAINS]→ File ─[DEFINES]→ Fn   │
│  Fn ─[CALLS]→ Fn    Fn ─[CALLS_API]→ Fn    Fn ─[READS/WRITES]→ Tbl │
│                                                      Port 7688       │
└──────────────────────────────────────────────────────────────────────┘
         ▲
         │ Cypher statements
┌────────┴─────────────────────────────────────────────────────────────┐
│                          Orchestrator                                │
│  Discovery → Invocation → IR Collection → Resolution → Stitching    │
│         → Categorization → Graph Writing                             │
└────────┬─────────┬──────────┬──────────┬──────────┬──────────────────┘
         │         │          │          │          │
    ┌────┴───┐ ┌───┴───┐ ┌───┴───┐ ┌───┴───┐ ┌───┴───┐
    │ JS/TS  │ │Python │ │  Go   │ │ Java  │ │ Rust  │
    │Analyzer│ │Analyzer│ │Analyzer│ │Analyzer│ │Analyzer│
    │        │ │       │ │       │ │       │ │       │
    │TS API  │ │ast    │ │go/ast │ │JavaPsr│ │syn    │
    └────┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
         │         │         │         │         │
         └─────────┴─────────┴─────────┴─────────┘
                             │
                    confianalyzer-ir-v1
                        (IR JSON)
```

The architecture enforces a strict separation:

- **Analyzers** know their language and its frameworks. They know nothing about Neo4j, the API, or the frontend.
- **The orchestrator** knows how to run analyzers, read IR JSON, resolve cross-file references, stitch cross-repo APIs, and write to Neo4j. It knows nothing about language-specific parsing.
- **The API server** knows how to query Neo4j and translate natural language to Cypher. It knows nothing about how the graph was built.
- **The frontend** knows how to display graphs and traces. It communicates only through the REST API.

---

## 3. Analysis Pipeline

The orchestrator runs a 7-step pipeline. Each step has a single responsibility and a clear input/output boundary.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 1. Discovery│────→│ 2. Invocation│────→│ 3. IR Read  │
│             │     │             │     │             │
│ Scan repos  │     │ Spawn       │     │ Read JSON   │
│ for file    │     │ analyzer    │     │ Validate    │
│ extensions  │     │ processes   │     │ schema      │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
┌─────────────┐     ┌─────────────┐     ┌──────┴──────┐
│ 6. Graph    │←────│ 5. Stitching│←────│ 4. Cross-   │
│    Write    │     │             │     │    File     │
│             │     │ Match API   │     │    Resolve  │
│ Generate    │     │ callers to  │     │             │
│ Cypher →    │     │ endpoints   │     │ Imports →   │
│ Neo4j       │     │ across repos│     │ Exports →   │
└─────────────┘     └─────────────┘     │ CALLS edges │
                                        └─────────────┘
```

| Step | Module | Input | Output |
|------|--------|-------|--------|
| 1. Discovery | `discovery.ts` | Repo paths + config | `AnalyzerAssignment[]` — which analyzer to run for each repo |
| 2. Invocation | `invoker.ts` | Assignments | `Map<repoName, irFilePath>` — IR JSON files on disk |
| 3. IR Read | `ir-reader.ts` | IR file paths | `Map<repoName, IrDocument>` — validated IR in memory |
| 4. Cross-File Resolution | `cross-file-resolution.ts` | IR documents | Resolved CALLS edges (import → export → function) |
| 5. Cross-Repo Stitching | `stitcher.ts` | API callers + endpoints | `CrossRepoLink[]` with confidence levels |
| 6. Categorization | `categorizer.ts` | Functions + enrichments | Category labels (API_ENDPOINT, DB_CALL, etc.) |
| 7. Graph Write | `graph-writer.ts` | All nodes + relationships | Parameterized Cypher statements → Neo4j |

---

## 4. IR JSON Contract

The IR contract (`confianalyzer-ir-v1`) is the single most important design element. It defines the boundary between language-specific analysis and language-neutral processing.

```
┌─────────────────────────────────────────────────────┐
│                    IrDocument                        │
│                                                     │
│  $schema: "confianalyzer-ir-v1"                     │
│  version, generatedAt                               │
│  analyzer: { name, version, language }              │
│  repository: { name, rootPath }                     │
│                                                     │
│  files: [                                           │
│    ┌─────────────────────────────────────────────┐  │
│    │                  FileIR                      │  │
│    │  path, relativePath, language, size, hash    │  │
│    │                                             │  │
│    │  functions: [                               │  │
│    │    { name, signature, parameters,           │  │
│    │      isExported, isAsync, location,          │  │
│    │      endpointInfo?, enrichments? }           │  │
│    │  ]                                          │  │
│    │  calls: [                                   │  │
│    │    { callee, receiver, method,              │  │
│    │      enclosingFunction, location,            │  │
│    │      enrichments? }                          │  │
│    │  ]                                          │  │
│    │  imports: [                                  │  │
│    │    { modulePath, resolvedPath, isExternal,   │  │
│    │      symbols, defaultImport }                │  │
│    │  ]                                          │  │
│    │  exports: [                                  │  │
│    │    { name, localName, isDefault, fromModule }│  │
│    │  ]                                          │  │
│    │  classes: [                                  │  │
│    │    { name, superClass, implements, methods } │  │
│    │  ]                                          │  │
│    │  enrichments?: [ FileEnrichment ]            │  │
│    └─────────────────────────────────────────────┘  │
│  ]                                                  │
└─────────────────────────────────────────────────────┘
```

### Enrichment Model

Enrichments are the mechanism for framework-specific metadata. They are optional overlays on functions and calls — the base IR is always produced regardless of which frameworks are detected.

```
┌──────────────────────────────────────────┐
│              Enrichment                   │
│                                          │
│  pluginName: "express" | "fastapi" | ... │
│                                          │
│  route?:       { method, path }          │  ← API endpoints
│  dbOperation?: { table, operation }      │  ← Database access
│  httpCall?:    { method, urlPattern }    │  ← HTTP client calls
│  renders?:     [ "Header", "Footer" ]    │  ← React components
│  suggestedCategory?: "API_ENDPOINT"      │  ← Categorization hint
└──────────────────────────────────────────┘
```

The enrichment fields cover the major categories of framework behavior:
- **Routes** — Express `app.get()`, FastAPI `@app.get()`, Spring `@GetMapping`, Actix `web::get()`
- **DB operations** — SQLAlchemy `session.query()`, JPA `@Entity`, Diesel `table!`
- **HTTP calls** — Axios `client.get()`, `requests.get()`, `http.Get()`
- **UI rendering** — React JSX component references

The `suggestedCategory` field lets plugins influence how the orchestrator categorizes each function without the orchestrator needing to understand any framework.

---

## 5. Language Analyzers

Each analyzer is a standalone binary that runs in its own language runtime and uses native compiler/parser APIs.

```
┌────────────────┬──────────────────────┬────────────────────────┐
│ Analyzer       │ Parser               │ Framework Plugins      │
├────────────────┼──────────────────────┼────────────────────────┤
│ JS/TS          │ TypeScript Compiler   │ Express, React, Axios  │
│ analyzers/     │ API (ts.createProgram)│                        │
│ js-ts/         │                      │                        │
├────────────────┼──────────────────────┼────────────────────────┤
│ Python         │ ast module           │ FastAPI, Flask,        │
│ analyzers/     │ (ast.parse)          │ SQLAlchemy             │
│ python/        │                      │                        │
├────────────────┼──────────────────────┼────────────────────────┤
│ Go             │ go/ast, go/parser    │ Gin, Chi, net/http     │
│ analyzers/go/  │                      │                        │
├────────────────┼──────────────────────┼────────────────────────┤
│ Java           │ JavaParser           │ Spring MVC/WebFlux,    │
│ analyzers/     │                      │ JAX-RS, JPA            │
│ java/          │                      │                        │
├────────────────┼──────────────────────┼────────────────────────┤
│ Rust           │ syn + proc-macro2    │ Actix-web, Axum,       │
│ analyzers/     │                      │ Diesel                 │
│ rust/          │                      │                        │
└────────────────┴──────────────────────┴────────────────────────┘
```

### Analyzer CLI Interface

Every analyzer accepts the same command-line arguments:

```
confianalyzer-<lang> \
  --repo /path/to/repository \
  --repo-name my-service \
  --output /tmp/ir.json \
  --incremental /prev/ir.json \    # optional: previous IR for delta analysis
  --config /path/.confianalyzer.yaml \  # optional: per-repo config
  --verbose
```

The orchestrator spawns each analyzer as a child process, streams JSON Lines progress from stdout, and reads the IR JSON from the `--output` path when the process exits.

### Internal Structure of an Analyzer

All analyzers follow the same internal pattern, implemented in their native language:

```
┌──────────────────────────────────────────────┐
│                  Analyzer                     │
│                                              │
│  ┌──────────┐    ┌──────────┐               │
│  │  CLI      │───→│ Analyzer │               │
│  │  (args)   │    │ Core     │               │
│  └──────────┘    └────┬─────┘               │
│                       │                      │
│              ┌────────┴────────┐             │
│              │                 │             │
│         ┌────┴─────┐    ┌─────┴──────┐      │
│         │AST Walker│    │ Plugin     │      │
│         │          │    │ Runner     │      │
│         │ Parse    │    │            │      │
│         │ source   │    │ Enrich IR  │      │
│         │ files    │    │ with       │      │
│         │ into IR  │    │ framework  │      │
│         │ structs  │    │ metadata   │      │
│         └──────────┘    └────────────┘      │
│                                              │
│  Output: confianalyzer-ir-v1 JSON            │
└──────────────────────────────────────────────┘
```

1. **CLI** parses arguments, loads config
2. **Analyzer core** walks the repository, finding source files
3. **AST walker** parses each file using the language's native AST and extracts functions, calls, imports, exports, classes
4. **Plugin runner** applies active framework plugins to enrich the IR with route, DB, HTTP call, and rendering metadata
5. **Output** writes the complete `IrDocument` as JSON

---

## 6. Framework Plugin System

Each analyzer has its own plugin system, implemented idiomatically in its language. The plugin interface varies by language but the contract is the same: detect whether a framework is used, then enrich functions and calls with metadata.

### Plugin Architecture

```
                    ┌─────────────────────┐
                    │   IR Contract        │  ← Shared output format
                    │  confianalyzer-ir-v1 │
                    └─────────┬───────────┘
                              │
        ┌─────────┬───────────┼───────────┬──────────┐
        │         │           │           │          │
   TS Analyzer  Python    Go Analyzer  Java      Rust
        │         │           │           │          │
    ┌───┴───┐  ┌──┴──┐    ┌──┴──┐    ┌──┴──┐   ┌──┴──┐
    Express  FastAPI  Gin    Spring   Actix
    React    Flask    Chi    JAX-RS   Axum
    Axios    SQLAlch  net/http JPA    Diesel
```

### TypeScript Plugin Interface

```typescript
// analyzers/js-ts/src/framework-plugins/index.ts
interface FrameworkPlugin {
  name: string;
  analyzeCall?(call: CallIR, node: ts.CallExpression,
               sourceFile: ts.SourceFile): Enrichment | null;
  analyzeFunction?(func: FunctionIR, node: ts.Node,
                   sourceFile: ts.SourceFile,
                   calls: CallIR[]): FunctionAnalysisResult | null;
}
```

Plugins return enrichment objects. The analyzer collects them into the IR.

### Python Plugin Interface

```python
# analyzers/python/confianalyzer_python/framework_plugins/__init__.py
class FrameworkPlugin(Protocol):
    def detect_imports(self, imports: list[dict]) -> bool:
        """Return True if this plugin's framework is imported."""
        ...
    def enrich_function(self, func_ir: dict,
                        func_node: ast.FunctionDef) -> None:
        """Mutate func_ir with endpointInfo / enrichments."""
        ...
    def enrich_call(self, call_ir: dict,
                    call_node: ast.Call) -> None:
        """Mutate call_ir with enrichments."""
        ...
```

Python plugins use import detection for auto-activation and mutate IR dicts in-place.

### Plugin Auto-Detection

Plugins are activated in two ways:

1. **Auto-detect** (default) — the analyzer scans file imports and activates plugins whose framework is detected
2. **Explicit config** — a `.confianalyzer.yaml` in the repo root specifies which plugins to enable

```yaml
# .confianalyzer.yaml
plugins:
  - express
  - react
  - axios
exclude:
  - "src/generated/**"
  - "**/*.test.ts"
```

---

## 7. Orchestrator

The orchestrator (`packages/orchestrator`) coordinates the entire analysis pipeline. It is language-agnostic — it only interacts with analyzers through process spawning and IR JSON.

### Discovery

```
Repository paths (from config)
        │
        ▼
┌──────────────────┐
│ Scan extensions  │  Walk each repo, collect file extensions
│ (.ts, .py, .go)  │  Skip: node_modules, .git, __pycache__, dist
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Match to config  │  config.analyzers maps extensions → commands
│                  │  First matching analyzer wins
└────────┬─────────┘
         │
         ▼
AnalyzerAssignment[]
  { repoName, repoPath, analyzerCommand, outputPath }
```

### Invocation

All analyzers run in **parallel** as child processes:

```
Orchestrator
    │
    ├──spawn──→ confianalyzer-ts --repo /frontend --output /tmp/ts.json
    │              └── stdout: {"event":"discovery","fileCount":42}
    │
    ├──spawn──→ confianalyzer-python --repo /backend --output /tmp/py.json
    │              └── stdout: {"event":"parsing","file":"app.py"}
    │
    └──spawn──→ confianalyzer-go --repo /gateway --output /tmp/go.json
                   └── stdout: {"event":"complete","functionCount":89}
```

### Cross-File Resolution

Within each repository, the resolver connects function calls to their definitions across files by matching imports to exports:

```
file_a.ts                     file_b.ts
┌──────────────────┐         ┌──────────────────┐
│ import { foo }   │────────→│ export function   │
│   from "./b"     │ IMPORTS │   foo() { ... }   │
│                  │         │                   │
│ function bar() { │         └──────────────────┘
│   foo()  ────────│─── CALLS edge created ───→ foo
│ }                │
└──────────────────┘
```

The resolution algorithm:
1. Build an export map: `(filePath, symbolName) → functionId`
2. For each import, resolve the module path to a file path
3. For each call whose callee matches an imported symbol, create a CALLS edge to the resolved function

### Categorization

The categorizer assigns one of 6 categories to every function based on enrichments and call patterns:

```
┌──────────────────┬────────────────────────────────────────────┐
│ Category         │ How Detected                               │
├──────────────────┼────────────────────────────────────────────┤
│ API_ENDPOINT     │ Has endpointInfo or route enrichment       │
│ API_CALLER       │ Has httpCall enrichment                    │
│ DB_CALL          │ Has dbOperation enrichment                 │
│ UI_INTERACTION   │ Has renders enrichment (JSX components)    │
│ HANDLER          │ Called by an API_ENDPOINT, no enrichment   │
│ UTILITY          │ Everything else                            │
└──────────────────┴────────────────────────────────────────────┘
```

---

## 8. Cross-Repo API Stitching

The stitcher matches HTTP client calls in one repository to API endpoint handlers in another. This is how ConfiAnalyzer builds the cross-language, cross-repo relationship graph.

### Path Normalization

Different frameworks use different parameter syntaxes. The stitcher normalizes all of them to a common form before matching:

```
Express:   /users/:id/posts     →  users/{param}/posts
FastAPI:   /users/{user_id}/posts →  users/{param}/posts
Flask:     /users/<int:id>/posts →  users/{param}/posts
Next.js:   /users/[id]/posts    →  users/{param}/posts
                                    ▲
                                    All match the same key
```

### Matching Algorithm

The stitcher applies 4 matching strategies in order of specificity:

```
API Caller                              API Endpoint
(repo: frontend)                        (repo: backend)

axios.get("/api/v1/users/123")          @app.get("/api/v1/users/{id}")
         │                                       │
         ▼                                       ▼
    Normalize path                          Normalize path
    "api/v1/users/{param}"                  "api/v1/users/{param}"
         │                                       │
         └────────────────┬──────────────────────┘
                          │
              ┌───────────┴───────────┐
              │   Match Strategies    │
              │                       │
              │  1. Exact match       │ ← paths equal, method equal
              │  2. Suffix match      │ ← one is suffix of other
              │  3. Parameterized     │ ← segment-by-segment after normalization
              │  4. Version-stripped   │ ← strip v1/v2, then compare
              └───────────┬───────────┘
                          │
                          ▼
              CrossRepoLink {
                callerId, endpointId,
                httpMethod: "GET",
                matchConfidence: "exact"
              }
```

Each match includes a confidence level so the UI can distinguish high-confidence connections from fuzzy ones.

---

## 9. Graph Storage (Neo4j)

The graph writer generates parameterized Cypher statements from the pipeline output. All queries use parameters (never string interpolation) to prevent injection.

### Node and Relationship Schema

```
(Project)─[:HAS_REPO]─→(Repository)─[:CONTAINS]─→(File)─[:DEFINES]─→(Function)
                                                                         │
                                                          ┌──────────────┼──────────────┐
                                                          │              │              │
                                                     [:CALLS]      [:CALLS_API]   [:READS]
                                                          │              │         [:WRITES]
                                                          ▼              ▼              │
                                                     (Function)    (Function)          ▼
                                                     same repo     other repo      (DBTable)
                                                                                       │
                                              (Function)─[:EXPOSES]─→(APIEndpoint)     │
                                                                                       │
                                              (File)─[:IMPORTS]─→(File)               │
                                                                                       │
                                              (DBTable)←──────────────────────────────┘
```

### Node Types

| Node | Key Properties |
|------|---------------|
| `Project` | id, name, createdAt |
| `Repository` | id, name, url, language, lastAnalyzedAt |
| `File` | id, path, language, hash |
| `Function` | id, name, signature, category, startLine, endLine |
| `APIEndpoint` | id, method, path, fullRoute |
| `DBTable` | id, name, schema |

### Relationship Types

| Relationship | From | To | Meaning |
|-------------|------|-----|---------|
| `HAS_REPO` | Project | Repository | Project contains repo |
| `CONTAINS` | Repository | File | Repo contains file |
| `DEFINES` | File | Function | File defines function |
| `CALLS` | Function | Function | Intra-repo function call |
| `CALLS_API` | Function | Function | Cross-repo API call (from stitching) |
| `EXPOSES` | Function | APIEndpoint | Function handles this endpoint |
| `READS` | Function | DBTable | Function reads from table |
| `WRITES` | Function | DBTable | Function writes to table |
| `IMPORTS` | File | File | File imports from file |

---

## 10. API Server

The API server (`packages/api`) is an Express.js application that provides REST endpoints for the frontend and any external consumers.

```
┌──────────────────────────────────────────────────────────────────┐
│                        API Server                                │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │ Project Routes │  │ Graph Routes   │  │ Analysis Routes    │ │
│  │                │  │                │  │                    │ │
│  │ GET  /projects │  │ GET /functions │  │ POST /analysis/run │ │
│  │ POST /projects │  │     /:id/      │  │ GET  /analysis/    │ │
│  │ GET  /projects │  │     neighbors  │  │     status/:runId  │ │
│  │     /:name     │  │ GET /functions │  └────────────────────┘ │
│  │ GET  /projects │  │     /:id/trace │                         │
│  │     /:name/    │  │ GET /search/   │  ┌────────────────────┐ │
│  │     summary    │  │     functions  │  │ NLP Routes         │ │
│  │ GET  /projects │  │ GET /search/   │  │                    │ │
│  │     /:name/    │  │     endpoints  │  │ POST /query/nlp    │ │
│  │  repositories  │  │ GET /endpoints │  │ POST /query/nlp/   │ │
│  └────────────────┘  │ GET /graph/    │  │     summarize      │ │
│                      │   insights/    │  └────────────────────┘ │
│                      │   hotspots     │                         │
│                      │ GET /graph/    │                         │
│                      │   insights/    │                         │
│                      │   high-fanout  │                         │
│                      └────────────────┘                         │
│                                                                  │
│  All queries use parameterized Cypher (injection-safe)           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. NLP Query Engine

The NLP package (`packages/nlp`) translates natural language questions into Cypher queries, enabling users to explore the graph without knowing query syntax.

```
User: "What functions call the database in the payments repo?"
                │
                ▼
┌──────────────────────────────┐
│      Template Matcher        │  Fast path: 26 predefined patterns
│                              │  e.g., "functions that call *"
│  Match found?                │      "endpoints in *"
│    YES → generate Cypher     │      "who calls *"
│    NO  → fall through        │
└──────────┬───────────────────┘
           │ no match
           ▼
┌──────────────────────────────┐
│      LLM Translation         │  Slow path: send to Claude/OpenAI
│                              │
│  System prompt includes:     │
│  - Neo4j schema              │
│  - Node/relationship types   │
│  - Example queries           │
│                              │
│  Returns: Cypher query       │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│      Cypher Validator        │  Safety: rejects DETACH DELETE,
│                              │  DROP, MERGE, SET, CREATE
│                              │  (read-only enforcement)
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│      Result Summarizer       │  Optional: AI-generated summary
│                              │  of what the query found
└──────────────────────────────┘
```

---

## 12. Frontend

The frontend (`packages/frontend`) is a React + Vite application using Cytoscape.js for graph visualization.

### Page Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  Layout (navigation + content area)                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Dashboard (/)                                             │   │
│  │ Project list, per-repo stats, category distribution       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Graph Explorer (/graph)                                   │   │
│  │ ┌─────────────┐ ┌──────────────────────────────────────┐ │   │
│  │ │Intelligence │ │ Cytoscape.js Canvas                  │ │   │
│  │ │Sidebar      │ │                                      │ │   │
│  │ │             │ │ Force-directed / Concentric layout   │ │   │
│  │ │ Hotspots    │ │ Node click → FunctionCard            │ │   │
│  │ │ Fan-out     │ │ Neighborhood mode (1-3 hops)         │ │   │
│  │ │ Stats       │ │                                      │ │   │
│  │ └─────────────┘ └──────────────────────────────────────┘ │   │
│  │ ┌──────────────────────────────────────────────────────┐ │   │
│  │ │ QueryBar — NLP input + filter chips + AI summarize   │ │   │
│  │ └──────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Flow Tracer (/flow)                                       │   │
│  │ Entry point picker → upstream/downstream trace            │   │
│  │ Flow layout (horizontal chain) or Swimlane layout         │   │
│  │ Spine filtering, AI flow summarization                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌────────────────────────┐ ┌────────────────────────────────┐  │
│  │ Endpoint List          │ │ File Tree (/files)             │  │
│  │ (/endpoints)           │ │ Repo → directory → file →      │  │
│  │ Filter by method,      │ │ functions with line numbers    │  │
│  │ search by route        │ │                                │  │
│  └────────────────────────┘ └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Visual Encoding

The UI uses consistent color-coding across all views:

| Category | Color | Meaning |
|----------|-------|---------|
| UI_INTERACTION | Blue | React components, UI event handlers |
| HANDLER | Teal | Functions called by endpoints |
| API_CALLER | Orange | HTTP client calls to external services |
| API_ENDPOINT | Green | Route handlers (Express, FastAPI, etc.) |
| DB_CALL | Purple | Database read/write operations |
| UTILITY | Gray | Everything else |

---

## 13. Extensibility Guide

### Adding a New Language Analyzer

A new analyzer is a standalone binary. No existing code needs to change.

```
Step 1: Build the analyzer
         │
         │  Create analyzers/<language>/
         │  Implement CLI accepting: --repo, --repo-name, --output
         │  Use the language's native AST parser
         │  Output confianalyzer-ir-v1 JSON
         │
         ▼
Step 2: Register in project config (confianalyzer.json)
         │
         │  "analyzers": {
         │    "<language>": {
         │      "command": "confianalyzer-<lang>",
         │      "extensions": [".ext"]
         │    }
         │  }
         │
         ▼
Step 3: Done — orchestrator discovers, invokes, reads IR automatically
```

**What you must implement:**
- File walking and AST parsing in the target language
- Extraction of functions, calls, imports, exports, classes
- JSON serialization to the IR schema
- CLI argument handling

**What you do NOT touch:**
- Orchestrator, API server, frontend, Neo4j schema — none of these change

### Adding a New Framework Plugin

A new plugin lives entirely within its language's analyzer.

```
Step 1: Create the plugin file
         │
         │  Implement the analyzer's plugin interface
         │  (FrameworkPlugin in TS, FrameworkPlugin Protocol in Python, etc.)
         │
         ▼
Step 2: Register in the plugin registry
         │
         │  Add to createDefaultPlugins() (TS) or ALL_PLUGINS (Python)
         │
         ▼
Step 3: Done — auto-detected via imports, or enabled via .confianalyzer.yaml
```

**What a plugin does:**
- Detects if the framework is used (by checking imports)
- Enriches function IR with endpoint info, DB operations, HTTP calls, or rendering info
- Sets `suggestedCategory` to influence categorization

**What a plugin does NOT do:**
- Modify the IR schema (use existing enrichment fields)
- Interact with Neo4j, the API, or the frontend

### Extensibility Summary

```
┌────────────────────────────────────────────────────────────────┐
│ Change Scope          │ What to Touch        │ What's Unchanged │
├───────────────────────┼──────────────────────┼──────────────────┤
│ New language          │ New analyzer binary   │ Orchestrator,    │
│                       │ + config entry        │ API, Frontend,   │
│                       │                      │ Neo4j, IR schema │
├───────────────────────┼──────────────────────┼──────────────────┤
│ New framework         │ New plugin file       │ Analyzer core,   │
│ (existing language)   │ + registry entry      │ Orchestrator,    │
│                       │                      │ API, Frontend    │
├───────────────────────┼──────────────────────┼──────────────────┤
│ New enrichment type   │ IR contract types     │ Analyzers (use   │
│ (e.g., GraphQL)       │ + relevant plugins    │ new fields),     │
│                       │ + categorizer         │ Frontend         │
└───────────────────────┴──────────────────────┴──────────────────┘
```

---

## 14. Deployment Architecture

### Docker Compose Stack

```
┌──────────────────────────────────────────────────────────┐
│                    docker-compose.yml                     │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌────────────────────┐ │
│  │ Frontend │    │ API      │    │ Neo4j              │ │
│  │          │    │ Server   │    │                    │ │
│  │ nginx    │───→│ Express  │───→│ Bolt: 7688         │ │
│  │ :5176    │    │ :3006    │    │ Browser: 7475      │ │
│  └──────────┘    └──────────┘    └────────────────────┘ │
│                                                          │
│  Analyzers run on the host (or in CI), not in Docker.    │
│  They produce IR JSON that the orchestrator reads.       │
└──────────────────────────────────────────────────────────┘
```

### Development Setup

```bash
# 1. Start Neo4j
docker compose -f docker-compose.dev.yml up -d

# 2. Build all packages
npm install && npm run build

# 3. Start API server
cd packages/api
NEO4J_URI=bolt://localhost:7688 NEO4J_USER=neo4j \
  NEO4J_PASSWORD=confianalyzer PORT=3006 node dist/index.js

# 4. Start frontend (dev mode with hot reload)
cd packages/frontend
npm run dev
```

### CI Pipeline

```
GitHub Actions (ci.yml)
    │
    ├── JS/TS analyzer tests (npm test)
    ├── Python analyzer tests (pytest)
    ├── Go analyzer tests (go test)
    ├── Java analyzer tests (mvn test)
    ├── Rust analyzer tests (cargo test)
    ├── IR contract tests (npm test)
    ├── Orchestrator tests (npm test)
    ├── API server tests (npm test)
    ├── NLP tests (npm test)
    ├── Frontend tests (npm test)
    └── Integration tests (npm test)
```

All analyzer test suites run in their native language toolchains. Integration tests verify the full pipeline from IR ingestion through cross-repo stitching to Cypher generation.
