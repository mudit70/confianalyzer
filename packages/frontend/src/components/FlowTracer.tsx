import { useState, useCallback, useMemo } from "react";
import { apiClient } from "../api/client";
import type { FunctionResult, FlowPath, GraphNode, GraphEdge, FunctionCategory, EntryToExitTrace } from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";
import SubgraphSummary from "./SubgraphSummary";

const ENTRY_CATEGORIES: { label: string; value: string }[] = [
  { label: "Any function", value: "" },
  { label: "Start from UI Interaction", value: "UI_INTERACTION" },
  { label: "Start from API Endpoint", value: "API_ENDPOINT" },
  { label: "Start from Handler", value: "HANDLER" },
  { label: "Start from API Caller", value: "API_CALLER" },
];

const SPINE_CATEGORIES = new Set([
  "UI_INTERACTION",
  "HANDLER",
  "API_CALLER",
  "API_ENDPOINT",
  "DB_CALL",
]);

const TERMINAL_CATEGORIES = new Set(["DB_CALL", "API_ENDPOINT"]);

type LayoutMode = "flow" | "swimlane";

const SWIMLANE_NODE_W = 160;
const SWIMLANE_NODE_H = 36;
const SWIMLANE_COL_GAP = 200;
const SWIMLANE_ROW_GAP = 56;

