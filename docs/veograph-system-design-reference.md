# VeoGraph — System Design Document

This document is the implementation blueprint for VeoGraph. It covers architecture, tech stack, monorepo layout, component boundaries, communication patterns, deployment, and key design decisions. Developers should be able to start building from this doc.

---

## 1. Architecture Overview

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                          │
│                                                                          │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ Project Manager │  │ Graph Explorer  │  │ NLP Query Bar            │  │
│  │                 │  │ (cytoscape.js)  │  │ (autocomplete + history) │  │
│  │ - CRUD projects │  │ - Node/edge viz │  │                          │  │
│  │ - Add/rm repos  │  │ - Flow Tracer   │  │                          │  │
│  │ - Trigger runs  │  │ - Impact View   │  │                          │  │
│  └────────┬───────┘  └────────┬────────┘  └────────────┬─────────────┘  │
│           │                   │                         │                │
│           └───────────────────┼─────────────────────────┘                │
│                               │                                          │
│                    packages/shared (typed contracts)                      │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │ HTTP (REST JSON)
                                │
┌───────────────────────────────┼──────────────────────────────────────────┐
│                        Backend (Node.js + Express)                       │
│                               │                                          │
│           ┌───────────────────┴───────────────────┐                      │
│           │           packages/api                 │                      │
│           │  Express router, request validation,   │                      │
│           │  response serialization                │                      │
│           └───┬───────────────────────────────┬───┘                      │
│               │                               │                          │
│  ┌────────────┴────────────┐    ┌─────────────┴──────────────┐           │
│  │   packages/analysis     │    │     packages/nlp           │           │
│  │                         │    │                            │           │
│  │ 1. Call graph extract   │    │ NL query → Claude API →   │           │
│  │ 2. Import analysis      │    │ Cypher query → Neo4j →    │           │
│  │ 3. Cross-file resolve   │    │ structured result         │           │
│  │ 4. Cross-repo stitch    │    │                            │           │
│  │ 5. Categorization       │    └─────────────┬──────────────┘           │
│  │ 6. Graph storage        │                  │                          │
│  └────────────┬────────────┘                  │                          │
│               │                               │                          │
│  ┌────────────┴────────────┐                  │                          │
│  │   packages/parsers      │                  │                          │
│  │                         │                  │                          │
│  │ LanguageParser iface    │                  │                          │
│  │ TS, JS, Python, Go,    │                  │                          │
│  │ Java parsers            │                  │                          │
│  │ (Tree-Sitter bindings)  │                  │                          │
│  └─────────────────────────┘                  │                          │
│                                               │                          │
│                    packages/shared (IR types, enums, contracts)           │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ Bolt protocol (neo4j-driver)
                                │
                       ┌────────┴────────┐
                       │     Neo4j DB    │
                       │                 │
                       │ Nodes:          │
                       │  Project        │
                       │  Repository     │
                       │  File           │
                       │  Function       │
                       │  APIEndpoint    │
                       │  DBTable        │
                       │  Import         │
                       │                 │
                       │ Relationships:  │
                       │  BELONGS_TO     │
                       │  IN_REPO        │
                       │  DEFINED_IN     │
                       │  CALLS          │
                       │  IMPORTS        │
                       │  EXPOSES        │
                       │  CALLS_API      │
                       │  READS / WRITES │
                       └─────────────────┘
