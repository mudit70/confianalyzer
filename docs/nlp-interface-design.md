# VeoGraph — NLP Interface Design

This document specifies the design of VeoGraph's natural-language query interface: the query bar UX, interaction flows, autocomplete strategy, result rendering, error handling, and query history.

---

## 1. Query Bar UX

### Placement

The NLP query bar is a fixed element at the top of the Graph Explorer view, spanning the full width of the canvas area. It sits below the main navigation bar and above the graph canvas, ensuring it is always visible and reachable without scrolling.

```
┌──────────────────────────────────────────────────────────────┐
│  VeoGraph   [Projects]  [Graph Explorer]  [Flow Tracer]  ... │  <- Nav bar
├──────────────────────────────────────────────────────────────┤
│  🔍 Ask a question about your codebase...        [▾ History] │  <- NLP bar
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     Graph Canvas                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Sizing and Visual Design

- **Height:** 48px resting state; expands to accommodate autocomplete dropdown (up to 400px).
- **Width:** 100% of the graph panel minus 16px horizontal padding on each side.
- **Input field:** Left-aligned with a search/sparkle icon prefix. Placeholder text: "Ask a question about your codebase..." in muted gray.
- **Right-side controls:** A clock icon button for query history, and a small chevron indicator when autocomplete is available.
- **Border:** 1px solid neutral-300 at rest. On focus, 2px solid primary-500 with a subtle box-shadow glow (0 0 0 3px primary-100).
- **Typography:** 15px, regular weight, neutral-900 for input text. Placeholder in neutral-400.
- **Background:** White (light mode) or neutral-800 (dark mode). Slightly elevated with a 1px bottom shadow to separate it from the canvas.
- **Keyboard shortcut:** Pressing `/` anywhere in the Graph Explorer focuses the query bar. `Escape` blurs it and closes the dropdown.

### Contextual Indicator

When a node is selected on the canvas, a small chip appears inside the query bar to the left of the cursor, showing the selected node's name (e.g., `[POST /api/orders]`). This signals that queries can reference "this endpoint" or "this function" and the system will resolve the reference to the selected node.

---

## 2. Interaction Flow

### Step-by-Step Flow

```
User focuses bar  ->  Autocomplete dropdown opens (examples + recent)
       |
User types query  ->  Autocomplete updates (matching suggestions, entity names)
       |
User submits (Enter or click suggestion)
       |
Loading state     ->  Query bar shows inline spinner + "Analyzing..."
       |                Graph canvas dims slightly (opacity: 0.4)
       |
Results arrive    ->  Canvas transitions to focused subgraph
       |                Result count badge appears on query bar
       |                "Show Cypher" toggle appears below the bar
       |
User explores     ->  Click nodes in result subgraph for details
       |                Modify query or clear to return to previous view