export default function FlowTracer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entryCategory, setEntryCategory] = useState("");
  const [searchResults, setSearchResults] = useState<FunctionResult[]>([]);
  const [selectedFn, setSelectedFn] = useState<FunctionResult | null>(null);
  const [direction, setDirection] = useState<"callers" | "callees" | "entry-to-exit">("callees");
  const [flows, setFlows] = useState<FlowPath[]>([]);
  const [entryToExitTrace, setEntryToExitTrace] = useState<EntryToExitTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spineOnly, setSpineOnly] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("flow");
  const [categoryFunctions, setCategoryFunctions] = useState<FunctionResult[]>([]);

  // Convert entry-to-exit trace into FlowPath[] for unified rendering
  const entryToExitFlows = useMemo<FlowPath[]>(() => {
    if (!entryToExitTrace) return [];
    // Merge all paths into a single deduplicated graph
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();
    const fileMaps: Record<string, string> = {};
    for (const path of entryToExitTrace.paths) {
      for (const node of path.nodes) {
        if (!nodeMap.has(node.id)) {
          // Enrich node metadata with fileMap info
          const enriched = { ...node, metadata: { ...node.metadata } };
          if (path.fileMap[node.id]) {
            enriched.metadata.filePath = path.fileMap[node.id];
          }
          nodeMap.set(node.id, enriched);
          if (path.fileMap[node.id]) {
            fileMaps[node.id] = path.fileMap[node.id];
          }
        }
      }
      for (const edge of path.edges) edgeMap.set(edge.id, edge);
    }
    const allNodes = [...nodeMap.values()];
    const allEdges = [...edgeMap.values()];
    if (allNodes.length === 0) return [];
    // Compute max depth from edges via BFS
    const adj = new Map<string, string[]>();
    for (const e of allEdges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    let maxDepth = 0;
    const visited = new Set<string>();
    const queue: { id: string; d: number }[] = [];
    // Find root nodes (no incoming edges)
    const hasIncoming = new Set(allEdges.map(e => e.target));
    for (const n of allNodes) {
      if (!hasIncoming.has(n.id)) {
        queue.push({ id: n.id, d: 0 });
        visited.add(n.id);
      }
    }
    if (queue.length === 0 && allNodes.length > 0) {
      queue.push({ id: allNodes[0].id, d: 0 });
      visited.add(allNodes[0].id);
    }
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (d > maxDepth) maxDepth = d;
      for (const next of adj.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ id: next, d: d + 1 });
        }
      }
    }
    return [{ nodes: allNodes, edges: allEdges, depth: maxDepth }];
  }, [entryToExitTrace]);

  // Pick the active flows based on direction
  const activeFlows = direction === "entry-to-exit" ? entryToExitFlows : flows;

  // Collect all unique nodes/edges from flows for the summarizer
  const flowGraph = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();
    for (const flow of activeFlows) {
      for (const node of flow.nodes) nodeMap.set(node.id, node);
      for (const edge of flow.edges) edgeMap.set(edge.id, edge);
    }
    return {
      nodes: [...nodeMap.values()],
      edges: [...edgeMap.values()],
    };
  }, [activeFlows]);

  const handleCategoryChange = useCallback(async (category: string) => {
    setEntryCategory(category);
    setCategoryFunctions([]);
    if (category) {
      setLoading(true);
      setError(null);
      try {
        const fns = await apiClient.getCategoryFunctions("default", category);
        setCategoryFunctions(fns);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load category functions");
      } finally {
        setLoading(false);
      }
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      let results: FunctionResult[];
      if (entryCategory) {
        results = await apiClient.getCategoryFunctions(
          "default",
          entryCategory,
        );
        // Filter by search query locally
        const q = searchQuery.trim().toLowerCase();
        results = results.filter(
          (fn) =>
            fn.name.toLowerCase().includes(q) ||
            fn.filePath.toLowerCase().includes(q),
        );
      } else {
        results = await apiClient.searchFunctions(searchQuery.trim());
      }
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, entryCategory]);

  const handleTrace = useCallback(async () => {
    if (!selectedFn) return;
    setLoading(true);
    setError(null);
    try {
      if (direction === "entry-to-exit") {
        const trace = await apiClient.getEntryToExitTrace(selectedFn.id, 15, spineOnly);
        setEntryToExitTrace(trace);
        setFlows([]);
      } else {
        const paths = await apiClient.traceFlow(selectedFn.id, direction);
        setFlows(paths);
        setEntryToExitTrace(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trace failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFn, direction, spineOnly]);

  function nodeColor(node: GraphNode): string {
    const cat = node.category as FunctionCategory | undefined;
    return cat ? (CATEGORY_COLORS[cat] ?? "#6b7280") : "#6b7280";
  }

  function isTerminalNode(node: GraphNode): boolean {
    return TERMINAL_CATEGORIES.has(node.category ?? "");
  }

  function filterSpine(nodes: GraphNode[]): GraphNode[] {
    if (!spineOnly) return nodes;
    return nodes.filter((n) => SPINE_CATEGORIES.has(n.category ?? ""));
  }

  function terminalNodeClass(node: GraphNode): string {
    if (node.category === "DB_CALL" || node.type === "dbtable") {
      return "flow-tracer__node--db";
    }
    if (node.category === "API_ENDPOINT" || node.type === "endpoint") {
      return "flow-tracer__node--endpoint";
    }
    return "";
  }

  /** Compute swimlane layout positions for a flow path */
  function computeSwimlaneLayout(nodes: GraphNode[], edges: GraphEdge[]) {
    if (nodes.length === 0) return { positioned: [], lanes: [], width: 0, height: 0 };

    // Build adjacency for BFS depth computation
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, []);
      adjacency.get(e.source)!.push(e.target);
    }

    // BFS from first node to assign depth
    const depthMap = new Map<string, number>();
    const queue = [nodes[0].id];
    depthMap.set(nodes[0].id, 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curDepth = depthMap.get(cur)!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!depthMap.has(next)) {
          depthMap.set(next, curDepth + 1);
          queue.push(next);
        }
      }
    }
    // Assign depth 0 for any unreachable nodes
    for (const n of nodes) {
      if (!depthMap.has(n.id)) depthMap.set(n.id, 0);
    }

    // Group by file path for Y-axis
    const fileGroups = new Map<string, GraphNode[]>();
    for (const n of nodes) {
      const file = (n.metadata?.filePath as string) ?? (n.metadata?.repoName as string) ?? "unknown";
      if (!fileGroups.has(file)) fileGroups.set(file, []);
      fileGroups.get(file)!.push(n);
    }

    const laneNames = [...fileGroups.keys()];
    const positioned: { node: GraphNode; x: number; y: number }[] = [];

    let laneYOffset = 0;
    const lanes: { name: string; y: number; height: number }[] = [];

    for (const lane of laneNames) {
      const laneNodes = fileGroups.get(lane)!;
      laneNodes.sort((a, b) => (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0));

      const laneStart = laneYOffset;
      for (let i = 0; i < laneNodes.length; i++) {
        const n = laneNodes[i];
        const depth = depthMap.get(n.id) ?? 0;
        positioned.push({
          node: n,
          x: depth * SWIMLANE_COL_GAP + 20,
          y: laneYOffset + i * SWIMLANE_ROW_GAP + 20,
        });
      }
      const laneHeight = Math.max(laneNodes.length * SWIMLANE_ROW_GAP, SWIMLANE_ROW_GAP);
      lanes.push({ name: lane, y: laneStart, height: laneHeight });
      laneYOffset += laneHeight + 16;
    }

    const maxDepth = Math.max(...[...depthMap.values()], 0);
    const width = (maxDepth + 1) * SWIMLANE_COL_GAP + SWIMLANE_NODE_W + 40;
    const height = laneYOffset + 20;

    return { positioned, lanes, width, height };
  }

  return (
    <div className="flow-tracer">
      <h2>Flow Tracer</h2>

      {/* Entry point picker */}
      <div className="flow-tracer__entry-picker">
        <label>Start from:</label>
        <select
          className="search-input"
          value={entryCategory}
          onChange={(e) => handleCategoryChange(e.target.value)}
          style={{ width: "auto", minWidth: 200 }}
        >
          {ENTRY_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category function list */}
      {entryCategory && categoryFunctions.length > 0 && !selectedFn && !searchQuery && (
        <div className="search-results">
          {categoryFunctions.slice(0, 20).map((fn) => (
            <button
              key={fn.id}
              className="search-result-item"
              onClick={() => {
                setSelectedFn(fn);
                setCategoryFunctions([]);
              }}
            >
              <strong>{fn.name}</strong>
              <span className="badge">{fn.category}</span>
              <span className="text-muted">
                {fn.repoName} - {fn.filePath}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flow-tracer__controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search for a starting function..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button className="btn" onClick={handleSearch} disabled={loading}>
          Search
        </button>
      </div>

      {searchResults.length > 0 && !selectedFn && (
        <div className="search-results">
          {searchResults.map((fn) => (
            <button
              key={fn.id}
              className="search-result-item"
              onClick={() => {
                setSelectedFn(fn);
                setSearchResults([]);
              }}
            >
              <strong>{fn.name}</strong>
              <span className="badge">{fn.category}</span>
              <span className="text-muted">
                {fn.repoName} - {fn.filePath}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedFn && (
        <div className="flow-tracer__selected">
          <span>
            Starting from: <strong>{selectedFn.name}</strong>
          </span>
          <button className="btn btn--sm" onClick={() => setSelectedFn(null)}>
            Change
          </button>
        </div>
      )}

      {selectedFn && (
        <div className="flow-tracer__direction">
          <label>
            <input
              type="radio"
              name="direction"
              value="callees"
              checked={direction === "callees"}
              onChange={() => setDirection("callees")}
            />
            Trace callees (what does this call?)
          </label>
          <label>
            <input
              type="radio"
              name="direction"
              value="callers"
              checked={direction === "callers"}
              onChange={() => setDirection("callers")}
            />
            Trace callers (who calls this?)
          </label>
          <label>
            <input
              type="radio"
              name="direction"
              value="entry-to-exit"
              checked={direction === "entry-to-exit"}
              onChange={() => setDirection("entry-to-exit")}
            />
            Entry to Exit (full flow)
          </label>
          <button className="btn" onClick={handleTrace} disabled={loading}>
            {loading ? "Tracing..." : "Trace"}
          </button>
        </div>
      )}

      {/* Spine toggle + layout toggle + summarize */}
      {activeFlows.length > 0 && (
        <div className="flow-tracer__toggles">
          <label className="flow-tracer__spine-toggle toggle-label">
            <input
              type="checkbox"
              checked={spineOnly}
              onChange={(e) => setSpineOnly(e.target.checked)}
            />
            Show spine only (hide UTILITY nodes)
          </label>
          <div className="flow-tracer__layout-toggle">
            <button
              className={`btn btn--sm ${layoutMode === "flow" ? "btn--active" : ""}`}
              onClick={() => setLayoutMode("flow")}
            >
              Flow
            </button>
            <button
              className={`btn btn--sm ${layoutMode === "swimlane" ? "btn--active" : ""}`}
              onClick={() => setLayoutMode("swimlane")}
            >
              Swimlane
            </button>
          </div>
          <button
            className="btn btn--sm flow-tracer__summarize-btn"
            onClick={() => setShowSummary(true)}
          >
            What does this flow do?
          </button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {activeFlows.length > 0 && layoutMode === "flow" && (
        <div className="flow-diagram">
          {activeFlows.map((flow, fi) => {
            const visibleNodes = filterSpine(flow.nodes);
            if (visibleNodes.length === 0) return null;
            return (
              <div key={fi} className="flow-path">
                <span className="flow-path__depth">Depth {flow.depth}</span>
                <div className="flow-path__nodes">
                  {visibleNodes.map((node, ni) => {
                    const isCrossRepo =
                      ni > 0 &&
                      visibleNodes[ni - 1].metadata.repoName !==
                        node.metadata.repoName;
                    const terminal = isTerminalNode(node);
                    const termClass = terminalNodeClass(node);
                    return (
                      <div key={node.id} className="flow-step">
                        {ni > 0 && (
                          <div
                            className={`flow-arrow ${isCrossRepo ? "flow-arrow--cross-repo" : ""}`}
                          />
                        )}
                        <div
                          className={`flow-node ${terminal ? `flow-node--terminal flow-tracer__terminal-node ${termClass}` : ""}`}
                          style={{ borderLeftColor: nodeColor(node) }}
                        >
                          <span className="flow-node__name">{node.label}</span>
                          <span
                            className="badge"
                            style={{ backgroundColor: nodeColor(node) }}
                          >
                            {node.category ?? node.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeFlows.length > 0 && layoutMode === "swimlane" && (
        <div className="flow-tracer__swimlane">
          {activeFlows.map((flow, fi) => {
            const visibleNodes = filterSpine(flow.nodes);
            if (visibleNodes.length === 0) return null;
            const { positioned, lanes, width, height } = computeSwimlaneLayout(
              visibleNodes,
              flow.edges,
            );
            // Build position lookup for edges
            const posMap = new Map(positioned.map((p) => [p.node.id, p]));
            return (
              <div key={fi} className="flow-path">
                <span className="flow-path__depth">Depth {flow.depth}</span>
                <svg
                  className="flow-tracer__swimlane-svg"
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height}`}
                >
                  {/* Lane backgrounds */}
                  {lanes.map((lane) => (
                    <g key={lane.name}>
                      <rect
                        className="flow-tracer__lane"
                        x={0}
                        y={lane.y}
                        width={width}
                        height={lane.height}
                        rx={4}
                      />
                      <text
                        x={8}
                        y={lane.y + 14}
                        className="flow-tracer__lane-label"
                      >
                        {lane.name}
                      </text>
                    </g>
                  ))}

                  {/* Edges */}
                  {flow.edges.map((edge) => {
                    const src = posMap.get(edge.source);
                    const tgt = posMap.get(edge.target);
                    if (!src || !tgt) return null;
                    return (
                      <line
                        key={edge.id}
                        x1={src.x + SWIMLANE_NODE_W}
                        y1={src.y + SWIMLANE_NODE_H / 2}
                        x2={tgt.x}
                        y2={tgt.y + SWIMLANE_NODE_H / 2}
                        className="graph-edge"
                        markerEnd="url(#arrowhead)"
                      />
                    );
                  })}

                  {/* Arrow marker */}
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="8"
                      markerHeight="6"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 8 3, 0 6"
                        fill="#94a3b8"
                      />
                    </marker>
                  </defs>

                  {/* Nodes */}
                  {positioned.map(({ node, x, y }) => {
                    const terminal = isTerminalNode(node);
                    const termClass = terminalNodeClass(node);
                    const isDb = termClass === "flow-tracer__node--db";
                    const isEp = termClass === "flow-tracer__node--endpoint";
                    return (
                      <g key={node.id} transform={`translate(${x}, ${y})`}>
                        <rect
                          width={SWIMLANE_NODE_W}
                          height={SWIMLANE_NODE_H}
                          rx={4}
                          fill="#f8fafc"
                          stroke={
                            isDb
                              ? "#ef4444"
                              : isEp
                                ? "#f97316"
                                : nodeColor(node)
                          }
                          strokeWidth={terminal ? 3 : 1.5}
                          className={terminal ? `flow-tracer__terminal-node ${termClass}` : ""}
                        />
                        <text
                          x={SWIMLANE_NODE_W / 2}
                          y={SWIMLANE_NODE_H / 2 + 4}
                          textAnchor="middle"
                          fontSize={11}
                          fill="#0f172a"
                        >
                          {(node.label ?? "").length > 18
                            ? (node.label ?? "").slice(0, 16) + "..."
                            : node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          })}
        </div>
      )}

      {selectedFn && activeFlows.length === 0 && !loading && !error && (
        <p className="text-muted">
          Select a direction and click Trace to see the call flow.
        </p>
      )}

      {showSummary && flowGraph.nodes.length > 0 && (
        <SubgraphSummary
          nodes={flowGraph.nodes}
          edges={flowGraph.edges}
          context={
            selectedFn
              ? `This is a flow trace starting from ${selectedFn.name}`
              : undefined
          }
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
