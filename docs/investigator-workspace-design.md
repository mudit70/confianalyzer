# Investigator Workspace — Phased Implementation Plan

Synthesized from Issues #69 (Developer-Centric Views), #70 (AI Strategies), #71 (Investigator Workspace UI).

**Goal:** Transform the existing Graph Explorer into an "Investigator Workspace" incrementally, reusing every component we already have and adding capabilities phase by phase.

---

## Current Inventory (What We Have)

| Component | File | What It Does |
|-----------|------|--------------|
| NLPQueryBar | `frontend/src/components/NLPQueryBar.tsx` | Text-to-Cypher via Claude/OpenAI/Ollama/LM Studio. History, generated Cypher display, summary. |
| SummaryDashboard | `frontend/src/components/SummaryDashboard.tsx` | Category cards (API Callers, DB Calls, UI Interactions, Handlers, Endpoints), distribution bars, top connected functions. |
| GraphExplorer | `frontend/src/pages/GraphExplorer.tsx` | Cytoscape.js canvas, context menu, file selector, breadcrumbs, node selection. |
| NodeDetailPanel | `frontend/src/components/NodeDetailPanel.tsx` | Node properties, connections count, imports/importedBy for files, "Trace Flow" and "Show Callers" actions. |
| FlowTracer | `frontend/src/pages/FlowTracer.tsx` | Downstream/upstream/both flow traversal from a start node. Cytoscape rendering with category coloring. |
| EndpointImpact | `frontend/src/pages/EndpointImpact.tsx` | Endpoint callers view with cross-repo coloring. |
| FunctionSearch | `frontend/src/components/FunctionSearch.tsx` | Name-based function search within a project. |
| NLP Translator | `nlp/src/translator.ts` | Multi-provider NL-to-Cypher with schema context, validation, project scoping. |
| Graph API | `api/src/routes/graph.ts` | 10 endpoints: node, flow, endpoint callers, overview, file imports, file functions, function neighbors, summary, file tree, category, search, raw Cypher query. |
| NLP API | `api/src/routes/nlp.ts` | POST /nlp/query — translates NL to Cypher via configured AI provider. |

**Graph data:** ~100 API endpoints, 2100+ functions, categories, imports, cross-repo CALLS_API relationships, DB_TABLE nodes with READS/WRITES edges.

---

## Phase 1: Enhanced Command Bar (Omni-Prompt)

**Priority: P0 — Start here. Pure frontend work plus one small backend addition.**

**Issue coverage:** #70 (Text-to-Cypher enhancement), #71 (Agentic Command Bar)

### What Changes

**Modify existing: `NLPQueryBar.tsx`**

1. **Quick-filter toggle chips** below the input field:
   - `Frontend Only` — appends filter hint to the NL query: "...only in frontend repositories"
   - `Backend Only` — "...only in backend repositories"
   - `Exclude Tests` — "...excluding test files"
   - `DB Layer Only` — "...only functions with DB_CALL category"
   - These are UI-only hints injected into the prompt text before sending to the NLP endpoint. No backend change needed.
   - Store active filters in component state. Visually show them as toggle pills.

2. **Thinking indicator** — replace the current spinner (`nlp-query-bar__loading-indicator`) with a multi-step progress display:
   - Step 1: "Understanding your question..."
   - Step 2: "Generating Cypher query..."
   - Step 3: "Executing against graph..."
   - Step 4: "Preparing results..."
   - Use a `currentStep` state that advances on a timer (steps 1-2 are fast, step 3 is the actual API call). This is cosmetic but makes the AI feel agentic.

3. **Result summary enhancement** — the existing `summary` field (from `data.explanation`) already displays. Add a "Summarize this subgraph" button that appears when results are shown, which triggers Phase 5's summarization (stub it for now with the explanation text).

**Modify existing: `nlp/src/translator.ts`**

4. Add filter context to the system prompt. When the frontend sends filter hints embedded in the query, the translator already handles them because they are natural language. No code change strictly needed, but we can add a `filters` field to `NLPQueryRequest` for cleaner separation:

**New shared type addition:**

```typescript
// In @veograph/shared
interface NLPQueryRequest {
  query: string;
  projectId: string;
  filters?: {
    frontendOnly?: boolean;
    backendOnly?: boolean;
    excludeTests?: boolean;
    dbLayerOnly?: boolean;
  };
}
```

