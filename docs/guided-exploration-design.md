# VeoGraph — Guided Exploration Design

This document specifies the guided exploration workflow for the Graph Explorer. It replaces the current "50 file nodes on load" behavior with a summary-driven, category-first approach that leads each persona directly to the information they need.

---

## Design Principles

1. **No blank canvas.** The Graph Explorer always opens with actionable information, never a dump of arbitrary nodes.
2. **Summary first, graph second.** Users see counts and categories before topology. The graph appears when the user has a clear intent.
3. **Every click narrows focus.** Each interaction moves the user from overview toward a specific subgraph they care about.
4. **Context is preserved.** Breadcrumbs, back navigation, and graph history let the user retrace their steps without losing orientation.

---

## 1. Summary Dashboard (Landing View)

When a user opens the Graph Explorer for a project, they see the Summary Dashboard instead of a graph canvas. The canvas is hidden until the user takes an action that warrants showing nodes.

### 1a. Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  VeoGraph     [Projects]  [Graph Explorer]  [Flow Tracer]   [user ▾]│
├──────────────────────────────────────────────────────────────────────┤
│  Projects > Checkout System > Graph Explorer                         │
├──────────────────────────────────────────────────────────────────────┤
│  Ask a question about your codebase...                  [History]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Checkout System — Analysis Summary                                  │
│  Last analyzed: 2 hours ago · 3 repositories · 342 files             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  47           │  │  89           │  │  134          │               │
│  │  API          │  │  API          │  │  Database     │               │
│  │  Endpoints    │  │  Callers      │  │  Calls        │               │
│  │              →│  │              →│  │              →│               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  156          │  │  83           │  │  12           │               │
│  │  UI           │  │  Cross-Repo   │  │  DB           │               │
│  │  Interactions │  │  Connections  │  │  Tables       │               │
│  │              →│  │              →│  │              →│               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ── Category Breakdown ──────────────────────────────────────────── │
│                                                                      │
│  UI_INTERACTION  ████████░░░░░░░░░░░░░░░░  156  (5.4%)              │
│  HANDLER         ██████████░░░░░░░░░░░░░░  201  (7.0%)              │
│  API_CALLER      █████░░░░░░░░░░░░░░░░░░░   89  (3.1%)              │
│  API_ENDPOINT    ███░░░░░░░░░░░░░░░░░░░░░   47  (1.6%)              │
│  DB_CALL         ████████░░░░░░░░░░░░░░░░  134  (4.6%)              │
│  UTILITY         ██████████████████████████ 2264 (78.3%)             │
│                                                                      │
│  ── Quick Actions ───────────────────────────────────────────────── │
│                                                                      │
│  [Browse Files]  [View Repository Graph]  [Find Endpoint]            │
│  [Trace a Flow]  [Show Coupling Hotspots]                            │
│                                                                      │
│  ── Per-Repository Breakdown ────────────────────────────────────── │
│                                                                      │
│  ┌─────────────────┬───────┬──────┬──────┬──────┬──────┬──────────┐ │
│  │ Repository       │ Files │ Funcs│ EP   │ DB   │ UI   │ X-Repo   │ │
│  ├─────────────────┼───────┼──────┼──────┼──────┼──────┼──────────┤ │
│  │ checkout-web     │  128  │  980 │   0  │   0  │ 156  │    34    │ │
│  │ order-service    │  142  │ 1204 │  32  │  98  │   0  │    31    │ │
│  │ payment-svc      │   72  │  707 │  15  │  36  │   0  │    18    │ │
│  └─────────────────┴───────┴──────┴──────┴──────┴──────┴──────────┘ │
│                                                                      │
│  Click any row to explore that repository.                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1b. Summary Card Definitions

| Card | Data Source | Shows | Click Action |
|------|-----------|-------|-------------|
| API Endpoints | Count of `FunctionNode` where `category = API_ENDPOINT` | Count. Subtitle shows top 3 by caller count. | Enters Category View filtered to API_ENDPOINT. Graph shows endpoint nodes with caller counts as badges. |
| API Callers | Count of `FunctionNode` where `category = API_CALLER` | Count. Subtitle shows count of unique target endpoints. | Enters Category View filtered to API_CALLER. Graph shows caller nodes grouped by target endpoint. |
| Database Calls | Count of `FunctionNode` where `category = DB_CALL` | Count. Subtitle shows "N reads, M writes". | Enters Category View filtered to DB_CALL. Graph shows DB functions connected to table nodes. |
| UI Interactions | Count of `FunctionNode` where `category = UI_INTERACTION` | Count. Subtitle shows count by repo. | Enters Category View filtered to UI_INTERACTION. Graph shows event handler nodes. |
| Cross-Repo Connections | Count of `CALLS_API` relationships where source repo differs from target repo | Count. Subtitle shows "across N repo pairs". | Enters a special cross-repo view showing only inter-repository edges with repo nodes as endpoints. |
| DB Tables | Count of `DBTableNode` nodes | Count. Subtitle shows top 3 most-referenced tables. | Enters Category View showing DB table nodes with connected functions. |

