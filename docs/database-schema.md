# VeoGraph — Neo4j Database Schema

This document is the authoritative reference for the Neo4j graph schema. All types
align with `packages/shared/src/graph.ts` and `packages/shared/src/enums.ts`.

---

## 1. Node Types

### Project

Groups multiple repositories for joint analysis.

| Property    | Neo4j Type | Required | Description                          |
|-------------|------------|----------|--------------------------------------|
| `id`        | STRING     | Yes      | UUID, primary key                    |
| `name`      | STRING     | Yes      | Unique human-readable project name   |
| `createdAt` | STRING     | Yes      | ISO-8601 creation timestamp          |

### Repository

A git repository belonging to a project.

| Property         | Neo4j Type | Required | Description                                  |
|------------------|------------|----------|----------------------------------------------|
| `id`             | STRING     | Yes      | UUID, primary key                            |
| `url`            | STRING     | Yes      | Git remote URL (unique within a project)     |
| `name`           | STRING     | Yes      | Short name derived from URL                  |
| `language`       | STRING     | No       | Primary language of the repository           |
| `lastAnalyzedAt` | STRING     | No       | ISO-8601 timestamp of last successful analysis |

### File

A single source file within a repository.

| Property   | Neo4j Type | Required | Description                                    |
|------------|------------|----------|------------------------------------------------|
| `id`       | STRING     | Yes      | UUID, primary key                              |
| `path`     | STRING     | Yes      | File path relative to repo root (unique/repo)  |
| `language` | STRING     | Yes      | Programming language of the file               |
| `hash`     | STRING     | Yes      | Content hash for incremental analysis          |

### Function

A function or method defined in a source file.

| Property    | Neo4j Type | Required | Description                                       |
|-------------|------------|----------|---------------------------------------------------|
| `id`        | STRING     | Yes      | UUID, primary key                                 |
| `name`      | STRING     | Yes      | Function / method name                            |
| `signature` | STRING     | Yes      | Full signature string for display                 |
| `category`  | STRING     | Yes      | One of: UI_INTERACTION, HANDLER, API_CALLER, API_ENDPOINT, DB_CALL, UTILITY |
| `startLine` | INTEGER    | Yes      | 1-based start line in the source file             |
| `endLine`   | INTEGER    | Yes      | 1-based end line in the source file               |

### APIEndpoint

An HTTP API endpoint exposed by the application.

| Property    | Neo4j Type | Required | Description                                          |
|-------------|------------|----------|------------------------------------------------------|
| `id`        | STRING     | Yes      | UUID, primary key                                    |
| `method`    | STRING     | Yes      | HTTP method: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD |
| `path`      | STRING     | Yes      | Route path pattern (e.g. `/users/:id`)               |
| `fullRoute` | STRING     | Yes      | Full route with base prefix (e.g. `/api/v1/users/:id`) |

### DBTable

A database table referenced in the code.

| Property | Neo4j Type | Required | Description                       |
|----------|------------|----------|-----------------------------------|
| `id`     | STRING     | Yes      | UUID, primary key                 |
| `name`   | STRING     | Yes      | Table name                        |
| `schema` | STRING     | No       | Database schema / namespace       |

---

## 2. Relationship Types

### BELONGS_TO

**Repository -> Project** — the repository belongs to this project.

| Property | Neo4j Type | Required | Description |
|----------|------------|----------|-------------|
| (none)   |            |          |             |

### IN_REPO

**File -> Repository** — the file lives in this repository.

| Property | Neo4j Type | Required | Description |
|----------|------------|----------|-------------|
| (none)   |            |          |             |

### DEFINED_IN

**Function -> File** — the function is defined in this file.

| Property | Neo4j Type | Required | Description |
|----------|------------|----------|-------------|
| (none)   |            |          |             |

### CALLS

**Function -> Function** — one function calls another (intra- or cross-file).

| Property   | Neo4j Type | Required | Description                                      |
|------------|------------|----------|--------------------------------------------------|
| `callSite` | INTEGER    | Yes      | Line number of the call site in the caller's file |

### IMPORTS

**File -> File** — one file imports another.

| Property  | Neo4j Type    | Required | Description                  |
|-----------|---------------|----------|------------------------------|
| `symbols` | LIST<STRING>  | Yes      | Specific symbol names imported |

### EXPOSES

**Function -> APIEndpoint** — a function exposes (serves) this endpoint.

| Property | Neo4j Type | Required | Description |
|----------|------------|----------|-------------|
| (none)   |            |          |             |

### CALLS_API

**Function -> APIEndpoint** — a function calls this endpoint as a client.

| Property     | Neo4j Type | Required | Description              |
|--------------|------------|----------|--------------------------|
| `httpMethod` | STRING     | Yes      | HTTP method used in call |
| `urlPattern` | STRING     | Yes      | URL pattern matched      |

### READS

**Function -> DBTable** — the function reads from this table.

| Property | Neo4j Type | Required | Description                              |
|----------|------------|----------|------------------------------------------|
| `query`  | STRING     | No       | The query or ORM expression for the read |

### WRITES

**Function -> DBTable** — the function writes to this table.

| Property | Neo4j Type | Required | Description                               |
|----------|------------|----------|-------------------------------------------|
| `query`  | STRING     | No       | The query or ORM expression for the write |

---

## 3. Constraints