**Backend: `api/src/routes/nlp.ts`**

5. Read `filters` from the request body and append structured hints to the NL query before passing to `translateQuery()`. Example: if `excludeTests` is true, append `"\n[Filter: exclude files whose path contains 'test', 'spec', '__tests__', or 'mock']"`.

### Files to Touch

| File | Action |
|------|--------|
| `frontend/src/components/NLPQueryBar.tsx` | Modify — add filter chips, thinking indicator, summarize button |
| `frontend/src/components/NLPQueryBar.css` | Modify — styles for filter chips, step indicator |
| `shared/src/types/nlp.ts` | Modify — add `filters` field to NLPQueryRequest |
| `api/src/routes/nlp.ts` | Modify — read filters, append hints to query |

### No New Backend Endpoints

The existing `POST /nlp/query` and `POST /graph/query` handle everything.

---

## Phase 2: Smart Trace View (Entry-to-Exit)

**Priority: P0 — High developer value. Builds directly on FlowTracer.**

**Issue coverage:** #69 (Entry-to-Exit traces), #71 (Dynamic Canvas)

### What Changes

**Modify existing: `FlowTracer.tsx`**

1. **Entry point picker** — add a dropdown/search at the top of FlowTracer that lets the user pick an entry point by category:
   - "Start from UI Interaction" — shows functions with `category = UI_INTERACTION`
   - "Start from API Endpoint" — shows API endpoint nodes
   - "Start from Handler" — shows `category = HANDLER` functions
   - Uses the existing `POST /graph/search` and `GET /graph/category/:projectId/:category` endpoints.

2. **Spine pruning** — add a toggle "Show spine only" that filters out UTILITY-category nodes from the trace. The flow data (`FlowTrace.hops`) already includes category info on each node. Frontend filters `hops` where `node.category !== 'UTILITY'` when the toggle is on, keeping only nodes whose category is in `[UI_INTERACTION, HANDLER, API_CALLER, API_ENDPOINT, DB_CALL]`.

3. **Swimlane layout** — add an alternative layout mode. Instead of the default Cytoscape force-directed layout, apply a custom layout that:
   - X-axis = depth (from the `hop.depth` field already in `FlowTrace`)
   - Y-axis = file grouping (nodes from the same file cluster vertically)
   - This creates a left-to-right swimlane effect showing the cross-file flow.
   - Implement as a Cytoscape `preset` layout with manually computed positions.

4. **Terminal node highlighting** — visually distinguish "exit" nodes (DB_CALL functions, DB_TABLE nodes, API endpoints at the end of the chain) with a distinct border/glow. Already have the data; just CSS.

**New backend endpoint: `GET /graph/node/:id/entry-to-exit`**

5. A specialized version of the existing `/node/:id/flow` that:
   - Runs downstream traversal (already exists)
   - Post-processes to find all paths that terminate at a DB_CALL, DB_TABLE, or API_ENDPOINT
   - Returns only those complete paths (prunes dead-end UTILITY branches)
   - Includes file path for each hop (requires an extra OPTIONAL MATCH to the File node)

```
GET /graph/node/:id/entry-to-exit?pruneUtility=true&maxDepth=15
```

Cypher sketch:
```cypher
MATCH (start {id: $startNodeId})
MATCH path = (start)-[:CALLS|CALLS_API|EXPOSES|READS|WRITES*1..15]->(terminal)
WHERE terminal:DBTable
   OR (terminal:Function AND terminal.category IN ['DB_CALL', 'API_ENDPOINT'])
   OR terminal:APIEndpoint
WITH path, [n IN nodes(path) | n] AS pathNodes
OPTIONAL MATCH (fn)-[:DEFINED_IN]->(f:File) WHERE fn IN pathNodes AND fn:Function
RETURN path, collect(DISTINCT {fnId: fn.id, filePath: f.path}) AS fileMap
```

### Files to Touch

| File | Action |
|------|--------|
| `frontend/src/pages/FlowTracer.tsx` | Modify — entry picker, spine toggle, swimlane layout, terminal highlighting |
| `frontend/src/pages/FlowTracer.css` | Modify — swimlane styles, terminal glow |
| `api/src/routes/graph.ts` | Modify — add `/node/:id/entry-to-exit` endpoint |
| `frontend/src/api/client.ts` | Modify — add `getEntryToExitTrace()` client function |
| `shared/src/types/graph.ts` | Modify — add `EntryToExitTrace` type with file path per hop |