```

### Data Flow

**Analysis flow (write path):**
1. User creates a project and adds repository URLs via the Project Manager UI.
2. User triggers an analysis run. The frontend POSTs to `/projects/:id/analyze`.
3. The backend clones/pulls the repositories to a local working directory.
4. `packages/parsers` processes every source file through the appropriate Tree-Sitter parser, producing IR nodes.
5. `packages/analysis` executes the 6-step pipeline on the IR, building the full graph model in memory.
6. Step 6 writes the graph to Neo4j using batch Cypher operations via the neo4j-driver.
7. The frontend polls `/projects/:id/analysis-status` for progress updates.

**Query flow (read path):**
1. User interacts with the Graph Explorer (click a node, select a flow, filter).
2. The frontend calls the appropriate REST endpoint (e.g., `/graph/node/:id/flow`).
3. The backend runs a parameterized Cypher query against Neo4j.
4. The backend maps results into the response contract defined in `packages/shared`.
5. The frontend renders the subgraph via cytoscape.js.

**NLP flow:**
1. User types a natural language question in the NLP Query Bar.
2. The frontend POSTs to `/nlp/query` with the raw text.
3. `packages/nlp` sends the question plus the Neo4j schema context to the Claude API.
4. Claude returns a Cypher query.
5. The backend executes the Cypher query against Neo4j.
6. Results are returned in the standard graph response format.
7. The frontend renders the result as a focused subgraph.

---

## 2. Tech Stack

| Layer | Technology | Version Target | Rationale |
|-------|-----------|----------------|-----------|
| **Frontend framework** | React | 18+ | Component model, ecosystem, team familiarity |
| **Frontend language** | TypeScript | 5.x | Type safety, shared contracts with backend |
| **Frontend build** | Vite | 5.x | Fast HMR, native ESM, simple config |
| **Graph visualization** | cytoscape.js | 3.x | Mature, performant with large graphs, rich layout algorithms, extensible styling |
| **Backend runtime** | Node.js | 20 LTS | TypeScript native ecosystem, single-language stack |
| **Backend framework** | Express | 4.x | Minimal, well-understood, easy to test |
| **Code parsing** | Tree-Sitter | Latest | Incremental, error-tolerant, multi-language, produces concrete syntax trees |
| **Tree-Sitter bindings** | tree-sitter (npm) + language grammars | Latest | Native Node.js bindings with per-language grammar packages |
| **Database** | Neo4j | 5.x | Native graph storage, Cypher query language, relationship-first model |
| **Neo4j driver** | neo4j-driver (npm) | 5.x | Official driver, connection pooling, transaction support |
| **NLP / LLM** | Claude API (Anthropic) | claude-sonnet-4-20250514 or later | High-quality NL-to-Cypher translation, function calling support |
| **Monorepo tooling** | npm workspaces | Built-in | Zero extra tooling, native to Node.js |
| **Linting** | ESLint + Prettier | Latest | Consistent style, catch errors early |
| **Testing** | Vitest (unit/integration), Playwright (E2E) | Latest | Fast, Vite-native, good TypeScript support |
| **Containerization** | Docker + Docker Compose | Latest | Reproducible local dev environment |

---

## 3. Monorepo Structure

```
veograph/
├── package.json                    # Root workspace config
├── tsconfig.base.json              # Shared TS compiler options
├── docker-compose.yml              # Neo4j + backend + frontend
├── .env.example                    # Environment variable template
├── CLAUDE.md                       # AI assistant instructions
│
├── packages/
│   ├── shared/                     # P4 — The contract layer
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Public barrel export
│   │       ├── ir/                 # Intermediate Representation types
│   │       │   ├── nodes.ts        # IRNode, IRFunction, IRImport, IRCall, etc.
│   │       │   └── index.ts
│   │       ├── api/                # REST API contracts
│   │       │   ├── projects.ts     # Request/response types for /projects/*
│   │       │   ├── graph.ts        # Request/response types for /graph/*
│   │       │   ├── nlp.ts          # Request/response types for /nlp/*
│   │       │   ├── common.ts       # Pagination, error envelope, etc.
│   │       │   └── index.ts
│   │       ├── enums/              # Shared enumerations
│   │       │   ├── categories.ts   # FunctionCategory enum
│   │       │   ├── relationships.ts# RelationshipType enum
│   │       │   └── index.ts
│   │       └── graph/              # Graph model types (for FE rendering)
│   │           ├── nodes.ts        # GraphNode (id, label, properties)
│   │           ├── edges.ts        # GraphEdge (source, target, type, properties)
│   │           └── index.ts
│   │
│   ├── parsers/                    # P1 + P2 — Tree-Sitter to IR
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Public API: parseFile(path, source) => IRNode[]
│   │       ├── interface.ts        # LanguageParser interface definition
│   │       ├── registry.ts         # Extension-to-parser map, auto-discovery
│   │       ├── languages/
│   │       │   ├── typescript.ts   # TypeScript/TSX parser
│   │       │   ├── javascript.ts   # JavaScript/JSX parser
│   │       │   ├── python.ts       # Python parser
│   │       │   ├── go.ts           # Go parser
│   │       │   └── java.ts         # Java parser
│   │       └── __tests__/
│   │           ├── fixtures/       # Small source files per language
│   │           ├── typescript.test.ts
│   │           ├── javascript.test.ts
│   │           ├── python.test.ts
│   │           ├── go.test.ts
│   │           └── java.test.ts
│   │
│   ├── analysis/                   # 6-step pipeline
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Pipeline orchestrator: runAnalysis(project) => void
│   │       ├── pipeline/
│   │       │   ├── 01-call-graph.ts      # Extract call relationships per file
│   │       │   ├── 02-import-analysis.ts # Extract and resolve imports per file
│   │       │   ├── 03-cross-file.ts      # Connect functions across files using imports
│   │       │   ├── 04-cross-repo.ts      # Match API callers to endpoints across repos
│   │       │   ├── 05-categorize.ts      # Classify functions by category
│   │       │   └── 06-store-graph.ts     # Batch write to Neo4j
│   │       ├── repo/
│   │       │   ├── clone.ts        # Git clone/pull logic
│   │       │   └── walk.ts         # File system walker with extension filtering
│   │       ├── neo4j/
│   │       │   ├── client.ts       # Neo4j driver singleton, connection management
│   │       │   ├── schema.ts       # Constraint and index creation
│   │       │   ├── writers.ts      # Batch write operations (UNWIND + MERGE)
│   │       │   └── queries.ts      # Pre-built Cypher queries for common patterns
│   │       └── __tests__/
│   │           ├── pipeline.integration.test.ts
│   │           └── fixtures/       # Small multi-file repos for testing
│   │
│   ├── api/                        # REST API layer
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Express app setup, middleware, listen
│   │       ├── server.ts           # createApp() factory for testing
│   │       ├── middleware/
│   │       │   ├── error-handler.ts    # Global error → JSON response
│   │       │   ├── validation.ts       # Request body/param validation
│   │       │   └── cors.ts             # CORS configuration
│   │       ├── routes/
│   │       │   ├── projects.ts     # /projects/* handlers
│   │       │   ├── graph.ts        # /graph/* handlers
│   │       │   └── nlp.ts          # /nlp/* handlers
│   │       ├── services/
│   │       │   ├── project.service.ts  # Business logic for projects
│   │       │   ├── graph.service.ts    # Business logic for graph queries
│   │       │   └── analysis.service.ts # Orchestrates analysis runs
│   │       └── __tests__/
│   │           ├── projects.test.ts
│   │           ├── graph.test.ts
│   │           └── nlp.test.ts
│   │
│   ├── nlp/                        # NL-to-Cypher translator
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Public API: translateQuery(nl: string) => CypherResult
│   │       ├── claude-client.ts    # Claude API wrapper
│   │       ├── prompt-builder.ts   # Builds system prompt with Neo4j schema context
│   │       ├── cypher-validator.ts # Basic sanity checks on generated Cypher
│   │       ├── schema-context.ts   # Reads current Neo4j schema for prompt injection
│   │       └── __tests__/
│   │           ├── translate.test.ts
│   │           └── fixtures/       # Example NL queries with expected Cypher
│   │
│   └── frontend/                   # React application
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx            # App entry point
│           ├── App.tsx             # Router setup
│           ├── api/                # API client (typed via packages/shared)
│           │   ├── client.ts       # Base fetch wrapper
│           │   ├── projects.ts     # Project API calls
│           │   ├── graph.ts        # Graph API calls
│           │   └── nlp.ts          # NLP API calls
│           ├── components/
│           │   ├── layout/
│           │   │   ├── AppShell.tsx
│           │   │   ├── Sidebar.tsx
│           │   │   └── Header.tsx
│           │   ├── projects/
│           │   │   ├── ProjectList.tsx
│           │   │   ├── ProjectForm.tsx
│           │   │   ├── RepoList.tsx
│           │   │   └── AnalysisStatus.tsx
│           │   ├── graph/
│           │   │   ├── GraphCanvas.tsx     # cytoscape.js wrapper
│           │   │   ├── NodeDetail.tsx      # Side panel for selected node
│           │   │   ├── FilterBar.tsx       # Category, repo, language filters
│           │   │   └── LayoutControls.tsx  # Layout algorithm selector
│           │   ├── flow/
│           │   │   ├── FlowTracer.tsx      # End-to-end flow visualization
│           │   │   └── FlowStep.tsx        # Single hop in the flow
│           │   ├── impact/
│           │   │   └── EndpointImpact.tsx  # Upstream/downstream view
│           │   └── nlp/
│           │       ├── QueryBar.tsx        # NLP text input
│           │       ├── QueryHistory.tsx    # Past queries
│           │       └── Suggestions.tsx     # Autocomplete/example queries
│           ├── hooks/
│           │   ├── useGraph.ts
│           │   ├── useProjects.ts
│           │   └── useNlpQuery.ts
│           ├── pages/
│           │   ├── ProjectsPage.tsx
│           │   ├── GraphExplorerPage.tsx
│           │   └── ProjectDetailPage.tsx
│           └── styles/
│               └── globals.css
│
├── tests/                          # Cross-package integration / E2E
│   ├── e2e/
│   │   └── full-flow.spec.ts      # Playwright E2E tests
│   └── fixtures/
│       └── sample-repos/           # Small repos for integration testing
│
└── docs/
    ├── plan.md
    ├── initialdescription.md
    └── system-design.md            # This document