### 1c. Backend API Required

**New endpoint: `GET /graph/summary/:projectId`**

```typescript
interface GraphSummaryResponse {
  readonly projectId: string;
  readonly lastAnalyzedAt: string;
  readonly repositories: readonly RepositorySummary[];
  readonly totals: {
    readonly files: number;
    readonly functions: number;
    readonly byCategory: Record<FunctionCategory, number>;
    readonly apiEndpoints: number;
    readonly dbTables: number;
    readonly crossRepoConnections: number;
    readonly crossFileConnections: number;
  };
  readonly topEndpoints: readonly {
    readonly id: string;
    readonly method: HttpMethod;
    readonly path: string;
    readonly callerCount: number;
  }[];
  readonly topTables: readonly {
    readonly id: string;
    readonly name: string;
    readonly readerCount: number;
    readonly writerCount: number;
  }[];
}

interface RepositorySummary {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly fileCount: number;
  readonly functionCount: number;
  readonly byCategory: Record<FunctionCategory, number>;
  readonly crossRepoConnectionCount: number;
}
```

**Cypher query backing this endpoint:**

```cypher
// Total counts by category
MATCH (p:Project {id: $projectId})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
RETURN r.name AS repo, fn.category AS category, count(fn) AS cnt

// Cross-repo connection count
MATCH (p:Project {id: $projectId})<-[:BELONGS_TO]-(r1:Repository)<-[:IN_REPO]-(f1:File)<-[:DEFINED_IN]-(fn1:Function)-[:CALLS_API]->(ep:APIEndpoint)<-[:EXPOSES]-(fn2:Function)-[:DEFINED_IN]->(f2:File)-[:IN_REPO]->(r2:Repository)
WHERE r1 <> r2
RETURN count(*) AS crossRepoCount

// Top endpoints by caller count
MATCH (ep:APIEndpoint)<-[:CALLS_API]-(caller:Function)
WHERE EXISTS { (ep)<-[:EXPOSES]-(:Function)-[:DEFINED_IN]->(:File)-[:IN_REPO]->(:Repository)-[:BELONGS_TO]->(:Project {id: $projectId}) }
RETURN ep.id, ep.method, ep.path, count(caller) AS callerCount
ORDER BY callerCount DESC LIMIT 5
```

### 1d. Persona Relevance

| Card | Platform Eng. | Backend Dev | Frontend Dev | Tech Lead | SRE | New Member |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| API Endpoints | - | High | Med | High | High | High |
| API Callers | - | Med | High | Med | Med | Med |
| Database Calls | - | High | Low | High | High | Med |
| UI Interactions | - | Low | High | Med | Low | High |
| Cross-Repo | Med | Med | Med | High | High | Med |
| DB Tables | - | High | Low | High | High | Med |
| Per-Repo Breakdown | High | Med | Med | High | Med | High |

---

## 2. Category Exploration Flow

When a user clicks a summary card, the dashboard slides left and the graph canvas appears, pre-loaded with the relevant category subgraph. A breadcrumb updates to reflect the drill-down.