---

## Phase 3: Context Neighborhood View

**Priority: P1 — Enhances the existing "expand neighbors" interaction.**

**Issue coverage:** #69 (Context Neighborhoods), #71 (Context Inspector)

### What Changes

**Modify existing: `NodeDetailPanel.tsx`**

1. **Neighborhood depth control** — add a depth selector (1 / 2 / 3) in the node detail panel. Default to 1. When user increases depth, fetch the expanded neighborhood.

2. **Neighborhood view trigger** — add a "Show Neighborhood" button alongside the existing "Focus" and "Trace Flow" buttons. This replaces the informal "expand neighbors" behavior with a deliberate action.

**Modify existing: `GraphExplorer.tsx`**

3. **Neighborhood rendering mode** — when a neighborhood view is active:
   - Dim all nodes outside the neighborhood
   - Highlight the center node distinctly
   - Show concentric rings layout (depth-1 in inner ring, depth-2 in outer ring)
   - Use Cytoscape's `concentric` layout with depth as the concentric level

4. **File-level neighborhood** — for File nodes, the existing `getFileImports()` already fetches imports and importedBy. Enhance this to render as a neighborhood graph rather than just a list in the detail panel.

**New backend endpoint: `GET /graph/node/:id/neighborhood`**

5. Returns all nodes and relationships within N hops of the target node:

```
GET /graph/node/:id/neighborhood?depth=2&maxNodes=100
```

Cypher:
```cypher
MATCH (center {id: $nodeId})
MATCH path = (center)-[*1..2]-(neighbor)
WITH center, collect(DISTINCT neighbor) AS neighbors,
     [r IN collect(DISTINCT relationships(path)) | r] AS allRels
// flatten and deduplicate
RETURN center, neighbors, allRels
```

We already have `GET /graph/node/:id` which fetches depth-1 neighbors. The new endpoint generalizes to depth-N with a node count cap.

### Files to Touch

| File | Action |
|------|--------|
| `frontend/src/components/NodeDetailPanel.tsx` | Modify — add depth selector, "Show Neighborhood" button |
| `frontend/src/pages/GraphExplorer.tsx` | Modify — neighborhood rendering mode, concentric layout |
| `frontend/src/pages/GraphExplorer.css` | Modify — dimming styles, ring layout |
| `api/src/routes/graph.ts` | Modify — add `/node/:id/neighborhood` endpoint |
| `frontend/src/api/client.ts` | Modify — add `getNeighborhood()` client function |

---

## Phase 4: Intelligence Dashboard (Left Sidebar)

**Priority: P1 — Leverages existing summary data with new graph analytics.**

**Issue coverage:** #69 (Blast Radius, Architectural Boundaries), #71 (Intelligence Dashboard)

### What Changes

**New component: `IntelligenceSidebar.tsx`**

A collapsible left sidebar in GraphExplorer that shows computed insights:

1. **Hotspots panel** — files with the most inbound dependencies (highest fan-in). Click any file to open it in the graph.

2. **High fan-out functions** — functions that call the most other functions. These are potential "god functions" worth refactoring.

3. **Circular import detection** — files that form import cycles. Shows each cycle as a clickable group.

4. **Cross-repo boundary summary** — which repositories talk to each other and through how many connections. Reuses data shape from SummaryDashboard.

5. **Quick stats** — total functions, files, endpoints, tables. Pulled from the existing `GET /graph/summary/:projectId`.

**Modify existing: `GraphExplorer.tsx`**

6. Add toggle button to show/hide the intelligence sidebar. When an insight is clicked, load the relevant nodes into the graph canvas.

**New backend endpoints:**

```
GET /graph/insights/:projectId/hotspots?limit=20
```
Returns files sorted by inbound dependency count (number of files that import them).

Cypher:
```cypher
MATCH (f:File {projectId: $projectId})<-[r:IMPORTS]-(importer:File)
RETURN f.id AS id, f.path AS path, count(r) AS importCount
ORDER BY importCount DESC
LIMIT $limit
```

```
GET /graph/insights/:projectId/circular-imports
```
Detects circular import chains.