```

### Workspace Configuration

Root `package.json`:
```json
{
  "name": "veograph",
  "private": true,
  "workspaces": [
    "packages/shared",
    "packages/parsers",
    "packages/analysis",
    "packages/api",
    "packages/nlp",
    "packages/frontend"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "dev": "docker compose up -d neo4j && concurrently \"npm run dev -w packages/api\" \"npm run dev -w packages/frontend\"",
    "lint": "eslint packages/*/src --ext .ts,.tsx",
    "typecheck": "tsc --build"
  }
}
```

### Dependency Graph Between Packages

```
packages/shared       ← no internal dependencies (leaf)
     ↑
     ├── packages/parsers      depends on: shared
     ├── packages/analysis     depends on: shared, parsers
     ├── packages/nlp          depends on: shared
     ├── packages/api          depends on: shared, analysis, nlp
     └── packages/frontend     depends on: shared (types only, no backend code)
```

Build order: `shared` → `parsers` → `nlp` → `analysis` → `api` + `frontend` (parallel).

---

## 4. Component Boundaries (P4 Enforcement)

### What `packages/shared` Contains

`packages/shared` is the **only** package that both frontend and backend depend on. It defines:

1. **IR Types** — The language-neutral Intermediate Representation used by parsers and analysis.
   ```typescript
   // ir/nodes.ts
   export interface IRNode {
     type: IRNodeType;
     name: string;
     filePath: string;
     startLine: number;
     endLine: number;
   }

   export interface IRFunction extends IRNode {
     type: 'function';
     parameters: IRParameter[];
     returnType?: string;
     calls: IRCallSite[];
     isExported: boolean;
   }

   export interface IRImport extends IRNode {
     type: 'import';
     source: string;
     symbols: string[];
     isDefault: boolean;
     isExternal: boolean;
   }

   export interface IRCallSite {
     calleeName: string;
     line: number;
     arguments: number;
   }
   ```

2. **API Contracts** — Every REST endpoint has a typed request and response.
   ```typescript
   // api/projects.ts
   export interface CreateProjectRequest {
     name: string;
   }

   export interface CreateProjectResponse {
     id: string;
     name: string;
     createdAt: string;
   }

   export interface AddRepoRequest {
     url: string;
     name?: string;
   }

   export interface AnalysisStatusResponse {
     status: 'idle' | 'cloning' | 'parsing' | 'analyzing' | 'storing' | 'complete' | 'error';
     progress: number;       // 0-100
     currentStep?: string;
     error?: string;
   }
   ```

3. **Graph Model Types** — What the frontend renders.
   ```typescript
   // graph/nodes.ts
   export interface GraphNode {
     id: string;
     label: string;          // Neo4j node label
     properties: Record<string, unknown>;
   }

   // graph/edges.ts
   export interface GraphEdge {
     id: string;
     source: string;
     target: string;
     type: string;           // Relationship type
     properties: Record<string, unknown>;
   }

   export interface GraphResponse {
     nodes: GraphNode[];
     edges: GraphEdge[];
   }
   ```

4. **Enums** — Function categories, relationship types, analysis status.
   ```typescript
   // enums/categories.ts
   export enum FunctionCategory {
     UI_INTERACTION = 'UI_INTERACTION',
     HANDLER = 'HANDLER',
     API_CALLER = 'API_CALLER',
     API_ENDPOINT = 'API_ENDPOINT',
     DB_CALL = 'DB_CALL',
     UTILITY = 'UTILITY',
   }
   ```

### How P4 Is Enforced

1. **TypeScript project references.** Each package has its own `tsconfig.json` that references only its allowed dependencies. The frontend references only `shared` -- never `api`, `analysis`, or `parsers`.

2. **No cross-boundary imports.** ESLint `import/no-restricted-paths` rule prevents the frontend from importing anything outside `packages/shared` and its own `src/`. Similarly, `packages/parsers` cannot import from `packages/api`.

3. **Contract-first development.** When adding a new API endpoint:
   - First, add the request/response types in `packages/shared/src/api/`.
   - Then implement the route in `packages/api`.
   - Then consume it in `packages/frontend`.
   - The shared types are the source of truth; any mismatch is a compile error.

4. **No runtime shared code.** `packages/shared` contains only TypeScript types, interfaces, and enums. It has zero runtime dependencies and zero side effects. It compiles to type declarations only (for the backend) or is inlined by Vite (for the frontend).

---

## 5. Communication Patterns

### Frontend ↔ Backend: REST over HTTP

**Base URL:** `http://localhost:3001/api/v1`

