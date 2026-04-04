# ConfiAnalyzer

A federated code analysis system that uses language-native parsers to analyze multi-language, multi-repository codebases and build a unified relationship graph. The graph is stored in Neo4j and queryable through a web UI with natural language support powered by Anthropic Claude.

## Architecture

```
                     .confianalyzer.yaml (per-repo config)
                              |
     +----------+----------+--+-------+-----------+
     |          |          |          |           |
 +-------+ +-------+ +--------+ +-------+ +--------+
 | JS/TS | | Python| |  Go    | | Java  | | Rust   |
 |  (TS  | | (ast) | |(go/ast)| |(Java- | | (syn)  |
 | Comp. | |       | |        | |Parser)| |        |
 |  API) | |       | |        | |       | |        |
 +---+---+ +---+---+ +---+----+ +---+---+ +---+----+
     |          |          |          |         |
     +----------+----------+----------+---------+
                           |
              IR JSON (confianalyzer-ir-v1)
                           |
                    +------+------+
                    | Orchestrator|
                    | (cross-file |
                    |  resolution,|
                    |  stitching) |
                    +------+------+
                           |
                    +------+------+
                    |    Neo4j    |
                    +------+------+
                           |
                    +------+------+
                    |  API Server |
                    |  (Express)  |
                    +------+------+
                           |
                    +------+------+
                    |  Frontend   |
                    | (React+Vite)|
                    +-------------+
```

## Features

**Five language-native analyzers**, each using its language's own compiler API:

| Language       | Parser             | Framework Plugins                        |
|----------------|--------------------|------------------------------------------|
| JavaScript/TS  | TypeScript Compiler API | Express, React, Axios              |
| Python         | `ast` module       | FastAPI, Flask, SQLAlchemy                |
| Go             | `go/ast`           | Gin, Chi, net/http                        |
| Java           | JavaParser         | Spring MVC/WebFlux, JAX-RS, JPA           |
| Rust           | `syn`              | Actix-web, Axum, Diesel                   |

**Cross-language API stitching** -- matches HTTP callers in one repo/language to API endpoints in another. Route parameter formats are normalized across frameworks (`Express :id`, `FastAPI {id}`, `Flask <id>` all become `{param}`).

**NLP-to-Cypher query translation** -- ask questions about the codebase in natural language, translated to Cypher queries via the Anthropic Claude API.

**Guided exploration UI** -- summary dashboard, flow tracing, neighborhood exploration, function search, hotspot detection, and high fan-out analysis.

**Incremental analysis** -- analyze individual repositories and stitch results into the existing graph.

**Configurable per-repo** -- `.confianalyzer.yaml` controls include/exclude patterns and active framework plugins per repository.

## Repository Structure

```
confianalyzer/
├── analyzers/
│   ├── js-ts/                  # TypeScript/JavaScript analyzer (Node.js)
│   ├── python/                 # Python analyzer (Python 3.10+)
│   ├── go/                     # Go analyzer
│   ├── java/                   # Java analyzer (Maven, JavaParser)
│   └── rust/                   # Rust analyzer (syn crate)
├── packages/
│   ├── ir-contract/            # IR JSON schema, types, and Ajv validator
│   ├── orchestrator/           # Cross-file resolution, stitching, Neo4j writer
│   ├── api/                    # Express.js REST API server
│   ├── nlp/                    # NLP-to-Cypher translator (Anthropic Claude)
│   └── frontend/               # React + Vite web UI
├── tests/
│   ├── integration/            # Cross-analyzer and cross-repo integration tests
│   └── fixtures/               # Test fixture repos (backend, frontend)
├── docs/                       # Architecture docs, IR spec, design docs
├── docker-compose.yml          # Full stack (Neo4j + API + Frontend)
├── docker-compose.dev.yml      # Neo4j only (local development)
├── Dockerfile.api              # API server container
├── Dockerfile.frontend         # Frontend container
├── nginx.conf                  # Frontend reverse proxy config
└── .github/workflows/ci.yml    # CI pipeline (all 5 languages + integration)
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+ (for Python analyzer)
- Go 1.21+ (for Go analyzer)
- Java 17+ with Maven (for Java analyzer)
- Rust toolchain (for Rust analyzer, optional)
- Docker (optional, for Neo4j or full stack)

### Option A: Docker (recommended)

```bash
docker compose up
```

| Service         | URL                        |
|-----------------|----------------------------|
| Frontend        | http://localhost:3000       |
| API             | http://localhost:3001       |
| Neo4j Browser   | http://localhost:7474       |

### Option B: Local Development

```bash
# Install dependencies and build all TypeScript packages
npm install
npm run build

# Start Neo4j via Docker
docker compose -f docker-compose.dev.yml up -d

# Start the API server
cd packages/api && node dist/index.js

# In another terminal, start the frontend in dev mode
cd packages/frontend && npm run dev
```

The API server expects these environment variables (defaults shown):

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=confianalyzer
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## Running Analyzers

Each analyzer is a standalone CLI that outputs IR JSON to a file.

```bash
# TypeScript / JavaScript
node analyzers/js-ts/dist/cli.js --repo /path/to/repo --repo-name my-app --output ir.json

# Python
python -m confianalyzer_python --repo /path/to/repo --repo-name my-app --output ir.json

# Go
./analyzers/go/confianalyzer-analyze-go --repo /path/to/repo --repo-name my-app --output ir.json