```

### Detailed State Descriptions

**Idle state:** Query bar shows placeholder text. No dropdown visible. Previous graph view is fully interactive.

**Focus state (empty input):** Dropdown appears with two sections:
1. "Recent Queries" — last 5 queries from history (if any exist).
2. "Try asking..." — 6 contextual example queries drawn from the current project's data.

**Typing state:** As the user types, the dropdown updates in real time:
- Top section: Up to 3 query completion suggestions (full natural-language queries that match the partial input).
- Bottom section: Entity matches (function names, endpoint paths, table names) from the graph that match the typed text, prefixed with their type icon.

**Loading state:** The input becomes read-only. An animated spinner replaces the search icon. The text "Analyzing your question..." appears below the input in muted style. The graph canvas dims to 40% opacity. A subtle progress bar animates below the query bar (indeterminate, since LLM translation time varies). Timeout after 30 seconds shows a retry prompt.

**Result state:** The graph canvas transitions (animated, 300ms ease-out) to show only the result subgraph. A result badge appears to the right of the input: e.g., "12 nodes, 18 edges". Below the query bar, a collapsible row appears with: `[Show Cypher]` toggle on the left, `[Clear results]` button on the right. The previous graph state is preserved in memory so clearing results restores it instantly.

**Error state:** See Section 6 below.

### Keyboard Interactions

| Key | Action |
|-----|--------|
| `/` | Focus query bar from anywhere in Graph Explorer |
| `Enter` | Submit query (or select highlighted autocomplete item) |
| `Escape` | Close dropdown; if dropdown already closed, blur the bar and clear input |
| `Up/Down` | Navigate autocomplete suggestions |
| `Tab` | Accept the currently highlighted autocomplete suggestion into the input without submitting |
| `Ctrl+Enter` | Submit query and open results in a new tab/panel (side-by-side with current view) |

---

## 3. Example Query Catalog

Queries are organized by persona and use case. Each entry shows the natural-language input and the expected system behavior.

### Platform Engineer Queries

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 1 | "Which repositories have the most cross-repo connections?" | Returns a bar-chart-style subgraph showing repository nodes sized by their cross-repo edge count. Highlights the top 3. |
| 2 | "Show me all endpoints with zero callers" | Returns all APIEndpoint nodes that have no incoming CALLS_API edges. Rendered as an isolated node list, flagged as potential dead code. |
| 3 | "What languages are used across this project?" | Returns repository nodes grouped by detected language, with edge counts between language groups to show cross-language integration points. |

### Backend Developer Queries

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 4 | "Show me all callers of POST /api/orders" | Returns the APIEndpoint node for POST /api/orders and all Function nodes connected via CALLS_API, grouped by repository. |
| 5 | "What database tables does the user service write to?" | Returns all Function nodes in the user-service repository categorized as DB_CALL with WRITES relationships, plus the target DBTable nodes. |
| 6 | "Which middleware runs before the /api/payments endpoints?" | Returns all HANDLER-category functions that are in the call chain upstream of APIEndpoint nodes matching /api/payments. |
| 7 | "Show me all functions that both call an API and access the database" | Returns Function nodes that have outgoing CALLS_API edges AND outgoing READS or WRITES edges. These represent potential coupling concerns. |

### Frontend Developer Queries

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 8 | "Trace the checkout button click to the database" | Activates Flow Tracer starting from the UI_INTERACTION handler associated with checkout, showing the full path through API_CALLER, API_ENDPOINT, and DB_CALL nodes. |
| 9 | "Which components call the search API?" | Returns all API_CALLER functions that target endpoints matching /search or /query, along with the files and UI_INTERACTION handlers that invoke them. |
| 10 | "What API endpoints does the frontend depend on?" | Returns all CALLS_API relationships originating from functions in frontend repositories, grouped by target endpoint. |

### Tech Lead / Architect Queries

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 11 | "Which API endpoints have the most callers?" | Returns APIEndpoint nodes sorted by incoming CALLS_API count, rendered with node size proportional to caller count. Top 10 by default. |
| 12 | "Show me all functions that skip the API gateway layer" | Returns flows where a frontend function directly calls a backend service endpoint that is not in the gateway repository, indicating an architectural boundary violation. |
| 13 | "What is the blast radius of changing GET /api/users/:id?" | Returns a recursive upstream traversal from the endpoint: all direct callers, their callers, and so on up to 5 hops. Nodes labeled by hop distance. |

### SRE / On-Call Engineer Queries

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 14 | "What services depend on the payments database?" | Returns all Function nodes with READS or WRITES relationships to tables in the payments database, grouped by repository/service. |
| 15 | "Show me everything that breaks if the auth service is down" | Returns all functions across all repositories that have a direct or transitive dependency on APIEndpoint nodes in the auth-service repository. |
| 16 | "Which functions write to the orders table?" | Returns all DB_CALL functions with WRITES edges targeting the orders DBTable node, with their file paths and repositories. |

### New Team Member Queries

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 17 | "How does the login flow work?" | Activates Flow Tracer, finding UI_INTERACTION handlers related to login/auth and tracing their full end-to-end paths. |
| 18 | "What does the notification service do?" | Returns a subgraph centered on the notifications repository: all its API endpoints, the functions they call, and the database tables they touch. |
| 19 | "Show me the most important functions in the project" | Returns the top 15 functions by total connection count (in-degree + out-degree), rendered with size proportional to importance. |
| 20 | "Which services talk to each other?" | Returns a repository-level graph where edges represent cross-repo CALLS_API relationships, with edge thickness proportional to connection count. |

---

## 4. Autocomplete Strategy

### Data Sources

Autocomplete draws from four sources, each contributing a different kind of suggestion:

1. **Query templates** — A curated set of 30+ parameterized query patterns (e.g., "Show me all callers of {endpoint}"). These are stored client-side and matched by keyword overlap with the user's input.

2. **Graph entity index** — Function names, endpoint paths (method + route), table names, and repository names from the current project. Fetched once on project load and cached. Updated after each analysis run.

3. **Query history** — The user's past queries, ranked by recency. Matched by prefix and substring.

4. **Current context** — The currently selected node, active filters, and visible subgraph. Used to boost relevance of suggestions that reference visible or selected entities.

### Ranking Algorithm

Suggestions are scored and ranked by a weighted combination of:

| Signal | Weight | Description |
|--------|--------|-------------|
| Prefix match | 0.35 | The user's input is a prefix of the suggestion |
| Keyword overlap | 0.25 | Proportion of the user's words that appear in the suggestion |
| Context relevance | 0.20 | Suggestion references the selected node, visible repo, or active filter |
| Recency (history) | 0.10 | More recent queries score higher |
| Popularity | 0.10 | Query templates used more often by the user rank higher |

### Suggestion Categories and Display

The autocomplete dropdown is divided into up to three sections, each showing a maximum of 3 items:

```
┌──────────────────────────────────────────────────────┐
│  Suggested Queries                                   │
│    ◆ "Show me all callers of POST /api/orders"       │
│    ◆ "Show me all callers of GET /api/users/:id"     │
│                                                      │
│  Matching Entities                                   │
│    ⬡ POST /api/orders         (API Endpoint)         │
│    ⬡ POST /api/orders/cancel  (API Endpoint)         │
│    ● createOrder              (Function, order-svc)  │
│                                                      │
│  Recent Queries                                      │
│    ↻ "What database tables does order service use?"   │
└──────────────────────────────────────────────────────┘
```

### Context-Aware Behavior

- **No node selected, empty input:** Show recent queries (if any) and generic example queries.
- **No node selected, user typing:** Show query template completions and matching entity names.
- **Node selected, empty input:** Show queries relevant to that node type. For an APIEndpoint: "Show all callers of {this endpoint}", "Trace the flow through {this endpoint}", "What does {this endpoint} depend on?". For a Function: "Who calls {this function}?", "What does {this function} call?".
- **Node selected, user typing:** Boost suggestions that reference the selected node's type or name.
- **Active filters applied:** Boost suggestions scoped to the filtered repositories or categories.

### Persona-Aware Defaults

If VeoGraph supports user profiles or roles, the default example queries shown on empty focus adapt:

| Persona | Default Examples Emphasize |
|---------|---------------------------|
| Platform Engineer | Pipeline status, repo connections, dead endpoints |
| Backend Developer | Endpoint callers, DB dependencies, cross-service flows |
| Frontend Developer | UI-to-backend traces, component API dependencies |
| Tech Lead / Architect | Coupling analysis, blast radius, architecture violations |
| SRE / On-Call Engineer | Dependency lookup, failure impact, service dependencies |
| New Team Member | System overview, "how does X work" patterns, exploration |

---

## 5. Result Rendering

### Subgraph Presentation

When an NLP query returns results, the graph canvas transitions from its current state to a focused subgraph view. The transition works as follows:

1. **Fade out** non-result nodes and edges (300ms, ease-out) to 10% opacity. They remain faintly visible as "ghost" context but are not interactive.
2. **Reposition** result nodes into a purpose-appropriate layout (see below). Animation: 500ms spring physics.
3. **Highlight** result edges with increased thickness (2px -> 4px) and a subtle animated dash pattern for directional relationships.
4. **Fade in** a translucent overlay badge in the top-right corner of the canvas: "{N} nodes, {M} edges found".

### Layout Selection by Query Type

The system infers the best layout for the result based on the query intent:

| Query Intent | Layout | Description |
|-------------|--------|-------------|
| Flow/trace query | Horizontal swimlane | Nodes arranged left-to-right by call depth. Swimlane rows represent repositories. |
| Caller/callee lookup | Radial | Target node at center, callers/callees arranged in concentric rings by hop distance. |
| Entity listing | Grid | Nodes arranged in a grid, grouped by repository or category. |
| Relationship exploration | Force-directed | Standard force layout focused on the result subgraph. |
| Blast radius | Tree (root at center) | Target node at root, affected nodes expanding outward by hop depth. |

### Visual Encoding of Results

- **Node color** follows the standard category palette across all views:
  - UI_INTERACTION: blue-500
  - HANDLER: teal-500
  - API_CALLER: orange-500
  - API_ENDPOINT: purple-500
  - DB_CALL: red-500
  - UTILITY: gray-500
  - Repository (cluster): neutral-200
  - DBTable: amber-500

- **Node size** encodes connection count or query relevance. Primary result nodes are 20% larger than secondary (context) nodes.

- **Edge style:**
  - CALLS: solid line, gray-600
  - CALLS_API (cross-repo): dashed line, purple-400, animated dash
  - READS: solid line, green-500, arrow toward DBTable
  - WRITES: solid line, red-500, arrow toward DBTable

- **Hop distance labels:** For blast radius and trace queries, a small badge on each node shows its hop distance from the origin (e.g., "2 hops").

### Animated Transitions

- **Entry animation:** Result nodes scale from 0 to full size with a staggered delay (30ms per node), creating a "reveal" effect that draws the eye across the result.
- **Path animation:** For flow/trace queries, a glowing dot animates along the edges from source to destination, showing the direction of the call chain. This plays once on result load and can be replayed via a "Replay flow" button.
- **Return animation:** Clicking "Clear results" reverses the transition: result layout dissolves, ghost nodes restore to full opacity, and the previous graph state is restored with a 300ms fade.

### Result Interaction

- Nodes in the result subgraph are fully interactive: click to select, double-click for detail panel, right-click for context menu (trace from here, expand neighbors, copy name).
- Ghost (non-result) nodes are not clickable. Hovering a ghost node shows a tooltip: "Not part of current query results. Clear results to interact."
- The "Show Cypher" panel below the query bar displays the generated Cypher, syntax-highlighted, with a copy button and an "Edit & Re-run" option.

---

## 6. Error Handling

### Ambiguous Queries

**Trigger:** The NLP translator identifies multiple plausible interpretations of the query.

**UX:**
- The query bar border turns yellow-500 (warning color).
- A disambiguation card appears below the query bar:

```
┌──────────────────────────────────────────────────────────┐
│  ⚠ Your query could mean different things:               │
│                                                          │
│  ○ Show all functions named "order" across the project   │
│  ○ Show the API endpoint POST /api/orders                │
│  ○ Show the order service repository overview            │
│                                                          │
│  Click one to refine, or rephrase your question.         │
└──────────────────────────────────────────────────────────┘
```

- Clicking an option executes that specific interpretation.
- The disambiguation options are generated by the LLM translator when it detects ambiguity in the intent mapping.

### No Results

**Trigger:** The generated Cypher query executes successfully but returns zero nodes.

**UX:**
- The graph canvas shows a centered empty state illustration (a magnifying glass with a dotted circle).
- Message: "No results found for '{query text}'."
- Below the message, three actionable suggestions:
  1. "Try a broader query" — link to a rephrased version (LLM-generated).
  2. "Browse example queries" — opens the autocomplete dropdown with examples.
  3. "Check if the project has been analyzed" — links to the project status page if `lastAnalyzedAt` is null or stale.

### Invalid or Uninterpretable Queries

**Trigger:** The NLP translator cannot produce a valid Cypher query from the input (the input is not a question about code structure, or is too vague to translate).

**UX:**
- The query bar border turns red-500 (error color).
- An inline error message appears below the query bar:
  - "I could not understand that question. Try asking about specific endpoints, functions, or flows in your codebase."
- The error message includes 2 clickable example queries related to the user's input keywords.

### Cypher Execution Error

**Trigger:** The generated Cypher is syntactically valid but fails at execution (e.g., references a non-existent label or property).

**UX:**
- Same red-500 border treatment.
- Message: "Something went wrong running this query. This might be a translation error."
- A "Show details" expandable reveals the Cypher query and the Neo4j error message (for advanced users and debugging).
- A "Report issue" button logs the natural-language query, generated Cypher, and error to the backend for improving the NLP translator.
- A "Try rephrasing" suggestion is shown.

### Timeout

**Trigger:** The query takes longer than 30 seconds (LLM translation + Cypher execution combined).

**UX:**
- After 15 seconds, the loading message changes to "This is taking longer than usual..."
- After 30 seconds, loading stops. Message: "This query timed out. It may be too broad."
- Suggestions: "Try narrowing your query to a specific service or endpoint" with example refinements.
- A "Retry" button re-submits the same query.

### Rate Limiting

**Trigger:** The user has submitted too many queries in a short window (protects the LLM API).

**UX:**
- The query bar input is temporarily disabled (grayed out).
- A gentle message appears: "Please wait a moment before your next query." with a countdown timer showing when the bar re-enables.

---

## 7. Query History

### History Panel

Query history is accessible via the clock icon button on the right side of the query bar. Clicking it opens a dropdown panel below the bar, 400px wide, right-aligned.

```
┌──────────────────────────────────────────┐
│  Query History                  [Clear ▾]│
│─────────────────────────────────────────│
│  ★ Show all callers of POST /api/orders  │
│     12 nodes · 2 min ago                 │
│                                          │
│  ★ What DB tables does user svc write to?│
│     8 nodes · 1 hour ago                 │
│                                          │
│    Trace login flow end to end           │
│     23 nodes · yesterday                 │
│                                          │
│    Which endpoints have the most callers?│
│     10 nodes · 3 days ago                │
│                                          │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  [Show all (24 queries)]                 │
└──────────────────────────────────────────┘
```

### History Entry Details

Each history entry stores:

| Field | Description |
|-------|-------------|
| `queryText` | The original natural-language query |
| `timestamp` | When the query was executed |
| `resultCount` | Number of nodes returned |
| `cypherQuery` | The generated Cypher (for "Edit & Re-run") |
| `projectId` | The project context when the query was run |
| `isPinned` | Whether the user has pinned/favorited this query |

### Interactions

- **Click a history entry:** Re-executes the query against the current graph. Results may differ from the original if the graph was re-analyzed since then.
- **Star/pin icon (left of each entry):** Toggles the pinned state. Pinned queries appear at the top of the list, sorted by most recent pin time. Pinned queries are never auto-pruned.
- **Hover an entry:** Shows a "Remove" (X) button on the right side to delete that single entry.
- **Clear dropdown:** Offers "Clear unpinned" and "Clear all" options.
- **"Show all" link:** Expands the panel to full height (max 600px) with scrolling, showing the complete history.

### Storage and Limits

- History is stored in `localStorage` keyed by user identifier (or anonymous session ID if no auth).
- Maximum 100 entries per project. When the limit is reached, the oldest unpinned entry is removed.
- Pinned queries do not count toward the 100-entry limit (separate storage, max 25 pins).
- History entries older than 90 days are auto-pruned (unless pinned).

### Search Within History

When the history panel contains more than 10 entries, a search field appears at the top of the panel. Typing filters history entries by substring match on the query text.

### Sharing Queries

Each history entry has a "Copy link" option in its hover menu. This generates a URL with the query text encoded as a query parameter (e.g., `/graph?project=abc&nlq=Show+all+callers+of+POST+/api/orders`). Opening this URL in a browser focuses the query bar, populates it with the query, and auto-executes it.