**Request/Response Envelope:**
```typescript
// Successful responses return data directly matching the contract type.
// Errors use a standard envelope:
export interface ApiError {
  status: number;
  code: string;       // Machine-readable, e.g. 'PROJECT_NOT_FOUND'
  message: string;    // Human-readable
}
```

**Endpoints (summary):**

| Method | Path | Request Body | Response Body |
|--------|------|-------------|---------------|
| `POST` | `/projects` | `CreateProjectRequest` | `CreateProjectResponse` |
| `GET` | `/projects` | — | `ProjectListResponse` |
| `GET` | `/projects/:id` | — | `ProjectDetailResponse` |
| `DELETE` | `/projects/:id` | — | `204 No Content` |
| `POST` | `/projects/:id/repos` | `AddRepoRequest` | `RepoResponse` |
| `DELETE` | `/projects/:id/repos/:repoId` | — | `204 No Content` |
| `POST` | `/projects/:id/analyze` | — | `AnalysisStatusResponse` |
| `GET` | `/projects/:id/analysis-status` | — | `AnalysisStatusResponse` |
| `GET` | `/graph/node/:id` | — | `GraphResponse` (node + neighbors) |
| `GET` | `/graph/node/:id/flow` | — | `GraphResponse` (end-to-end flow) |
| `GET` | `/graph/endpoint/:id/callers` | — | `GraphResponse` |
| `POST` | `/graph/query` | `{ cypher: string, params?: Record<string, unknown> }` | `GraphResponse` |
| `POST` | `/nlp/query` | `{ query: string, projectId: string }` | `NlpQueryResponse` |