### 2a. Category View — General Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  VeoGraph     [Projects]  [Graph Explorer]  [Flow Tracer]   [user ▾]│
├──────────────────────────────────────────────────────────────────────┤
│  Projects > Checkout System > Graph Explorer > API Endpoints         │
├──────────────────────────────────────────────────────────────────────┤
│  Ask a question about your codebase...                  [History]    │
├────────────────────────────────────────────────┬─────────────────────┤
│                                                │  Category: API EP   │
│                                                │  ─────────────────  │
│   47 API Endpoints                             │                     │
│                                                │  Showing: 47 nodes  │
│   ┌─────────────────────────────────┐          │                     │
│   │  order-service cluster          │          │  Sort by:           │
│   │                                 │          │  (●) Caller count   │
│   │  ⬡ POST /api/orders      [12]  │          │  ( ) Alphabetical   │
│   │  ⬡ GET  /api/orders/:id  [ 8]  │          │  ( ) Repository     │
│   │  ⬡ PUT  /api/orders/:id  [ 3]  │          │                     │
│   │  ⬡ DELETE /api/orders/:id[ 1]  │          │  Filter endpoints:  │
│   │  ...                            │          │  [_______________]  │
│   └─────────────────────────────────┘          │                     │
│                                                │  Repository:        │
│   ┌─────────────────────────────────┐          │  [✓] order-service  │
│   │  payment-svc cluster            │          │  [✓] payment-svc    │
│   │                                 │          │                     │
│   │  ⬡ POST /api/payments/charge[5] │          │  HTTP Method:       │
│   │  ⬡ GET  /api/payments/:id  [ 2] │          │  [✓] All            │
│   │  ...                            │          │  [ ] GET             │
│   └─────────────────────────────────┘          │  [ ] POST            │
│                                                │  [ ] PUT             │
│  ── Legend ──                                  │  [ ] DELETE           │
│  ⬡ = endpoint node                            │                     │
│  [N] = caller count badge                     │  [← Back to Summary] │
│  Click node to explore its callers + deps     │                     │
├────────────────────────────────────────────────┴─────────────────────┤
│  Checkout System · API Endpoints: 47             [Zoom: 100%]        │
└──────────────────────────────────────────────────────────────────────┘
```

### 2b. Category-Specific Exploration Flows

#### API Endpoints Card → Click Endpoint Node

```
Step 1: User clicks "API Endpoints" card on dashboard
        → Graph shows all endpoint nodes, clustered by repository
        → Each node has a badge showing caller count
        → Nodes sized proportionally to caller count

Step 2: User clicks "POST /api/orders" node
        → Graph transitions to endpoint-centric view:

┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  UPSTREAM (callers)          ENDPOINT          DOWNSTREAM      │
│                                                                │
│  ┌────────────────┐                                            │
│  │OrderEditForm   │╲                                           │
│  │.handleSubmit   │ ╲     ┌──────────────┐                     │
│  │ UI_INTERACTION │  ────▸│              │    ┌──────────────┐ │
│  └────────────────┘       │  POST        │───▸│ validateCart  │ │
│                      ────▸│  /api/orders │    │ HANDLER      │ │
│  ┌────────────────┐╱      │              │    └──────────────┘ │
│  │CartPage        │       │  order-svc   │                     │
│  │.checkout       │       │              │    ┌──────────────┐ │
│  │ UI_INTERACTION │       └──────┬───────┘───▸│ insertOrder  │ │
│  └────────────────┘              │            │ DB_CALL      │ │
│                                  │            └──────┬───────┘ │
│  ┌────────────────┐              │                   │         │
│  │MobileBFF       │              │            ┌──────┴───────┐ │
│  │.createOrder    │─────────────▸│            │ orders       │ │
│  │ API_CALLER     │              │            │ [DB TABLE]   │ │
│  └────────────────┘              │            └──────────────┘ │
│                                  │                             │
│  ┌────────────────┐              │            ┌──────────────┐ │
│  │BatchReconciler │              ├───────────▸│ chargeCard   │ │
│  │.replayOrder    │─────────────▸│            │ API_CALLER   │ │
│  │ HANDLER        │                           └──────┬───────┘ │
│  └────────────────┘                           ┌──────┴───────┐ │
│                                               │POST /payments│ │
│                                               │ payment-svc  │ │
│                                               └──────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘

Breadcrumb: ... > API Endpoints > POST /api/orders
```

**Backend query for endpoint detail:**
- `GET /graph/endpoint/:id/callers` (existing) — provides upstream callers
- `GET /graph/node/:id/flow?direction=downstream&maxDepth=3` (existing) — provides downstream chain

#### Database Calls Card → Click DB Function Node

```
Step 1: User clicks "Database Calls" card
        → Graph shows DB_CALL function nodes connected to DBTable nodes
        → Tables shown as rectangular amber nodes
        → Functions clustered by table they reference

Step 2: User clicks "insertOrder" node (DB_CALL)
        → Graph transitions to upstream trace:

┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  Who triggers this database write?                             │
│                                                                │
│  ┌────────────┐    ┌────────────┐    ┌──────────────┐         │
│  │handleSubmit│───▸│createOrder │───▸│ POST         │         │
│  │UI_INTERACT │    │API_CALLER  │    │ /api/orders  │         │
│  │checkout-web│    │checkout-web│    │ order-svc    │         │
│  └────────────┘    └────────────┘    └──────┬───────┘         │
│                                             │                  │
│                                             ▼                  │
│                                      ┌──────────────┐         │
│                                      │ insertOrder  │───▸ [orders]
│                                      │ DB_CALL      │    WRITES│
│                                      │ order-svc    │         │
│                                      └──────────────┘         │
│                                             ▲                  │
│  ┌────────────┐                             │                  │
│  │BatchRecon  │─────────────────────────────┘                  │
│  │.replay     │  (via POST /api/orders)                        │
│  │scheduler   │                                                │
│  └────────────┘                                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘

Breadcrumb: ... > Database Calls > insertOrder
```

**Backend query:** `GET /graph/node/:id/flow?direction=upstream&maxDepth=5`

#### UI Interactions Card → Click Handler Node

```
Step 1: User clicks "UI Interactions" card
        → Graph shows UI_INTERACTION nodes grouped by repository and file
        → Each node shows the event type (onClick, onSubmit, etc.) if detectable

Step 2: User clicks "handleSubmit" node
        → Graph transitions to full end-to-end forward trace:

  handleSubmit → createOrder → POST /api/orders → handleCreate
       (UI)        (API_CALLER)    (cross-repo)     (API_ENDPOINT)
                                                        │
                                              ┌─────────┼──────────┐
                                              ▼         ▼          ▼
                                        validateCart  insertOrder  chargeCard
                                        (HANDLER)    (DB_CALL)    (API_CALLER)
                                                        │            │
                                                   [orders]    POST /payments
                                                   WRITES      (cross-repo)

Breadcrumb: ... > UI Interactions > handleSubmit
```

**Backend query:** `GET /graph/node/:id/flow?direction=downstream&maxDepth=10`

#### Cross-Repo Connections Card

```
Step 1: User clicks "Cross-Repo Connections" card
        → Graph shows only inter-repository edges
        → Repository nodes as large circles, connection bundles as thick edges
        → Edge thickness proportional to connection count
        → Edge label shows count

┌────────────────────────────────────────────┐
│                                            │
│    ┌──────────┐         ┌──────────┐       │
│    │checkout- │══34═══▸ │ order-   │       │
│    │  web     │         │ service  │       │
│    │          │╲        └─────┬────┘       │
│    └──────────┘ ╲             │             │
│                  ╲18    ══31══╡             │
│                   ╲           ▼             │
│                    ╲   ┌──────────┐        │
│                     ╲▸ │ payment- │        │
│                        │   svc    │        │
│                        └──────────┘        │
│                                            │
│  Click an edge to see the specific         │
│  function-to-endpoint connections.         │
└────────────────────────────────────────────┘

Step 2: User clicks the edge between checkout-web and order-service
        → Graph expands to show the 34 individual connections:
        → Left column: API_CALLER functions in checkout-web
        → Right column: API_ENDPOINT functions in order-service
        → Lines connecting each caller to its target endpoint
```

**Backend query:**

```cypher
// Cross-repo connection summary
MATCH (p:Project {id: $projectId})<-[:BELONGS_TO]-(r1:Repository)
      <-[:IN_REPO]-(f1:File)<-[:DEFINED_IN]-(fn1:Function)
      -[:CALLS_API]->(ep:APIEndpoint)<-[:EXPOSES]-(fn2:Function)
      -[:DEFINED_IN]->(f2:File)-[:IN_REPO]->(r2:Repository)
WHERE r1 <> r2
RETURN r1.name AS sourceRepo, r2.name AS targetRepo, count(*) AS connectionCount

// Specific connections between two repos
MATCH (r1:Repository {name: $repo1})<-[:IN_REPO]-(f1:File)
      <-[:DEFINED_IN]-(fn1:Function)-[call:CALLS_API]->(ep:APIEndpoint)
      <-[:EXPOSES]-(fn2:Function)-[:DEFINED_IN]->(f2:File)
      -[:IN_REPO]->(r2:Repository {name: $repo2})
