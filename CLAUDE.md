# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

ConfiAnalyzer is a federated code analysis system. It uses language-native parsers (each running in their own language) to analyze multi-language, multi-repository codebases and build a unified relationship graph stored in Neo4j.

## Core Principles

- **P1 — Deterministic Analysis:** All code analysis produces identical output given identical input. Each analyzer uses its language's native compiler API (TypeScript Compiler API, JavaParser, Python ast, go/parser, syn). No regex or heuristics for code structure understanding.
- **P2 — Language Extensibility (Federated):** Adding a new language requires building a standalone analyzer that outputs the standard IR JSON format (confianalyzer-ir-v1). The analyzer runs natively in its own language. No other component needs modification.
- **P3 — Multi-Repository Support:** A "project" is a collection of repositories, potentially in different languages. Cross-repo stitching matches API callers to API endpoints across repos and languages. Neo4j stores cross-repo relationships natively.
- **P4 — Modularity via Contracts:** The IR JSON contract is the boundary between analyzers and the orchestrator. Analyzers know nothing about Neo4j. The orchestrator knows nothing about language-specific parsing. The frontend communicates with the backend through typed API contracts.
- **P5 — Framework Extensibility:** Each analyzer includes framework-specific detection for its language. The IR contract has an `enrichments` field for framework metadata (routes, ORM calls, component hierarchy). New framework support is added within the relevant analyzer.

## Architecture

```
Analyzers (per-language) → IR JSON → Orchestrator → Neo4j → Frontend
```

### IR JSON Contract (confianalyzer-ir-v1)
Every analyzer outputs the same JSON format. See `docs/federated-architecture.md` for the full schema.

### Cross-Language Stitching
The orchestrator matches API callers from one repo/language to API endpoints in another:
- Express `:id`, FastAPI `{id}`, Flask `<id>`, Next.js `[id]` all normalize to `{param}`
- HTTP method + normalized path = match key

## Analysis Pipeline

1. Discovery — find repos and their languages
2. Parallel analysis — invoke each language's analyzer concurrently
3. IR JSON collection — read all analyzer outputs
4. Cross-file resolution — connect functions across files within each repo
5. Cross-repo stitching — match API callers to endpoints across repos/languages
6. Graph storage — write unified graph to Neo4j

## Way of Working

### Issue-Driven Development
- **Before starting any work**, create a GitHub issue with implementation plan and test plan.
- When done, commit and close the issue.

### Branching Strategy
- Feature branches off `main`, merged via PR.

### Testing
- Each analyzer has its own test suite in its own language.
- Integration tests verify cross-language stitching.
- Playwright tests for frontend.
