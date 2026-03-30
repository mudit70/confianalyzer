# ConfiAnalyzer

A federated code analysis system that uses language-native parsers to build a unified relationship graph across multi-language, multi-repository codebases. The graph is stored in Neo4j and can be queried by developers through a web UI with natural language support.

## Architecture

```
┌─────────────────────────────────────────────┐
│           ConfiAnalyzer Orchestrator         │
│  (stitches call graphs, stores in Neo4j,    │
│   serves UI, runs NLP queries)              │
└──────────┬──────────────────────────────────┘
           │ Standard IR JSON (confianalyzer-ir-v1)
    ┌──────┼──────┬──────────┬──────────┐
    ▼      ▼      ▼          ▼          ▼
┌──────┐┌──────┐┌──────┐┌──────┐┌──────────┐
│ JS/TS││ Java ││Python││ Go   ││ Rust     │
│Analyz││Analyz││Analyz││Analyz││ Analyzer │
│  er  ││  er  ││  er  ││  er  ││          │
└──────┘└──────┘└──────┘└──────┘└──────────┘
  Each analyzer runs natively in its own language
```

Each language gets its own analyzer written in that language, using its native compiler API. All analyzers output a standard IR JSON format. The orchestrator reads the IR, stitches cross-file and cross-repo relationships, and stores the unified graph in Neo4j.

## Key Features

- **Language-native parsing** — TypeScript Compiler API for JS/TS, JavaParser for Java, Python `ast` for Python, `go/parser` for Go, `syn` for Rust
- **Cross-language stitching** — matches `fetch('/api/users')` in React to `@router.get("/api/users")` in FastAPI
- **Framework-aware** — plugins detect Express, React, Spring Boot, Django, FastAPI, etc.
- **Neo4j graph storage** — relationships queryable by developers
- **Natural language queries** — AI translates questions to Cypher
- **Web UI** — summary dashboard, flow tracing, neighborhood exploration

## Repository Structure

```
confianalyzer/
├── packages/
│   ├── ir-contract/     # IR JSON schema + validators
│   ├── orchestrator/    # Reads IR, stitches, stores in Neo4j
│   ├── frontend/        # React web UI
│   └── nlp/             # NLP-to-Cypher translator
├── analyzers/
│   ├── js-ts/           # JavaScript/TypeScript analyzer (Node.js)
│   ├── python/          # Python analyzer (Python)
│   ├── java/            # Java analyzer (Java + JavaParser)
│   ├── go/              # Go analyzer (Go)
│   └── rust/            # Rust analyzer (Rust + syn)
├── docs/                # Architecture, IR contract, design docs
└── tests/               # Integration tests
```

## Derived from VeoGraph

ConfiAnalyzer is the federated evolution of [VeoGraph](https://github.com/mudit70/veograph). VeoGraph's monolithic approach (all parsers in Node.js) is replaced with language-native analyzers communicating through a standard IR contract.