RETURN fn1, call, ep, fn2
```

---

## 3. File Selector

The File Selector is a slide-out panel accessible from the "Browse Files" quick action on the dashboard or via a toggle button on the graph canvas toolbar. It provides directory-based navigation as an alternative to category-based exploration.

### 3a. Layout

```
┌────────────────────────┬───────────────────────────────────────────────┐
│  File Browser          │                                               │
│  ─────────────────     │                                               │
│  [Search files...]     │         (graph canvas)                        │
│                        │                                               │
│  ┌──────────────────┐  │         Shows functions from selected         │
│  │ checkout-web/     │  │         files as nodes on the canvas.        │
│  │ ├─ src/           │  │                                               │
│  │ │  ├─ components/ │  │                                               │
│  │ │  │  ├─ ☑ Cart   │  │                                               │
│  │ │  │  │  .tsx     │  │    ┌──────────┐      ┌──────────┐            │
│  │ │  │  │  5fn  UI  │  │    │handleSub │─────▸│createOrd │            │
│  │ │  │  ├─ □ Order  │  │    │UI_INTER  │      │API_CALLER│            │
│  │ │  │  │  .tsx     │  │    └──────────┘      └──────────┘            │
│  │ │  │  │  3fn  UI  │  │                                               │
│  │ │  │  └─ □ Quick  │  │    ┌──────────┐      ┌──────────┐            │
│  │ │  │     Buy.tsx  │  │    │addToCart  │─────▸│updateCart│            │
│  │ │  │     2fn  UI  │  │    │UI_INTER  │      │API_CALLER│            │
│  │ │  ├─ api/        │  │    └──────────┘      └──────────┘            │
│  │ │  │  ├─ □ orders │  │                                               │
│  │ │  │  │  .ts      │  │    ┌──────────┐                              │
│  │ │  │  │  4fn CALL │  │    │formatPr  │                              │
│  │ │  │  └─ □ users  │  │    │UTILITY   │                              │
│  │ │  │     .ts      │  │    └──────────┘                              │
│  │ │  │     3fn CALL │  │                                               │
│  │ │  └─ utils/      │  │                                               │
│  │ │     └─ ...      │  │                                               │
│  │ ├─ order-service/ │  │                                               │
│  │ │  └─ ...         │  │                                               │
│  │ └─ payment-svc/   │  │                                               │
│  │    └─ ...         │  │                                               │
│  └──────────────────┘  │                                               │
│                        │                                               │
│  Selected: 1 file      │                                               │
│  [Show in Graph]       │                                               │
│  [Show with Imports]   │                                               │
│                        │                                               │
│  ── File Detail ───    │                                               │
│  Cart.tsx              │                                               │
│  checkout-web/src/     │                                               │
│    components/Cart.tsx │                                               │
│  5 functions:          │                                               │
│   • handleSubmit  UI   │                                               │
│   • addToCart     UI   │                                               │
│   • removeItem   UI   │                                               │
│   • formatPrice  UTIL │                                               │
│   • CartProvider  UTIL│                                               │
│                        │                                               │
└────────────────────────┴───────────────────────────────────────────────┘
```

### 3b. File Tree Behavior

| Feature | Behavior |
|---------|----------|
| **Directory tree** | Collapsible. First level is repository name. Sorted alphabetically within each level. |
| **File metadata** | Each file shows: abbreviated name, function count (`Nfn`), dominant category as a colored icon/label (the category with the most functions in that file). |
| **Checkbox selection** | Multi-select via checkboxes. Checking a directory checks all files within it. |
| **Search** | Filters the tree to show only files/directories matching the search term. Matches on file path, not function names. |
| **[Show in Graph]** | Renders all functions from selected files as nodes on the canvas, with edges for intra-selection calls. |
| **[Show with Imports]** | Same as above, plus adds nodes for files imported by the selected files and edges for those import relationships. |
| **File Detail** | Clicking a file name (not the checkbox) shows metadata in a detail section at the bottom of the panel. Lists all functions in the file with their categories. Clicking a function name focuses the graph on that function's neighborhood. |

### 3c. Backend API Required

The existing endpoints are sufficient:

- `GET /graph/overview/:projectId` — returns the file list with function counts (already exists as `GetGraphOverviewResponse`)
- `GET /graph/file/:fileId/functions` — returns functions in a file (already exists as `GetFileFunctionsResponse`)

**New endpoint needed for file tree structure:**

```typescript
/** GET /graph/files/:projectId/tree — hierarchical file listing */
interface FileTreeResponse {
  readonly repositories: readonly {
    readonly id: string;
    readonly name: string;
    readonly language: string;
    readonly tree: FileTreeNode;
  }[];
}