Cypher:
```cypher
MATCH (f1:File {projectId: $projectId})-[:IMPORTS]->(f2:File)-[:IMPORTS]->(f1)
RETURN f1.id AS file1Id, f1.path AS file1Path, f2.id AS file2Id, f2.path AS file2Path
```

```
GET /graph/insights/:projectId/fan-out?limit=20
```
Returns functions sorted by outgoing CALLS count.

Cypher:
```cypher
MATCH (fn:Function {projectId: $projectId})-[r:CALLS]->()
RETURN fn.id AS id, fn.name AS name, fn.category AS category, count(r) AS callCount
ORDER BY callCount DESC
LIMIT $limit
```

Note: The existing `GET /graph/summary/:projectId` already returns `topFunctions` sorted by call count. The fan-out endpoint above provides a dedicated, tunable version. We could also just extend the summary endpoint with an `includeFanOut` query param if we prefer fewer endpoints.

### Files to Touch

| File | Action |
|------|--------|
| `frontend/src/components/IntelligenceSidebar.tsx` | **New** — sidebar component with hotspots, fan-out, cycles, boundaries |
| `frontend/src/components/IntelligenceSidebar.css` | **New** — sidebar styles |
| `frontend/src/pages/GraphExplorer.tsx` | Modify — integrate sidebar toggle, wire click-to-graph |
| `frontend/src/pages/GraphExplorer.css` | Modify — layout adjustment for sidebar |
| `api/src/routes/graph.ts` | Modify — add `/insights/:projectId/hotspots`, `/insights/:projectId/circular-imports`, `/insights/:projectId/fan-out` |
| `frontend/src/api/client.ts` | Modify — add `getHotspots()`, `getCircularImports()`, `getFanOut()` client functions |
| `shared/src/types/graph.ts` | Modify — add insight response types |

---

## Phase 5: Subgraph Summarization

**Priority: P2 — Depends on having good subgraph views (Phases 2-3) to summarize.**

**Issue coverage:** #70 (Subgraph summarization), #71 (AI-powered insights)

### What Changes

**Modify existing: `NLPQueryBar.tsx`**

1. The "Summarize this subgraph" button (stubbed in Phase 1) now calls a real endpoint.

**New component: `SubgraphSummary.tsx`**

2. A floating panel that appears over the graph canvas showing:
   - A one-paragraph AI-generated summary of the currently displayed subgraph
   - Key entities mentioned (functions, endpoints, tables)
   - Potential concerns (e.g., "This flow crosses 3 repositories", "No error handling visible in the trace")

**Modify existing: `FlowTracer.tsx`**

3. Add a "What does this flow do?" button that sends the current trace to the summarization endpoint.

**New backend endpoint: `POST /nlp/summarize`**

4. Accepts a subgraph (list of node IDs or the raw nodes/relationships) and returns a natural language summary.

```typescript
interface SummarizeRequest {
  projectId: string;
  nodes: Array<{ id: string; label: string; name: string; category?: string }>;
  relationships: Array<{ type: string; sourceId: string; targetId: string }>;
  context?: string; // e.g., "This is a flow trace starting from handleCheckout"
}

interface SummarizeResponse {
  summary: string;
  keyEntities: string[];
  concerns: string[];
}
```

**Modify existing: `nlp/src/translator.ts`** (or new file `nlp/src/summarizer.ts`)

5. Add a `summarizeSubgraph()` function that:
   - Takes the node/relationship data and formats it as a structured description
   - Sends it to the configured AI provider with a summarization-specific system prompt
   - Returns a structured summary

The system prompt would be:
```
You are a code architecture analyst. Given a subgraph from a codebase dependency graph,
produce a concise summary that explains:
1. What this code flow does in business terms
2. Which layers it crosses (UI -> API -> DB)
3. Any notable patterns (cross-repo calls, high fan-out, etc.)

Respond as JSON: { "summary": "...", "keyEntities": [...], "concerns": [...] }
```

This reuses the same AI provider infrastructure (Anthropic/OpenAI/Ollama) that Text-to-Cypher already uses.

### Files to Touch

