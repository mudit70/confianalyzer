# ConfiAnalyzer User Guide

This guide walks you through using ConfiAnalyzer to analyze and explore multi-language, multi-repository codebases.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Creating a Project](#2-creating-a-project)
3. [Dashboard](#3-dashboard)
4. [Graph Explorer](#4-graph-explorer)
5. [Flow Tracer](#5-flow-tracer)
6. [Blast Radius](#6-blast-radius)
7. [Repo Graph](#7-repo-graph)
8. [DB Impact](#8-db-impact)
9. [Endpoints](#9-endpoints)
10. [Files](#10-files)
11. [NLP Query Bar](#11-nlp-query-bar)

---

## 1. Getting Started

### Prerequisites

- Docker (for Neo4j)
- Node.js 18+

### Start the Stack

```bash
# 1. Start Neo4j
docker compose -f docker-compose.dev.yml up -d

# 2. Build all packages
npm install && npm run build

# 3. Start the API server
cd packages/api
NEO4J_URI=bolt://localhost:7688 NEO4J_USER=neo4j NEO4J_PASSWORD=confianalyzer PORT=3006 node dist/index.js

# 4. Start the frontend (in a separate terminal)
cd packages/frontend
npm run dev
```

Open your browser to **http://localhost:5176**.

---

## 2. Creating a Project

When you first open ConfiAnalyzer, you'll see a welcome screen with a **Create New Project** button.

### Step 1: Name Your Project

1. Click **Create New Project** (or navigate to the sidebar link)
2. Enter a project name (e.g., `my-checkout-system`)
3. Click **Create Project**

### Step 2: Add Repositories

After creating the project, you'll see the repository management screen:

1. Enter a **Repository name** (e.g., `frontend`)
2. Enter the **Local path** to the repository on disk (e.g., `/Users/me/code/frontend`)
3. Click **Add**
4. Repeat for each repository in your project
5. Each added repository appears in a list showing its name, detected language, and path
6. Click the **Remove** button next to any repository to remove it

### Step 3: Run Analysis

1. Once you've added all repositories, click **Analyze N Repositories**
2. The analysis screen shows real-time progress:
   - A spinning indicator for the repository currently being analyzed
   - A checkmark for completed repositories
   - The number of files found in each repository
3. Analysis typically takes a few seconds per repository

### Step 4: Explore Results

When analysis completes, you'll see a summary showing:
- Total functions, files, and endpoints discovered
- Number of cross-repo links found

Click **Explore Dashboard** to begin exploring your codebase.

---

## 3. Dashboard

The Dashboard is the home page. It shows a high-level overview of your project.

### What You'll See

- **Project cards** — click any project to select it
- **Summary statistics** — total repositories, files, functions, endpoints, and DB tables
- **Function category distribution** — a horizontal bar chart showing how functions are categorized:
  - **UI_INTERACTION** — React components and UI event handlers
  - **HANDLER** — functions called by API endpoints
  - **API_CALLER** — HTTP client calls to external services
  - **API_ENDPOINT** — route handlers (Express, FastAPI, etc.)
  - **DB_CALL** — database read/write operations
  - **UTILITY** — everything else
- **Repository breakdown** — each repository with its language, file count, and function count

---

## 4. Graph Explorer

The Graph Explorer is the primary tool for visually exploring code relationships. Navigate to it via **Graph Explorer** in the sidebar.

### Getting Started

When you first open the Graph Explorer, you'll see a **guided landing page** with:

- A heading: "Explore your codebase as a graph"
- **Suggested starting points** — cards showing hotspot files and high fan-out functions from your project. Click any card to immediately load it into the graph.
- The **Intelligence Sidebar** is open on the left showing code metrics (hotspots, fan-out, cycles, dead code)

This gives you multiple ways to start exploring without needing to know function names in advance.

### Searching for Functions

1. Type a function name in the **search bar** at the top
2. Press **Enter** or click **Search**
3. A dropdown appears showing matching results with name, category badge, file path, and result count
4. Click a result to load it into the graph
5. The search dropdown stays accessible — click the search input again to see previous results, or type a new query to search again

### Reading the Graph

- **Nodes** represent functions, files, endpoints, or DB tables
- **Edges** show call relationships — arrows point from **caller to callee**
- Nodes are color-coded by category (see legend at bottom)
- Clicking a node selects it and loads its direct neighbors
- A **breadcrumb trail** above the graph tracks your exploration path — click any previous node to go back

### Neighborhood Mode

To see the broader context around a function or file:

1. Select a node by clicking it
2. Click **Show Neighborhood**
3. The graph switches to a concentric rings layout:
   - The selected node appears at the center with a golden glow
   - "Direct" connections form the inner ring
   - "2 hops" and "3 hops" connections form outer rings (labeled)
   - A yellow **Neighborhood View** banner shows the current center node and explains the ring meanings
4. Use the **Depth** buttons (1, 2, 3) that appear in neighborhood mode to control how many hops to include
5. **Click any node** — including dimmed ones — to re-center the neighborhood on that node. This lets you navigate through the graph without exiting.
6. Click **Exit Neighborhood** to return to the normal layout

**File neighborhoods**: Clicking a File node loads its import neighborhood, showing which files import it and which files it imports.

### Navigation

- **Breadcrumbs** — a trail of nodes you've visited appears above the graph. Click any previous node to jump back.
- **Clear** — click the Clear button to reset the graph and return to the guided landing page.
- **Back** — use breadcrumbs to retrace your steps at any time.

### Function Details

When you click a function node, the **Function Card** appears showing:
- Function name and category
- Code signature
- File path and line numbers
- Repository name
- HTTP endpoint info (if applicable)
- **View Source** button — opens a slide-in panel showing the actual source code with syntax highlighting and line numbers

### Intelligence Sidebar

The Intelligence Sidebar opens by default on the left with five tabs:

- **Hotspots** — files with the most inbound imports (high fan-in)
- **Fan-Out** — functions that call the most other functions
- **Cycles** — detected circular dependencies between functions
- **Unused** — functions with zero callers (potential dead code). Excludes API endpoints and UI entry points. Note: dynamic dispatch may hide callers.
- **Stats** — total function, file, endpoint, and DB table counts

Click any item in the sidebar to load it into the graph. The sidebar collapses automatically when a graph loads to give more canvas space — click **Insights** to reopen it.

---

## 5. Flow Tracer

The Flow Tracer lets you trace call chains through your codebase. Navigate to it via **Flow Tracer** in the sidebar.

### Selecting a Starting Function

1. **Category filter** (optional): Use the dropdown at the top to filter by category:
   - Any Function (default)
   - UI Interaction
   - API Endpoint
   - Handler
   - API Caller
2. **Search**: Type a function name in the search box and select from results

### Choosing a Direction

After selecting a function, three direction options appear:

- **Trace callees** — "What does this function call?" (downstream)
- **Trace callers** — "Who calls this function?" (upstream)
- **Entry to Exit** — traces the complete flow from entry points (UI/API) through to exit points (DB/external API)

Click **Trace** to execute.

### Reading the Results

Results can be displayed in two layouts (toggle between them):

- **Flow layout** — horizontal chain showing the sequence of calls, color-coded by category
- **Swimlane layout** — functions arranged by file/repo on the Y-axis and depth on the X-axis, showing cross-file calls clearly

### Controls

- **Show spine only** — hides UTILITY nodes to focus on the important parts of the flow
- **Summarize** — click "What does this flow do?" to get an AI-generated summary of the traced flow, including key entities and concerns

---

## 6. Blast Radius

The Blast Radius page answers: **"If I change this function, what breaks?"** Navigate to it via **Blast Radius** in the sidebar.

### How to Use

1. Type a function name in the search box and click **Search**
2. Click a function from the search results
3. ConfiAnalyzer traces all transitive callers of that function

### Reading the Results

- **Summary card** shows four metrics:
  - Direct callers (depth 1)
  - Transitive callers (all depths)
  - Repositories affected
  - Maximum call chain depth
- **Callers grouped by depth** — each depth level shows the functions that call your target at that distance
  - Each caller shows name, category badge, file path, and repository
  - **Cross-repo callers** are highlighted with an orange border and a "cross-repo" badge

Click **Change** to analyze a different function.

---

## 7. Repo Graph

The Repo Graph shows how repositories in your project connect to each other. Navigate to it via **Repo Graph** in the sidebar.

### What You'll See

- Each repository is shown as a **circle node** colored by language:
  - TypeScript/JavaScript: blue
  - Python: green
  - Go: cyan
  - Java: orange
  - Rust: red
- **Edges** between repositories represent cross-repo API calls, with thickness proportional to the number of connections
- Edge labels show the connection count

### Interactions

- Click a repository node to see its details: name, language, file count, function count, and connected repositories
- The layout arranges nodes in a circle for clarity

---

## 8. DB Impact

The DB Impact page answers: **"If this database table changes, what's affected?"** Navigate to it via **DB Impact** in the sidebar.

### Step 1: Select a Table

The page shows all database tables discovered during analysis, each displaying:
- Table name
- Number of reader functions
- Number of writer functions

Click a table to analyze its impact.

### Step 2: View Impact

The impact analysis shows:

- **Summary card** — direct accessors, transitive callers, endpoints affected, and repositories involved
- **Direct Accessors** — functions that read from or write to the table, with operation badges (READS/WRITES)
- **Transitive Callers** — functions that call the direct accessors, grouped by depth
  - API endpoints are highlighted in orange (these represent user-facing impact)

Click **Back to tables** to analyze a different table.

> **Note**: If no tables appear, your codebase may not use detected ORM patterns (SQLAlchemy, JPA, Diesel), or the analysis hasn't been run yet.

---

## 9. Endpoints

The Endpoints page lists all API endpoints discovered across your repositories. Navigate to it via **Endpoints** in the sidebar.

### Filtering

- **HTTP method buttons** — click ALL, GET, POST, PUT, PATCH, or DELETE to filter by method
- **Search box** — type to filter endpoints by route path

Filters combine: selecting POST and typing "user" shows only POST endpoints containing "user" in the path.

### Endpoint Table

Each row shows:
- HTTP method (color-coded badge)
- Route path
- Handler function name
- Repository name

---

## 10. Files

The Files page lets you browse the file structure of each repository. Navigate to it via **Files** in the sidebar.

### Browsing

1. **Select a repository** from the buttons at the top (each shows name and language badge)
2. The file tree appears as a collapsible directory structure
3. Click folder icons to expand/collapse directories
4. Click a file name to see its details

### File Details

When you select a file, the right panel shows:
- File name and language
- List of functions defined in that file, each with:
  - Function name
  - Category badge
  - Line numbers (start-end)

---

## 11. NLP Query Bar

The NLP Query Bar appears in the top bar on every page. It lets you ask natural language questions about your codebase.

### Asking Questions

1. Type a question in the bar, e.g.:
   - "Show me all functions that call the database"
   - "What endpoints have the most callers?"
   - "Which functions are in the auth module?"
2. Click **Ask** or press **Enter**

### Filter Chips

Below the input, four filter chips let you scope your query:
- **Frontend Only** — restricts to frontend repositories
- **Backend Only** — restricts to backend repositories
- **Exclude Tests** — removes test files from results
- **DB Layer Only** — shows only DB_CALL category functions

Click a chip to toggle it on/off. Active chips are highlighted. Filters are sent as structured data to the backend for precise filtering.

### Thinking Indicator

While your query is processing, a multi-step progress indicator shows:
1. "Understanding your question..."
2. "Generating Cypher query..."
3. "Executing against graph..."
4. "Done"

### Results

- **Explanation** — a natural language description of what was found
- **Show Cypher** — toggle to see the generated Cypher query
- **Results table** — the raw data returned from the graph
- **Summarize results** — click to get an AI-generated summary of the results, including key entities and concerns

---

## Quick Reference

| Task | Where to Go |
|------|------------|
| See project overview | Dashboard |
| Explore function relationships | Graph Explorer |
| Trace a call chain | Flow Tracer |
| Check impact of changing a function | Blast Radius |
| See how repos connect | Repo Graph |
| Check what depends on a DB table | DB Impact |
| Browse API endpoints | Endpoints |
| Browse file structure | Files |
| Ask a question about the code | NLP Query Bar (top bar) |