interface FileTreeNode {
  readonly name: string;
  readonly type: "directory" | "file";
  readonly fileId?: string;           // present only for type === "file"
  readonly functionCount?: number;    // present only for type === "file"
  readonly dominantCategory?: FunctionCategory; // present only for type === "file"
  readonly children?: readonly FileTreeNode[];  // present only for type === "directory"
}
```

---

## 4. Contextual Actions

Every node on the graph canvas has a set of context-sensitive actions available via (a) a right-click context menu and (b) buttons in the detail panel when the node is selected.

### 4a. Actions by Node Type

#### Function Node

| Action | Where | Behavior |
|--------|-------|----------|
| **Show Callers** | Detail panel, context menu | Adds caller nodes to the graph, connected by CALLS edges. |
| **Show Callees** | Detail panel, context menu | Adds callee nodes to the graph, connected by CALLS edges. |
| **Expand Neighborhood** | Detail panel, context menu | Adds both callers and callees (1 hop). |
| **Trace Flow (Forward)** | Detail panel `[Trace Flow →]` | Navigates to Flow Tracer with this function as starting point, direction=downstream. |
| **Trace Flow (Reverse)** | Detail panel `[Trace Upstream ←]` | Navigates to Flow Tracer with this function as starting point, direction=upstream. |
| **Show File Context** | Detail panel `[Open File]` | Opens the File Selector with this function's file selected, scrolled to the function in the detail pane. |
| **Show Source** | Detail panel | Displays syntax-highlighted source code snippet inline in the panel. |
| **Pin Node** | Context menu | Locks the node's position on the canvas so layout changes do not move it. |
| **Hide Node** | Context menu | Removes the node from the canvas (does not delete from DB). Adds to a "hidden nodes" list shown in toolbar. |

**Additional actions for specific function categories:**

| Category | Extra Actions |
|----------|--------------|
| `API_ENDPOINT` | **Show All Callers** — opens Endpoint Impact View. **Show Downstream** — shows handler chain + DB calls. |
| `API_CALLER` | **Show Target Endpoint** — adds the target API endpoint node to the graph. |
| `DB_CALL` | **Show Tables** — adds connected DBTable nodes. **Show All Writers/Readers** — shows all other functions that touch the same tables. |
| `UI_INTERACTION` | **Trace to Database** — shortcut that runs forward flow trace all the way to DB_CALL nodes. |

#### File Node

| Action | Where | Behavior |
|--------|-------|----------|
| **Show All Functions** | Detail panel, context menu | Expands the file node to show all contained function nodes. |
| **Show Imports** | Detail panel, context menu | Adds nodes for all files this file imports, with IMPORTS edges. |
| **Show Dependents** | Detail panel, context menu | Adds nodes for all files that import this file. |
| **Open in File Browser** | Detail panel | Opens the File Selector, scrolled to this file. |

#### API Endpoint Node (standalone, e.g., from category view)

| Action | Where | Behavior |
|--------|-------|----------|
| **Show All Callers** | Detail panel | Fetches all CALLS_API relationships targeting this endpoint. |
| **Show Handler** | Detail panel | Shows the function that EXPOSES this endpoint. |
| **Open Impact View** | Detail panel `[Impact View →]` | Navigates to Endpoint Impact View for this endpoint. |

#### DB Table Node

| Action | Where | Behavior |
|--------|-------|----------|
| **Show Readers** | Detail panel | Adds all functions with READS relationship to this table. |
| **Show Writers** | Detail panel | Adds all functions with WRITES relationship to this table. |
| **Show All Accessors** | Detail panel | Adds both readers and writers. |

#### Multi-Node Selection Actions

When the user selects multiple nodes (shift-click or drag-select):

| Action | Behavior |
|--------|----------|
| **Trace Path Between** | Finds and highlights the shortest path(s) between two selected nodes. Uses bidirectional BFS in Neo4j. |
| **Show Shared Dependencies** | For 2+ selected nodes, finds nodes that all selected nodes depend on (intersection of downstream neighbors). |
| **Show Common Callers** | For 2+ selected nodes, finds nodes that call all selected nodes. |
| **Group Selected** | Visually groups selected nodes into a collapsible cluster on the canvas (client-side only, not persisted). |
| **Hide Selected** | Removes all selected nodes from the canvas. |

### 4b. Detail Panel Layout

```
┌─────────────────────┐
│  handleSubmit        │
│  ───────────────     │
│  Category:           │
│  ● UI_INTERACTION    │
│                      │
│  File:               │
│  checkout-web/src/   │
│   components/Cart.tsx│
│  Lines: 45-72        │
│                      │
│  Signature:          │
│  handleSubmit(       │
│    event: FormEvent  │
│  ): Promise<void>    │
│                      │
│  ── Connections ──   │
│                      │
│  Callers (2):        │
│  → CartContainer     │
│  → CheckoutPage      │
│                      │
│  Callees (3):        │
│  → validateForm      │
│  → createOrder       │
│  → showToast         │
│                      │
│  ── Source ────────  │
│  ▸ Show source code  │
│                      │
│  ── Actions ───────  │
│  [Trace Flow →]      │
│  [Trace Upstream ←]  │
│  [Expand Neighbors]  │
│  [Open File]         │
│                      │
└─────────────────────┘
```

---

## 5. Navigation Model

### 5a. View Hierarchy

```
Dashboard (landing)
    │
    ├── Category View (API Endpoints / DB Calls / UI Interactions / ...)
    │       │
    │       └── Node Detail View (single node + connections on canvas)
    │               │
    │               ├── Flow Tracer (via action button)
    │               └── Endpoint Impact View (via action button)
    │
    ├── File Browser + Graph Canvas
    │       │
    │       └── Node Detail View (same as above)
    │
    ├── Cross-Repo View
    │       │
    │       └── Repo-Pair Detail (specific connections between two repos)
    │
    └── Repository Graph (existing repo-level overview from wireframe 2a)