**Frontend API client pattern:**
```typescript
// packages/frontend/src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  return res.json();
}
```

### Backend ↔ Neo4j: Bolt Protocol via neo4j-driver

**Connection management:**
```typescript
// packages/analysis/src/neo4j/client.ts
import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'veograph'
      )
    );
  }
  return driver;
}
```

**Write pattern (batch with UNWIND):**
```cypher
UNWIND $functions AS f
MERGE (fn:Function {id: f.id})
SET fn.name = f.name, fn.signature = f.signature,
    fn.category = f.category, fn.startLine = f.startLine,
    fn.endLine = f.endLine
WITH fn, f
MATCH (file:File {path: f.filePath})
MERGE (fn)-[:DEFINED_IN]->(file)
```

**Read pattern (parameterized queries):**
```cypher
// Get node with neighbors
MATCH (n) WHERE elementId(n) = $nodeId
OPTIONAL MATCH (n)-[r]-(neighbor)
RETURN n, collect(DISTINCT {rel: r, node: neighbor}) AS neighbors
```

All Cypher queries are parameterized -- no string interpolation of user input.

### Backend ↔ Claude API: HTTPS (NLP package)

**Request pattern:**
```typescript
// packages/nlp/src/claude-client.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function translateToCypher(
  naturalLanguage: string,
  schemaContext: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemPrompt(schemaContext),
    messages: [{ role: 'user', content: naturalLanguage }],
  });
  return extractCypher(response);
}
```