| Constraint Name                    | Type       | Target                    | Description                          |
|------------------------------------|------------|---------------------------|--------------------------------------|
| `project_id_unique`                | UNIQUE     | `Project.id`              | Primary key                          |
| `project_name_unique`              | UNIQUE     | `Project.name`            | No duplicate project names           |
| `repository_id_unique`             | UNIQUE     | `Repository.id`           | Primary key                          |
| `file_id_unique`                   | UNIQUE     | `File.id`                 | Primary key                          |
| `function_id_unique`               | UNIQUE     | `Function.id`             | Primary key                          |
| `apiendpoint_id_unique`            | UNIQUE     | `APIEndpoint.id`          | Primary key                          |
| `dbtable_id_unique`                | UNIQUE     | `DBTable.id`              | Primary key                          |
| `project_name_exists`              | EXISTS     | `Project.name`            | Name must always be set              |
| `repository_url_exists`            | EXISTS     | `Repository.url`          | URL must always be set               |
| `file_path_exists`                 | EXISTS     | `File.path`               | Path must always be set              |
| `function_name_exists`             | EXISTS     | `Function.name`           | Name must always be set              |
| `apiendpoint_method_exists`        | EXISTS     | `APIEndpoint.method`      | Method must always be set            |
| `apiendpoint_path_exists`          | EXISTS     | `APIEndpoint.path`        | Path must always be set              |

> **Note on scoped uniqueness:** Neo4j does not support composite unique constraints
> across relationships (e.g. "unique `Repository.url` within a project"). Scoped
> uniqueness for `Repository.url` per project and `File.path` per repository is
> enforced at the application layer using MERGE patterns with relationship context.

---

## 4. Indexes

### Property Indexes

| Index Name                  | Label        | Property(ies)      | Description                                |
|-----------------------------|--------------|--------------------|--------------------------------------------|
| `idx_function_name`         | Function     | `name`             | Fast lookup of functions by name           |
| `idx_function_category`     | Function     | `category`         | Filter functions by architectural category |
| `idx_apiendpoint_method`    | APIEndpoint  | `method`           | Filter endpoints by HTTP method            |
| `idx_apiendpoint_path`      | APIEndpoint  | `path`             | Lookup endpoints by route path             |
| `idx_repository_url`        | Repository   | `url`              | Lookup repositories by Git URL             |
| `idx_file_path`             | File         | `path`             | Lookup files by path                       |
| `idx_file_hash`             | File         | `hash`             | Incremental analysis: find changed files   |
| `idx_dbtable_name`          | DBTable      | `name`             | Lookup tables by name                      |

### Composite Indexes

| Index Name                         | Label       | Properties            | Description                                 |
|------------------------------------|-------------|-----------------------|---------------------------------------------|
| `idx_apiendpoint_method_path`      | APIEndpoint | `method`, `path`      | Cross-repo stitching: match caller to endpoint |
| `idx_function_category_name`       | Function    | `category`, `name`    | Filtered search within a category           |

### Full-Text Indexes

| Index Name              | Label(s)  | Property(ies) | Description                          |
|-------------------------|-----------|---------------|--------------------------------------|
| `ft_function_name`      | Function  | `name`        | NLP search and autocomplete          |
| `ft_apiendpoint_route`  | APIEndpoint | `fullRoute` | NLP search on endpoint routes        |

---

## 5. Schema Diagram (ASCII)

```
                    ┌───────────────┐
                    │    Project    │
                    │───────────────│
                    │ id            │
                    │ name          │
                    │ createdAt     │
                    └───────┬───────┘
                            │
                       BELONGS_TO
                            │
                    ┌───────┴───────┐
                    │  Repository   │
                    │───────────────│
                    │ id            │
                    │ url           │
                    │ name          │
                    │ language?     │
                    │ lastAnalyzedAt│
                    └───────┬───────┘
                            │
                         IN_REPO
                            │
                    ┌───────┴───────┐
                    │     File      │
                    │───────────────│
                    │ id            │
                    │ path          │
                    │ language      │
                    │ hash          │
                    └──┬─────────┬──┘
                       │         │
                  DEFINED_IN   IMPORTS
                       │         │
           ┌───────────┴──┐  ┌──┴───────────┐
           │              │  │              │
           ▼              │  ▼              │
    ┌──────────────┐      │  File           │
    │   Function   │      │  (target)       │
    │──────────────│      │                 │
    │ id           │      │                 │
    │ name         │      │                 │
    │ signature    │      │                 │
    │ category     │      │                 │
    │ startLine    │      │                 │
    │ endLine      │      │                 │
    └─┬──┬──┬──┬───┘      │                 │
      │  │  │  │          │                 │
      │  │  │  └──── CALLS ────► Function   │
      │  │  │                    (target)    │
      │  │  │                                │
      │  │  └──── EXPOSES ──────┐            │
      │  │                      ▼            │
      │  │              ┌───────────────┐    │
      │  └─ CALLS_API ─►│  APIEndpoint  │    │
      │                 │───────────────│    │
      │                 │ id            │    │
      │                 │ method        │    │
      │                 │ path          │    │
      │                 │ fullRoute     │    │
      │                 └───────────────┘    │
      │                                      │
      │    READS / WRITES                    │
      │         │                            │
      ▼         ▼                            │
    ┌───────────────┐                        │
    │    DBTable    │                        │
    │───────────────│                        │
    │ id            │                        │
    │ name          │                        │
    │ schema?       │                        │
    └───────────────┘                        │
```

### Relationship Summary

```
(Repository)-[:BELONGS_TO]->(Project)
(File)-[:IN_REPO]->(Repository)
(Function)-[:DEFINED_IN]->(File)
(Function)-[:CALLS {callSite}]->(Function)
(File)-[:IMPORTS {symbols}]->(File)
(Function)-[:EXPOSES]->(APIEndpoint)
(Function)-[:CALLS_API {httpMethod, urlPattern}]->(APIEndpoint)
(Function)-[:READS {query?}]->(DBTable)
(Function)-[:WRITES {query?}]->(DBTable)
```