```

### 5b. Breadcrumb Trail

The breadcrumb always reflects the navigation path:

```
Projects > Checkout System > Graph Explorer                     (dashboard)
Projects > Checkout System > Graph Explorer > API Endpoints     (category view)
Projects > Checkout System > Graph Explorer > API Endpoints > POST /api/orders
Projects > Checkout System > Graph Explorer > Files > Cart.tsx
Projects > Checkout System > Graph Explorer > Cross-Repo Connections
Projects > Checkout System > Graph Explorer > Cross-Repo > checkout-web ↔ order-service
```

Each segment is clickable. Clicking "Graph Explorer" always returns to the dashboard.

### 5c. Graph Update Semantics

When the user navigates deeper, the graph canvas must update. There are two modes, controlled by a toggle in the toolbar:

| Mode | Behavior | When to Use |
|------|----------|-------------|
| **Replace** (default) | Clears the canvas and shows only the new subgraph. Previous state is saved to a stack. | Focused investigation. User wants to drill into one thing at a time. |
| **Accumulate** | Adds new nodes/edges to the existing canvas without removing anything. New nodes are highlighted with a glow for 2 seconds. | Exploratory browsing. User is building up a picture by selecting multiple things. |

The mode toggle is in the graph toolbar:

```
[Replace ●] [Accumulate ○]   |   [Undo Last] [Clear Canvas] [Back to Dashboard]
```

**[Undo Last]** pops the most recent addition from the stack, restoring the previous graph state. Works in both modes.

### 5d. Back Button Behavior

| Action | Browser Back Does |
|--------|-------------------|
| Dashboard → Category View | Returns to Dashboard |
| Category View → Node Detail | Returns to Category View (all category nodes visible) |
| Node Detail → Flow Tracer | Returns to Node Detail view |
| File Browser open | Closes File Browser panel |
| Accumulate mode, added nodes | Removes the last batch of added nodes (same as [Undo Last]) |

### 5e. URL Structure (Extensions to Existing)

| View | URL Pattern |
|------|-------------|
| Dashboard | `/projects/:projectId/graph` |
| Category View | `/projects/:projectId/graph?category=API_ENDPOINT` |
| Category + Node | `/projects/:projectId/graph?category=API_ENDPOINT&node=:nodeId` |
| File Browser | `/projects/:projectId/graph?panel=files` |
| File Browser + File | `/projects/:projectId/graph?panel=files&file=:fileId` |
| Cross-Repo View | `/projects/:projectId/graph?view=cross-repo` |
| Cross-Repo Pair | `/projects/:projectId/graph?view=cross-repo&repos=:repo1,:repo2` |

---

## 6. Information Hierarchy

### 6a. Dashboard Level — "What does this system look like?"

**Primary information:**
- Total counts by category (the six summary cards)
- Category distribution (bar chart)
- Per-repository breakdown table

**Secondary information:**
- Top endpoints by caller count (shown as subtitles on the API Endpoints card)
- Top tables by access count (shown as subtitles on the DB Tables card)
- Last analyzed timestamp

**Visual priority:**
1. Summary cards (largest, top of page, clickable)
2. Category bar chart (scannable at a glance)
3. Quick actions (prominent buttons for common tasks)
4. Per-repo table (detailed, scrollable, lower on page)

**Persona mapping:**
- New Team Member starts here, clicks cards to learn what the system contains.
- Tech Lead looks at per-repo breakdown and cross-repo count to gauge coupling.
- SRE uses this as a quick orientation before diving into a specific endpoint.

### 6b. Category Level — "What are the N things of this type?"

**Primary information:**
- All nodes of the selected category, clustered by repository
- Count badge on each node (callers for endpoints, accessors for tables, etc.)
- Repository labels for grouping

**Secondary information:**
- Filter/sort controls in sidebar
- Connecting edges between nodes of this category (if any)

**Visual priority:**
1. Nodes on canvas, sized by importance metric (caller count, connection count)
2. Repository clusters (spatial grouping)
3. Count badges (immediate quantitative context)
4. Filter sidebar (available but not dominant)

**Persona mapping:**
- Backend Developer filters to their repository, looks at their endpoints.
- Frontend Developer looks at UI_INTERACTION nodes to find the flow they want to trace.
- SRE scans API_ENDPOINT nodes for the one matching their alert.

### 6c. Detail Level — "What connects to this specific thing?"

**Primary information:**
- The selected node, centered on canvas
- Immediate upstream connections (callers, left side)
- Immediate downstream connections (callees, right side)
- Node metadata in detail panel (name, category, file, signature)

**Secondary information:**
- Source code snippet (expandable in detail panel)
- Deeper connections (available via "Expand" or "Trace Flow" actions)
- Cross-repo indicators on edges

**Visual priority:**
1. Selected node (centered, highlighted, largest)
2. Direct connections (arranged symmetrically around the selected node)
3. Detail panel (right sidebar, shows metadata + actions)
4. Action buttons (in detail panel, below metadata)

**Persona mapping:**
- Backend Developer reads the caller list to assess blast radius before changing an endpoint.
- Frontend Developer clicks "Trace Flow" to follow the chain from their UI handler to the database.
- SRE clicks "Show Downstream" on a failing endpoint to identify which dependency is down.
- New Team Member reads the source snippet and connection list to understand what a function does.

---

## 7. Transition Animations

Smooth transitions between views help the user maintain spatial context.

| Transition | Animation |
|-----------|-----------|
| Dashboard → Category View | Dashboard cards fade and slide left. Canvas slides in from right. Nodes appear with staggered fade-in (50ms per node). |
| Category View → Node Detail | Non-selected nodes fade to 15% opacity. Selected node moves to center. Neighbor nodes slide in from off-screen. |
| Node Detail → Back to Category | Reverse of above. Neighbor nodes slide out. All category nodes fade back to 100%. |
| Category View → Back to Dashboard | Canvas slides right and fades. Dashboard slides in from left. |
| Graph canvas: Add nodes (Accumulate mode) | New nodes appear at their layout position with a scale-up animation (0 to 100% over 300ms) and a brief glow highlight (2s fade). |
| Graph canvas: Remove nodes (Undo) | Removed nodes shrink and fade out (200ms). Remaining nodes reflow to fill space. |

---

## 8. Implementation Sequence

The following order is recommended to deliver incremental value:

### Phase 1 — Summary Dashboard
1. Implement `GET /graph/summary/:projectId` backend endpoint.
2. Build the dashboard component with six summary cards.
3. Add the category bar chart.
4. Add per-repository breakdown table.
5. Wire card clicks to set `?category=` URL param (graph canvas can show a "coming soon" placeholder initially).

### Phase 2 — Category View
1. Implement category-filtered graph query (extend existing `GraphFilterParams` + `GraphSearchResponse`).
2. Build the category view canvas — render nodes clustered by repository with count badges.
3. Implement click-to-detail: clicking a node fetches neighbors and renders the upstream/downstream layout.
4. Add breadcrumbs and back navigation.

### Phase 3 — File Selector
1. Implement `GET /graph/files/:projectId/tree` backend endpoint.
2. Build the collapsible file tree panel.
3. Implement multi-select and "Show in Graph" action.
4. Add file detail section with function listing.

### Phase 4 — Contextual Actions and Polish
1. Implement right-click context menus for each node type.
2. Add multi-select actions (trace path between, shared dependencies).
3. Implement Replace/Accumulate mode toggle and undo stack.
4. Add transition animations.
5. Implement node pinning and hiding.

### Phase 5 — Cross-Repo View
1. Implement the cross-repo summary query.
2. Build the repo-pair edge-click detail view.
3. Wire it into the dashboard card.