**System prompt includes:**
- Full Neo4j schema (node labels, relationship types, property keys)
- Example queries (few-shot)
- Constraints: output must be a single read-only Cypher query (no mutations)
- Output format: return the Cypher in a code block

**Safety:** The `cypher-validator.ts` module rejects any Cypher containing `CREATE`, `MERGE`, `DELETE`, `SET`, `REMOVE`, or `DETACH` before execution. Only read queries are permitted through the NLP path.

---

## 6. Deployment

### Local Development with Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  neo4j:
    image: neo4j:5-community
    ports:
      - '7474:7474'   # Browser UI
      - '7687:7687'   # Bolt protocol
    environment:
      NEO4J_AUTH: neo4j/veograph
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_memory_heap_initial__size: 512m
      NEO4J_dbms_memory_heap_max__size: 1G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    healthcheck:
      test: ['CMD', 'neo4j', 'status']
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - '3001:3001'
    environment:
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: veograph
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      REPOS_DIR: /data/repos
    volumes:
      - repos_data:/data/repos
    depends_on:
      neo4j:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - '5173:5173'
    environment:
      VITE_API_URL: http://localhost:3001/api/v1

volumes:
  neo4j_data:
  neo4j_logs:
  repos_data:
```

### Dockerfile.backend

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/parsers/package.json packages/parsers/
COPY packages/analysis/package.json packages/analysis/
COPY packages/nlp/package.json packages/nlp/
COPY packages/api/package.json packages/api/
RUN npm ci --workspace=packages/shared \
           --workspace=packages/parsers \
           --workspace=packages/analysis \
           --workspace=packages/nlp \
           --workspace=packages/api
COPY packages/shared packages/shared
COPY packages/parsers packages/parsers
COPY packages/analysis packages/analysis
COPY packages/nlp packages/nlp
COPY packages/api packages/api
COPY tsconfig.base.json .
RUN npm run build --workspace=packages/shared \
                  --workspace=packages/parsers \
                  --workspace=packages/analysis \
                  --workspace=packages/nlp \
                  --workspace=packages/api
EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]
```

### Dockerfile.frontend

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci --workspace=packages/shared --workspace=packages/frontend
COPY packages/shared packages/shared
COPY packages/frontend packages/frontend
COPY tsconfig.base.json .
RUN npm run build --workspace=packages/shared --workspace=packages/frontend

FROM nginx:alpine
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
```

### Development Workflow (No Docker)

For faster iteration, developers can run without Docker for frontend and backend:

```bash
# Terminal 1: Start Neo4j only
docker compose up neo4j

# Terminal 2: Backend with hot reload
npm run dev -w packages/api     # uses tsx --watch