| File | Action |
|------|--------|
| `frontend/src/components/SubgraphSummary.tsx` | **New** — floating summary panel |
| `frontend/src/components/SubgraphSummary.css` | **New** — panel styles |
| `frontend/src/components/NLPQueryBar.tsx` | Modify — wire summarize button to real endpoint |
| `frontend/src/pages/FlowTracer.tsx` | Modify — add "What does this flow do?" button |
| `nlp/src/summarizer.ts` | **New** — subgraph summarization logic |
| `api/src/routes/nlp.ts` | Modify — add `POST /nlp/summarize` endpoint |
| `frontend/src/api/client.ts` | Modify — add `summarizeSubgraph()` client function |
| `shared/src/types/nlp.ts` | Modify — add `SummarizeRequest`, `SummarizeResponse` types |

---

## Implementation Order and Dependencies

```
Phase 1 (Omni-Prompt)          Phase 4 (Intelligence Sidebar)
     |                                |
     v                                v
Phase 2 (Smart Trace)     [can run in parallel]
     |
     v
Phase 3 (Neighborhood View)
     |
     v
Phase 5 (Summarization) --- needs subgraphs from Phases 2+3 to be useful
```

Phases 1 and 4 are independent and can be built in parallel.
Phase 2 should come before Phase 3 (trace view is higher value than neighborhood).
Phase 5 depends on Phases 2 and 3 providing the subgraphs worth summarizing.

---

## Summary of New Backend Endpoints

| Endpoint | Phase | Purpose |
|----------|-------|---------|
| `GET /graph/node/:id/entry-to-exit` | 2 | Pruned flow trace from entry to terminal nodes |
| `GET /graph/node/:id/neighborhood` | 3 | Depth-N neighborhood with node cap |
| `GET /graph/insights/:projectId/hotspots` | 4 | Files ranked by inbound import count |
| `GET /graph/insights/:projectId/circular-imports` | 4 | Circular import cycle detection |
| `GET /graph/insights/:projectId/fan-out` | 4 | Functions ranked by outgoing call count |
| `POST /nlp/summarize` | 5 | AI-generated subgraph summary |

## Summary of New Frontend Components

| Component | Phase | Purpose |
|-----------|-------|---------|
| `IntelligenceSidebar.tsx` | 4 | Left sidebar with computed insights |
| `SubgraphSummary.tsx` | 5 | Floating AI summary panel |

All other changes are modifications to existing components.

---

## What We Are NOT Doing (Deferred)

These are mentioned in the issues but deferred beyond Phase 5:

- **GraphRAG / vector embeddings** (#70) — Requires embedding infrastructure (vector DB, embedding pipeline). Deferred until Text-to-Cypher hits its limits on complex queries.
- **Agentic multi-step traversal** (#70) — AI autonomously exploring the graph in multiple steps. Complex orchestration. Deferred until we see query patterns that need it.
- **Blast radius analysis** (#69) — "If I change this function, what breaks?" Requires reverse dependency traversal with transitive closure. Can be added as a Phase 4.5 insight once the neighborhood endpoint exists.
- **Architectural boundary detection** (#69) — Automated detection of layer violations (e.g., UI component directly calling DB). Requires defining boundary rules. Deferred to a configuration-driven Phase 6.
- **Workspace persistence** (#71) — Saving investigation sessions, pinned nodes, annotations. Requires a persistence layer. Deferred.
- **Multi-tab canvas** (#71) — Multiple investigation tabs open simultaneously. Deferred until single-canvas workflows are solid.

---

## Effort Estimates

| Phase | Frontend | Backend | Total | Risk |
|-------|----------|---------|-------|------|
| Phase 1: Omni-Prompt | 2-3 days | 0.5 day | 3 days | Low — UI-only changes plus minor request enrichment |
| Phase 2: Smart Trace | 3-4 days | 1 day | 4 days | Medium — swimlane layout requires Cytoscape tuning |
| Phase 3: Neighborhood | 2-3 days | 1 day | 3 days | Low — straightforward graph query + layout |
| Phase 4: Intelligence | 3-4 days | 1-2 days | 5 days | Medium — circular import detection Cypher can be expensive on large graphs |
| Phase 5: Summarization | 2-3 days | 1 day | 3 days | Low — reuses existing AI provider infrastructure |

**Total estimated: ~18 working days (3.5 weeks) for a single developer.**

Phases 1+4 can be parallelized across two developers, compressing the timeline to ~2.5 weeks.