# Java
java -jar analyzers/java/target/confianalyzer-analyze-java-1.0-SNAPSHOT-jar-with-dependencies.jar \
  --repo /path/to/repo --repo-name my-app --output ir.json

# Rust
./analyzers/rust/target/release/confianalyzer-analyze-rust --repo /path/to/repo --repo-name my-app --output ir.json
```

## Running Tests

```bash
# All TypeScript packages (ir-contract, orchestrator, api, nlp, frontend, js-ts analyzer)
npm test

# Python analyzer
npm run test:python

# Go analyzer
cd analyzers/go && go test ./...

# Java analyzer
cd analyzers/java && mvn test

# Rust analyzer
cd analyzers/rust && cargo test

# TypeScript + Python combined
npm run test:all
```

### Test Counts

| Package              | Framework  | Tests |
|----------------------|------------|------:|
| ir-contract          | Vitest     |     8 |
| js-ts analyzer       | Vitest     |    24 |
| orchestrator         | Vitest     |    41 |
| api                  | Vitest     |    36 |
| nlp                  | Vitest     |    51 |
| frontend             | Vitest     |     9 |
| python analyzer      | pytest     |    40 |
| go analyzer          | go test    |     8 |
| java analyzer        | JUnit 5    |    14 |
| rust analyzer        | cargo test |    38 |
| integration tests    | Vitest     |    50 |
| **Total**            |            | **319** |

## IR JSON Contract

All analyzers output the `confianalyzer-ir-v1` JSON format. The schema defines files, functions, calls, imports, exports, classes, and framework enrichments. The `@confianalyzer/ir-contract` package provides TypeScript types and an Ajv-based validator.

See [docs/federated-architecture.md](docs/federated-architecture.md) for the full IR schema specification.

## Configuration

Each repository can include a `.confianalyzer.yaml` file to control analysis:

```yaml
# Which files to analyze (globs, relative to repo root)
include:
  - "src/**"

# Files to skip
exclude:
  - "**/__tests__/**"
  - "**/*.test.*"
  - "**/node_modules/**"
  - "**/dist/**"

# Framework plugins to activate (omit to auto-detect)
plugins:
  - express
  - react

# Additional options
options:
  maxDepth: 10
```

When `plugins` is omitted, analyzers auto-detect frameworks from imports. When specified, only the listed plugins run.

## API Endpoints

### Projects

| Method | Path                                | Description                          |
|--------|-------------------------------------|--------------------------------------|
| GET    | `/api/projects`                     | List all projects                    |
| GET    | `/api/projects/:name`               | Get project details                  |
| POST   | `/api/projects`                     | Create a project                     |
| GET    | `/api/projects/:name/summary`       | Project summary stats                |
| GET    | `/api/projects/:name/repositories`  | List repositories in a project       |

### Analysis

| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| POST   | `/api/analysis/run`           | Trigger an analysis run              |
| GET    | `/api/analysis/status/:runId` | Check analysis run status            |

### Graph Exploration

| Method | Path                                              | Description                           |
|--------|---------------------------------------------------|---------------------------------------|
| GET    | `/api/functions/:id/neighbors`                    | Function callers and callees          |
| GET    | `/api/functions/:id/trace`                        | Call chain trace                      |
| GET    | `/api/search/functions`                           | Search functions by name              |
| GET    | `/api/search/endpoints`                           | Search API endpoints                  |
| GET    | `/api/files/:id`                                  | File details                          |
| GET    | `/api/files/:id/functions`                        | Functions in a file                   |
| GET    | `/api/repositories/:name/files`                   | Files in a repository                 |
| GET    | `/api/endpoints`                                  | List all API endpoints                |
| GET    | `/api/graph/node/:id/neighborhood`                | Generic node neighborhood             |
| GET    | `/api/graph/node/:id/entry-to-exit`               | Entry-to-exit path analysis           |
| GET    | `/api/graph/insights/:projectName/hotspots`       | Most-called functions                 |
| GET    | `/api/graph/insights/:projectName/high-fanout`    | Functions with many outgoing calls    |
| GET    | `/api/graph/category/:projectName/:category`      | Functions by category                 |

### NLP

| Method | Path                    | Description                              |
|--------|-------------------------|------------------------------------------|
| POST   | `/api/query/nlp`        | Translate natural language to Cypher      |
| POST   | `/api/query/nlp/summarize` | Summarize query results               |

### Health

| Method | Path           | Description      |
|--------|----------------|------------------|
| GET    | `/api/health`  | Health check     |

## Tech Stack

| Component        | Technology                              |
|------------------|-----------------------------------------|
| IR Contract      | TypeScript + Ajv                        |
| TS/JS Analyzer   | TypeScript Compiler API                 |
| Python Analyzer  | Python `ast` module                     |
| Go Analyzer      | `go/ast`, `go/parser`                   |
| Java Analyzer    | JavaParser                              |
| Rust Analyzer    | `syn`, `proc-macro2`                    |
| Orchestrator     | TypeScript                              |
| NLP Translation  | Anthropic Claude API                    |
| API Server       | Express.js                              |
| Frontend         | React 18 + Vite + React Router          |
| Database         | Neo4j 5 Community                       |
| Testing          | Vitest, pytest, go test, JUnit 5, cargo test |
| CI               | GitHub Actions                          |
| Containerization | Docker Compose                          |

## Derived From

ConfiAnalyzer is the federated evolution of [VeoGraph](https://github.com/mudit70/veograph). VeoGraph's monolithic approach (all parsers in Node.js) is replaced with language-native analyzers communicating through a standard IR contract.