# Terminal 3: Frontend with Vite HMR
npm run dev -w packages/frontend
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEO4J_URI` | Yes | `bolt://localhost:7687` | Neo4j Bolt endpoint |
| `NEO4J_USER` | Yes | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | Yes | `veograph` | Neo4j password |
| `ANTHROPIC_API_KEY` | For NLP | — | Claude API key |
| `REPOS_DIR` | No | `./data/repos` | Directory for cloned repositories |
| `PORT` | No | `3001` | Backend server port |
| `VITE_API_URL` | No | `http://localhost:3001/api/v1` | API base URL for frontend |

---

## 7. Key Design Decisions

### Why Tree-Sitter for Code Parsing

**Decision:** Use Tree-Sitter ASTs as the sole mechanism for code understanding (P1).

**Alternatives considered:**
- **Regex-based parsing** — Fragile, breaks on edge cases (multiline strings, comments, nested structures). Non-deterministic for complex constructs.
- **Language-specific compilers** (tsc, go/parser) — High fidelity but each requires a different integration. Cannot unify into a single IR pipeline.
- **LSP servers** — Heavy to spin up per language, designed for editor interactions not batch analysis.

**Why Tree-Sitter wins:**
- **Deterministic.** Same input always produces the same AST. No heuristics.
- **Error-tolerant.** Produces partial ASTs even for files with syntax errors -- critical for analyzing real-world codebases.
- **Multi-language.** One API, one pattern, grammars available for 100+ languages. Adding a language means adding a grammar package and writing one parser.
- **Fast.** Incremental parsing. Can handle large codebases without being a bottleneck.
- **Concrete syntax trees.** Preserves every token (comments, whitespace) so we can map precisely back to source locations.

### Why Neo4j for Graph Storage

**Decision:** Store the code relationship graph in Neo4j.

**Alternatives considered:**
- **PostgreSQL with recursive CTEs** — Can model graphs but queries become complex and slow for deep traversals.
- **In-memory graph (e.g., graphology)** — Fast but no persistence, no query language, limited to single-process.
- **Amazon Neptune / cloud graph DBs** — Overkill for local-first development, adds cloud dependency.

**Why Neo4j wins:**
- **Native graph storage.** Relationships are first-class citizens with O(1) traversal. "Find all callers of this endpoint 5 hops deep" is a simple Cypher query.
- **Cypher query language.** Expressive, readable, and the natural target for NLP-to-query translation. Claude can generate Cypher far more reliably than complex SQL with recursive CTEs.
- **Visualization built in.** Neo4j Browser provides a free debugging tool for inspecting the graph during development.
- **APOC library.** Path-finding algorithms, batch operations, and utilities available out of the box.
- **Docker-friendly.** `neo4j:5-community` image works with zero configuration.

### Why a Monorepo with npm Workspaces

**Decision:** Single repository with npm workspaces for all packages.

**Alternatives considered:**
- **Separate repos** — Harder to keep shared types in sync, dependency hell, slower development cycle.
- **Nx or Turborepo** — Powerful but adds significant complexity. Not justified at current scale.
- **pnpm workspaces** — Good alternative but npm workspaces are sufficient and require no additional tooling.

**Why monorepo with npm workspaces wins:**
- **Atomic changes.** A new API endpoint means updating `shared` types, `api` routes, and `frontend` client in a single commit. No version coordination.
- **TypeScript project references.** `tsc --build` compiles the dependency graph correctly. A type change in `shared` triggers recompilation of dependents.
- **Simple tooling.** `npm workspaces` is built into npm -- zero extra dependencies to manage the monorepo.
- **Shared test infrastructure.** Integration tests can import from any package.

### Why Claude API for NLP-to-Cypher

**Decision:** Use the Claude API to translate natural language queries into Cypher.

**Alternatives considered:**
- **Fine-tuned local model** — Requires training data, hosting infrastructure, and ongoing maintenance. Latency and accuracy likely worse than a frontier model.
- **Template-based NLP** — "Show me callers of {endpoint}" with pattern matching. Limited to pre-defined query patterns, brittle.
- **OpenAI API** — Viable alternative, but Claude's longer context window is better for injecting full schema context, and the Anthropic SDK is well-maintained.

**Why Claude API wins:**
- **Quality.** Frontier LLMs produce correct Cypher from natural language with high accuracy when given schema context and few-shot examples.
- **Zero training.** Schema context is injected at query time. When the schema changes, the NLP layer automatically adapts.
- **Flexibility.** Users can ask freeform questions that would be impossible with template-based approaches. "What's the blast radius if I change the auth middleware?" works out of the box.
- **Safety.** The validator rejects mutation queries, so even if the LLM hallucinates a `DELETE`, it never reaches Neo4j.

### Why cytoscape.js for Graph Visualization

**Decision:** Use cytoscape.js for rendering the interactive graph in the browser.

**Alternatives considered:**
- **D3.js** — Lower level, requires more custom code for graph-specific features (layouts, clustering, filtering).
- **react-force-graph** — Simpler API but fewer layout options and less mature for large graphs.
- **vis.js** — Mature but less actively maintained, heavier bundle.
- **Sigma.js** — WebGL-based, great performance but less flexible styling.

**Why cytoscape.js wins:**
- **Layout algorithms.** Built-in support for hierarchical, force-directed, concentric, and grid layouts -- essential for visualizing call flows vs. dependency clusters vs. endpoint impact.
- **Performance.** Handles thousands of nodes and edges with smooth interaction.
- **Extensibility.** Rich extension ecosystem (compound nodes, edge bending, context menus).
- **Styling.** CSS-like style syntax for nodes and edges, making it easy to color-code by category and highlight paths.
- **Selection and interaction.** Built-in support for selecting nodes, hovering, right-clicking, and programmatic focus -- all needed for the Graph Explorer, Flow Tracer, and Impact View.

---

## Appendix: LanguageParser Interface

This is the single interface that must be implemented to add a new language (P2):

```typescript
// packages/parsers/src/interface.ts

import { IRNode } from '@veograph/shared';

export interface LanguageParser {
  /**
   * File extensions this parser handles (e.g., ['.ts', '.tsx']).
   * Used by the registry for auto-discovery.
   */
  extensions: string[];

  /**
   * Parse a source file into language-neutral IR nodes.
   *
   * @param source - The raw source code as a string
   * @param filePath - The file path (relative to repo root)
   * @returns An array of IR nodes (functions, imports, classes, etc.)
   */
  parse(source: string, filePath: string): IRNode[];
}
```

A new parser is registered by exporting a class that implements this interface from a file in `packages/parsers/src/languages/`. The registry discovers it automatically by scanning the directory at startup. No other file in the system needs modification.

---

## Appendix: Analysis Pipeline Detail

Each step receives the accumulated state from previous steps and enriches it:

```
Step 1: Call Graph Extraction
  Input:  IRNode[] per file (from parsers)
  Output: Map<filePath, CallGraph>  — functions and their call sites within each file

Step 2: Import Analysis
  Input:  IRNode[] per file
  Output: Map<filePath, ResolvedImport[]>  — which symbols come from which files

Step 3: Cross-File Resolution
  Input:  CallGraphs + ResolvedImports
  Output: CrossFileEdge[]  — function A in file X calls function B in file Y

Step 4: Cross-Repo Stitching
  Input:  All IRNodes tagged with category API_CALLER or API_ENDPOINT
  Output: CrossRepoEdge[]  — function in repo A calls endpoint in repo B
  Method: Match HTTP method + URL pattern from caller signatures to endpoint signatures

Step 5: Function Categorization
  Input:  All IRFunction nodes + their call targets
  Output: Each function tagged with a FunctionCategory
  Rules:  Pattern-based on IR structure:
          - Has event listener / JSX onClick → UI_INTERACTION
          - Registered as Express/Flask/Gin route handler → API_ENDPOINT
          - Calls fetch/axios/http.get with URL → API_CALLER
          - Calls ORM methods / raw SQL → DB_CALL
          - Matches req/res parameter pattern → HANDLER
          - Default → UTILITY

Step 6: Graph Storage
  Input:  All nodes, edges, and categories
  Output: Neo4j graph (via batch UNWIND + MERGE)
  Notes:  Uses transactions. Clears previous analysis for the project before writing.
          Applies constraints and indexes if not already present.
```
