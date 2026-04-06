import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { apiClient } from "../api/client";
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  FunctionResult,
  InsightItem,
} from "../types/graph";
import { NODE_TYPE_COLORS, CATEGORY_COLORS, type FunctionCategory } from "../types/graph";
import FunctionCard from "./FunctionCard";
import IntelligenceSidebar from "./IntelligenceSidebar";
import { useProjectName } from "../hooks/useProjectName";
import { useSearchParams } from "react-router-dom";

interface NodePosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
  node: GraphNode;
  depth?: number;
}

// ─── Category descriptions for legend ───
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  UI_INTERACTION: "UI components & event handlers",
  HANDLER: "Functions called by endpoints",
  API_CALLER: "HTTP client calls",
  API_ENDPOINT: "Route handlers",
  DB_CALL: "Database operations",
  UTILITY: "General-purpose functions",
};

// ─── Label helpers ───

const MAX_LABEL_LEN = 18;
function truncateLabel(label: string): string {
  if (label.length <= MAX_LABEL_LEN) return label;
  return label.slice(0, MAX_LABEL_LEN - 1) + "\u2026";
}

function displayLabel(node: GraphNode): string {
  const raw = node.type === "file" ? node.label.split("/").pop() ?? node.label : node.label;
  return truncateLabel(raw);
}

// ─── Layouts ───

function useConcentricLayout(
  nodes: GraphNode[],
  _edges: GraphEdge[],
  width: number,
  height: number,
  nodeDepths: Record<string, number>,
  centerId: string | null,
): { positions: NodePosition[]; maxRadius: number } {
  return useMemo(() => {
    if (nodes.length === 0) return { positions: [], maxRadius: 0 };
    const cx = width / 2;
    const cy = height / 2;
    const MIN_ARC_DISTANCE = 70; // minimum px between nodes on a ring
    const MIN_RING_RADIUS = 120;

    const depthGroups = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const d = node.id === centerId ? 0 : (nodeDepths[node.id] ?? 99);
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(node);
    }

    const positions: NodePosition[] = [];
    let maxRadius = 0;
    // Compute cumulative radius so outer rings don't overlap inner ones
    let prevRadius = 0;

    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    for (const depth of sortedDepths) {
      const group = depthGroups.get(depth)!;
      if (depth === 0) {
        for (const node of group) {
          positions.push({ x: cx, y: cy, vx: 0, vy: 0, node, depth: 0 });
        }
        continue;
      }
      // Adaptive radius: ensure nodes have enough arc spacing for labels
      const circumNeeded = group.length * MIN_ARC_DISTANCE;
      const radiusForSpacing = circumNeeded / (2 * Math.PI);
      const radius = Math.max(radiusForSpacing, prevRadius + MIN_RING_RADIUS);
      prevRadius = radius;
      if (radius > maxRadius) maxRadius = radius;

      group.forEach((node, i) => {
        const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
        positions.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: 0, vy: 0, node, depth,
        });
      });
    }
    return { positions, maxRadius };
  }, [nodes, width, height, nodeDepths, centerId, _edges]);
}

function useForceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): NodePosition[] {
  const [positions, setPositions] = useState<NodePosition[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    if (nodes.length === 0) { setPositions([]); return; }
    const cx = width / 2;
    const cy = height / 2;
    const pos: NodePosition[] = nodes.map((node, i) => ({
      x: cx + Math.cos((i / nodes.length) * Math.PI * 2) * 150,
      y: cy + Math.sin((i / nodes.length) * Math.PI * 2) * 150,
      vx: 0, vy: 0, node,
    }));
    const idToIdx = new Map(nodes.map((n, i) => [n.id, i]));
    let iterations = 0;
    function tick() {
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const dx = pos[j].x - pos[i].x;
          const dy = pos[j].y - pos[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 3000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          pos[i].vx -= fx; pos[i].vy -= fy;
          pos[j].vx += fx; pos[j].vy += fy;
        }
      }
      for (const edge of edges) {
        const si = idToIdx.get(edge.source);
        const ti = idToIdx.get(edge.target);
        if (si === undefined || ti === undefined) continue;
        const dx = pos[ti].x - pos[si].x;
        const dy = pos[ti].y - pos[si].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 120) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos[si].vx += fx; pos[si].vy += fy;
        pos[ti].vx -= fx; pos[ti].vy -= fy;
      }
      for (const p of pos) {
        p.vx += (cx - p.x) * 0.005;
        p.vy += (cy - p.y) * 0.005;
        p.vx *= 0.85; p.vy *= 0.85;
        p.x += p.vx; p.y += p.vy;
      }
      iterations++;
      setPositions([...pos]);
      if (iterations < 120) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [nodes, edges, width, height]);
  return positions;
}

// ─── Main Component ───

export default function GraphExplorer() {
  const projectName = useProjectName();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FunctionResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Neighborhood mode
  const [neighborhoodCenter, setNeighborhoodCenter] = useState<string | null>(null);
  const [neighborhoodDepth, setNeighborhoodDepth] = useState(1);
  const [neighborhoodNodeIds, setNeighborhoodNodeIds] = useState<Set<string>>(new Set());
  const [neighborhoodMode, setNeighborhoodMode] = useState(false);
  const [nodeDepths, setNodeDepths] = useState<Record<string, number>>({});

  // Navigation history (breadcrumbs)
  const [history, setHistory] = useState<{ id: string; label: string }[]>([]);

  // Intelligence sidebar — open by default when graph is empty
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Suggested starting points for empty state
  const [suggestions, setSuggestions] = useState<{
    hotspots: InsightItem[];
    fanout: InsightItem[];
  }>({ hotspots: [], fanout: [] });

  // Fetch suggestions on mount
  useEffect(() => {
    if (projectName === "default") return;
    Promise.all([
      apiClient.getHotspots(projectName, 3).catch(() => []),
      apiClient.getHighFanout(projectName, 3).catch(() => []),
    ]).then(([hotspots, fanout]) => {
      setSuggestions({ hotspots, fanout });
    });
  }, [projectName]);

  // Drag state
  const [dragOverrides, setDragOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const BASE_WIDTH = 800;
  const BASE_HEIGHT = 500;

  const concentricResult = useConcentricLayout(
    graphData.nodes, graphData.edges, BASE_WIDTH, BASE_HEIGHT, nodeDepths, neighborhoodCenter,
  );
  const forcePositions = useForceLayout(graphData.nodes, graphData.edges, BASE_WIDTH, BASE_HEIGHT);

  // Dynamic canvas size based on concentric layout
  const canvasWidth = neighborhoodMode
    ? Math.max(BASE_WIDTH, concentricResult.maxRadius * 2 + 200)
    : BASE_WIDTH;
  const canvasHeight = neighborhoodMode
    ? Math.max(BASE_HEIGHT, concentricResult.maxRadius * 2 + 200)
    : BASE_HEIGHT;

  // If canvas grew, re-center the concentric layout
  const concentricPositions = useMemo(() => {
    if (!neighborhoodMode) return concentricResult.positions;
    const offsetX = (canvasWidth - BASE_WIDTH) / 2;
    const offsetY = (canvasHeight - BASE_HEIGHT) / 2;
    if (offsetX === 0 && offsetY === 0) return concentricResult.positions;
    return concentricResult.positions.map((p) => ({
      ...p,
      x: p.x + offsetX,
      y: p.y + offsetY,
    }));
  }, [concentricResult, canvasWidth, canvasHeight, neighborhoodMode]);

  // Apply drag overrides to positions
  const basePositions = neighborhoodMode ? concentricPositions : forcePositions;
  const positions = useMemo(() => {
    if (dragOverrides.size === 0) return basePositions;
    return basePositions.map((p) => {
      const override = dragOverrides.get(p.node.id);
      return override ? { ...p, x: override.x, y: override.y } : p;
    });
  }, [basePositions, dragOverrides]);

  const ringDepths = useMemo(() => {
    if (!neighborhoodMode) return [];
    const depths = new Set<number>();
    for (const d of Object.values(nodeDepths)) { if (d > 0) depths.add(d); }
    return Array.from(depths).sort((a, b) => a - b);
  }, [neighborhoodMode, nodeDepths]);

  const isEmpty = graphData.nodes.length === 0;

  // Auto-load function from URL query param (e.g., /graph?fn=<id>)
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    const fnId = searchParams.get("fn");
    if (fnId && !autoLoadedRef.current && isEmpty) {
      autoLoadedRef.current = true;
      loadNeighborhood(fnId, neighborhoodDepth);
    }
  }, [searchParams, isEmpty, loadNeighborhood, neighborhoodDepth]);

  // ─── Actions ───

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await apiClient.searchFunctions(searchQuery.trim());
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadNeighbors = useCallback(
    async (functionId: string, label?: string) => {
      setLoading(true);
      setError(null);
      setShowSearchResults(false);
      try {
        const data = await apiClient.getFunctionNeighbors(functionId, neighborhoodDepth);
        setGraphData(data);
        const center = data.nodes.find((n) => n.id === functionId);
        setSelectedNode(center ?? null);
        // Don't auto-enter neighborhood mode — just show force layout
        setNeighborhoodCenter(null);
        setNeighborhoodMode(false);
        setNeighborhoodNodeIds(new Set(data.nodes.map((n) => n.id)));
        setNodeDepths({});
        // Collapse sidebar when graph loads
        setSidebarVisible(false);
        // Add to history
        const nodeLabel = label ?? center?.label ?? functionId;
        setHistory((prev) => {
          const filtered = prev.filter((h) => h.id !== functionId);
          return [...filtered, { id: functionId, label: nodeLabel }].slice(-8);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        setLoading(false);
      }
    },
    [neighborhoodDepth],
  );

  const loadNeighborhood = useCallback(
    async (nodeId: string, depth: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getNeighborhood(nodeId, depth);
        const allNodes = [data.center, ...data.nodes];
        setGraphData({ nodes: allNodes, edges: data.edges });
        setSelectedNode(data.center);
        setNeighborhoodCenter(nodeId);
        setNeighborhoodNodeIds(new Set(allNodes.map((n) => n.id)));
        setNodeDepths(data.nodeDepths ?? {});
        setNeighborhoodMode(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load neighborhood");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      if (neighborhoodMode) {
        // In neighborhood mode, clicking any node (including dimmed) re-centers
        loadNeighborhood(node.id, neighborhoodDepth);
        setHistory((prev) => {
          const filtered = prev.filter((h) => h.id !== node.id);
          return [...filtered, { id: node.id, label: node.label }].slice(-8);
        });
      } else {
        if (node.type === "function") {
          loadNeighbors(node.id, node.label);
        } else if (node.type === "file") {
          loadNeighborhood(node.id, neighborhoodDepth);
          setHistory((prev) => {
            const filtered = prev.filter((h) => h.id !== node.id);
            return [...filtered, { id: node.id, label: node.label }].slice(-8);
          });
        }
      }
    },
    [loadNeighbors, loadNeighborhood, neighborhoodMode, neighborhoodDepth],
  );

  const handleInsightClick = useCallback(
    (item: InsightItem) => {
      // Hotspot items are files (have path, no category) — use neighborhood
      // Fan-out / dead-code items are functions — use loadNeighbors
      if (item.path && !item.category) {
        loadNeighborhood(item.id, neighborhoodDepth);
        setSidebarVisible(false);
        setHistory((prev) => {
          const label = (item.path ?? item.name).split("/").pop() ?? item.name;
          const filtered = prev.filter((h) => h.id !== item.id);
          return [...filtered, { id: item.id, label }].slice(-8);
        });
      } else {
        loadNeighbors(item.id, item.name);
      }
    },
    [loadNeighbors, loadNeighborhood, neighborhoodDepth],
  );

  const handleShowNeighborhood = useCallback(() => {
    if (selectedNode) loadNeighborhood(selectedNode.id, neighborhoodDepth);
  }, [selectedNode, neighborhoodDepth, loadNeighborhood]);

  const handleDepthChange = useCallback(
    (d: number) => {
      setNeighborhoodDepth(d);
      if (neighborhoodMode && neighborhoodCenter) loadNeighborhood(neighborhoodCenter, d);
    },
    [neighborhoodMode, neighborhoodCenter, loadNeighborhood],
  );

  const handleExitNeighborhood = useCallback(() => {
    setNeighborhoodMode(false);
    setNeighborhoodCenter(null);
    setNeighborhoodNodeIds(new Set());
    setNodeDepths({});
  }, []);

  const handleClearGraph = useCallback(() => {
    setGraphData({ nodes: [], edges: [] });
    setSelectedNode(null);
    setNeighborhoodMode(false);
    setNeighborhoodCenter(null);
    setNeighborhoodNodeIds(new Set());
    setNodeDepths({});
    setHistory([]);
    setSidebarVisible(true);
  }, []);

  const handleBreadcrumbClick = useCallback(
    (id: string) => {
      if (neighborhoodMode) {
        loadNeighborhood(id, neighborhoodDepth);
      } else {
        loadNeighbors(id);
      }
    },
    [loadNeighbors, loadNeighborhood, neighborhoodMode, neighborhoodDepth],
  );

  // ─── Drag handlers ───

  const handleDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDragging(nodeId);
    dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
  }, []);

  const handleDragMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStartRef.current || !svgRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStartRef.current.moved = true;
    if (!dragStartRef.current.moved) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const scaleX = canvasWidth / svgRect.width;
    const scaleY = canvasHeight / svgRect.height;

    // Find original position for this node
    const orig = basePositions.find((p) => p.node.id === dragging);
    if (!orig) return;
    const prevOverride = dragOverrides.get(dragging);
    const baseX = prevOverride?.x ?? orig.x;
    const baseY = prevOverride?.y ?? orig.y;

    setDragOverrides((prev) => {
      const next = new Map(prev);
      next.set(dragging, {
        x: baseX + dx * scaleX,
        y: baseY + dy * scaleY,
      });
      return next;
    });
    dragStartRef.current.x = e.clientX;
    dragStartRef.current.y = e.clientY;
  }, [dragging, basePositions, dragOverrides, canvasWidth, canvasHeight]);

  const handleDragEnd = useCallback(() => {
    if (dragging && dragStartRef.current && !dragStartRef.current.moved) {
      // It was a click, not a drag — trigger node click
      const node = graphData.nodes.find((n) => n.id === dragging);
      if (node) handleNodeClick(node);
    }
    setDragging(null);
    dragStartRef.current = null;
  }, [dragging, graphData.nodes, handleNodeClick]);

  // Clear drag overrides when graph data changes
  useEffect(() => {
    setDragOverrides(new Map());
  }, [graphData]);

  // ─── Helpers ───

  function getNodeFill(node: GraphNode): string {
    if (node.type === "function" && node.category) {
      return CATEGORY_COLORS[node.category as FunctionCategory] ?? (NODE_TYPE_COLORS[node.type] ?? "#6b7280");
    }
    return NODE_TYPE_COLORS[node.type] ?? "#6b7280";
  }

  function getNodeOpacity(node: GraphNode): number {
    if (!neighborhoodMode) return 1;
    if (node.id === neighborhoodCenter) return 1;
    if (neighborhoodNodeIds.has(node.id)) return 1;
    return 0.3; // Was 0.15 — now higher so dimmed nodes look clickable
  }

  const posById = new Map(positions.map((p) => [p.node.id, p]));
  const centerNodeLabel = neighborhoodCenter
    ? graphData.nodes.find((n) => n.id === neighborhoodCenter)?.label ?? ""
    : "";

  return (
    <div className="graph-explorer">
      <div className="graph-explorer__layout">
        {/* Intelligence Sidebar */}
        <IntelligenceSidebar
          projectName={projectName}
          onInsightClick={handleInsightClick}
          visible={sidebarVisible}
          onToggle={() => setSidebarVisible(!sidebarVisible)}
        />

        <div className="graph-explorer__main">
          {/* Controls bar */}
          <div className="graph-explorer__controls">
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="text"
                className="search-input"
                placeholder="Search functions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
              />
              {/* Search results dropdown — always visible when results exist */}
              {showSearchResults && searchResults.length > 0 && (
                <div className="search-results" style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  maxHeight: "300px", overflowY: "auto",
                  backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "0 0 6px 6px",
                }}>
                  <div style={{ padding: "0.25rem 0.5rem", color: "#94a3b8", fontSize: "0.8em", borderBottom: "1px solid #334155" }}>
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                  </div>
                  {searchResults.map((fn) => (
                    <button
                      key={fn.id}
                      className="search-result-item"
                      onClick={() => { loadNeighbors(fn.id, fn.name); setShowSearchResults(false); }}
                    >
                      <strong>{fn.name}</strong>
                      <span className="badge">{fn.category}</span>
                      <span className="text-muted">{fn.filePath}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn" onClick={handleSearch} disabled={loading}>
              {loading ? "..." : "Search"}
            </button>

            {/* Depth control — only active in neighborhood mode */}
            {neighborhoodMode && (
              <div className="graph-explorer__depth-control">
                <label>Depth:</label>
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    className={`graph-explorer__depth-control button ${neighborhoodDepth === d ? "active" : ""}`}
                    onClick={() => handleDepthChange(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {/* Neighborhood actions */}
            {selectedNode && !neighborhoodMode && (selectedNode.type === "function" || selectedNode.type === "file") && (
              <button className="graph-explorer__neighborhood-btn" onClick={handleShowNeighborhood}>
                Show Neighborhood
              </button>
            )}
            {!isEmpty && (
              <button className="btn btn--sm" onClick={handleClearGraph} title="Clear graph and start over">
                Clear
              </button>
            )}
          </div>

          {/* Neighborhood mode indicator */}
          {neighborhoodMode && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.75rem",
              padding: "0.4rem 0.75rem", backgroundColor: "rgba(250, 204, 21, 0.1)",
              border: "1px solid rgba(250, 204, 21, 0.3)", borderRadius: "6px", margin: "0 0 0.5rem 0",
              fontSize: "0.85em",
            }}>
              <span style={{ color: "#facc15", fontWeight: 600 }}>Neighborhood View</span>
              <span style={{ color: "#94a3b8" }}>{centerNodeLabel}</span>
              <span style={{ color: "#64748b" }}>
                Ring 1 = direct connections, Ring 2 = 2 hops, Ring 3 = 3 hops
              </span>
              <button className="btn btn--sm" onClick={handleExitNeighborhood} style={{ marginLeft: "auto" }}>
                Exit Neighborhood
              </button>
            </div>
          )}

          {/* Breadcrumb history */}
          {history.length > 0 && !isEmpty && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.25rem",
              padding: "0.25rem 0", fontSize: "0.8em", color: "#64748b",
              flexWrap: "wrap",
            }}>
              {history.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && <span style={{ margin: "0 0.15rem" }}> &rsaquo; </span>}
                  <button
                    onClick={() => handleBreadcrumbClick(h.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "0.15rem 0.3rem",
                      color: i === history.length - 1 ? "#e2e8f0" : "#64748b",
                      fontWeight: i === history.length - 1 ? 600 : 400,
                      textDecoration: i === history.length - 1 ? "none" : "underline",
                      borderRadius: "3px", fontSize: "inherit",
                    }}
                  >
                    {h.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          {/* ─── EMPTY STATE: Guided onboarding ─── */}
          {isEmpty && !loading && (
            <div className="graph-explorer__empty-state" style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: "400px", textAlign: "center", padding: "2rem",
            }}>
              <h2 style={{ color: "#e2e8f0", margin: "0 0 0.5rem 0", fontSize: "1.5rem" }}>
                Explore your codebase as a graph
              </h2>
              <p style={{ color: "#94a3b8", margin: "0 0 1.5rem 0", maxWidth: "500px", lineHeight: 1.5 }}>
                Search for a function to see its dependencies, or pick a suggested starting point below.
              </p>

              {/* Suggested starting points */}
              {(suggestions.hotspots.length > 0 || suggestions.fanout.length > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", marginBottom: "1.5rem" }}>
                  {suggestions.hotspots.map((item) => (
                    <button
                      key={`h-${item.id}`}
                      onClick={() => handleInsightClick(item)}
                      style={{
                        background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)",
                        borderRadius: "8px", padding: "0.75rem 1rem", cursor: "pointer",
                        textAlign: "left", minWidth: "180px", maxWidth: "220px",
                      }}
                    >
                      <div style={{ fontSize: "0.7em", color: "#22c55e", fontWeight: 600, marginBottom: "0.25rem" }}>
                        HOTSPOT FILE
                      </div>
                      <div style={{ color: "#e2e8f0", fontWeight: 500, fontSize: "0.9em", wordBreak: "break-all" }}>
                        {(item.path ?? item.name).split("/").pop()}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.75em" }}>{item.count} imports</div>
                    </button>
                  ))}
                  {suggestions.fanout.map((item) => (
                    <button
                      key={`f-${item.id}`}
                      onClick={() => handleInsightClick(item)}
                      style={{
                        background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)",
                        borderRadius: "8px", padding: "0.75rem 1rem", cursor: "pointer",
                        textAlign: "left", minWidth: "180px", maxWidth: "220px",
                      }}
                    >
                      <div style={{ fontSize: "0.7em", color: "#3b82f6", fontWeight: 600, marginBottom: "0.25rem" }}>
                        HIGH FAN-OUT
                      </div>
                      <div style={{ color: "#e2e8f0", fontWeight: 500, fontSize: "0.9em" }}>{item.name}</div>
                      <div style={{ color: "#64748b", fontSize: "0.75em" }}>{item.count} outgoing calls</div>
                    </button>
                  ))}
                </div>
              )}

              <p style={{ color: "#475569", fontSize: "0.85em", margin: 0 }}>
                Tip: Click <strong style={{ color: "#94a3b8" }}>Insights</strong> on the left for code metrics like hotspots, cycles, and dead code.
              </p>
            </div>
          )}

          {/* ─── GRAPH CANVAS ─── */}
          {!isEmpty && (
            <div className="graph-explorer__canvas" style={{ overflow: "auto", maxHeight: "70vh" }}>
              <svg ref={svgRef} width={canvasWidth} height={canvasHeight} className="graph-svg"
                style={{ minWidth: canvasWidth, minHeight: canvasHeight }}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}>

                {/* Concentric ring guides with depth labels */}
                {neighborhoodMode && ringDepths.map((d) => {
                  // Compute actual ring radius from positions
                  const nodesAtDepth = positions.filter((p) => p.depth === d);
                  if (nodesAtDepth.length === 0) return null;
                  const cx = canvasWidth / 2;
                  const cy = canvasHeight / 2;
                  const avgR = nodesAtDepth.reduce((sum, p) => sum + Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2), 0) / nodesAtDepth.length;
                  return (
                    <g key={`ring-${d}`}>
                      <circle cx={cx} cy={cy} r={avgR} className="graph-explorer__ring" />
                      <text x={cx + avgR + 5} y={cy - 5} style={{ fill: "#475569", fontSize: "0.65em" }}>
                        {d === 1 ? "direct" : `${d} hops`}
                      </text>
                    </g>
                  );
                })}

                {/* Edges — styled by relationship type */}
                {graphData.edges.map((edge) => {
                  const s = posById.get(edge.source);
                  const t = posById.get(edge.target);
                  if (!s || !t) return null;
                  const edgeOpacity = neighborhoodMode
                    ? (neighborhoodNodeIds.has(edge.source) && neighborhoodNodeIds.has(edge.target) ? 1 : 0.15)
                    : 1;
                  const isImport = edge.type === "IMPORTS";
                  const isDefinedIn = edge.type === "DEFINED_IN";
                  const isInRepo = edge.type === "IN_REPO" || edge.type === "BELONGS_TO" || edge.type === "CONTAINS";
                  const stroke = isImport ? "#3b82f6" : isDefinedIn ? "#94a3b8" : isInRepo ? "#cbd5e1" : "#94a3b8";
                  const strokeDash = isDefinedIn ? "4 3" : isInRepo ? "2 3" : "none";
                  const strokeWidth = isInRepo ? 0.8 : isImport ? 1.8 : 1.5;
                  return (
                    <line key={edge.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke={stroke} strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                      style={{ opacity: edgeOpacity }}
                      markerEnd={isInRepo ? undefined : "url(#arrowhead)"} />
                  );
                })}

                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="20" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                  </marker>
                </defs>

                {/* Nodes with radial labels and drag support */}
                {positions.map((p) => {
                  const isCenter = neighborhoodMode && p.node.id === neighborhoodCenter;
                  const opacity = getNodeOpacity(p.node);
                  const isDragging = dragging === p.node.id;

                  // Radial label positioning: labels point outward from center
                  const cx = canvasWidth / 2;
                  const cy = canvasHeight / 2;
                  const angle = Math.atan2(p.y - cy, p.x - cx);
                  const isRightHalf = angle > -Math.PI / 2 && angle < Math.PI / 2;
                  const labelOffset = 18;
                  const labelX = isCenter ? 0 : Math.cos(angle) * labelOffset;
                  const labelY = isCenter ? -18 : Math.sin(angle) * labelOffset;
                  const textAnchor = isCenter ? "middle" : isRightHalf ? "start" : "end";

                  return (
                    <g key={p.node.id} transform={`translate(${p.x},${p.y})`}
                      onMouseDown={(e) => handleDragStart(p.node.id, e)}
                      className={`graph-node${isCenter ? " graph-explorer__node--center" : ""}`}
                      style={{ opacity, cursor: isDragging ? "grabbing" : "pointer" }}>
                      {isCenter && (
                        <circle r={22} fill="none" stroke={getNodeFill(p.node)} strokeWidth={3}
                          className="graph-explorer__node--center-glow" />
                      )}
                      <circle
                        r={isCenter ? 16 : selectedNode?.id === p.node.id ? 14 : p.node.type === "file" ? 12 : 10}
                        fill={getNodeFill(p.node)}
                        stroke={isCenter ? "#facc15" : selectedNode?.id === p.node.id ? "#fff" : isDragging ? "#facc15" : "none"}
                        strokeWidth={isCenter ? 3 : 2}
                      />
                      <title>{p.node.label}</title>
                      <text x={labelX} y={labelY} textAnchor={textAnchor}
                        className="graph-node__label"
                        dominantBaseline={isCenter ? "auto" : "central"}>
                        {displayLabel(p.node)}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Enhanced Legend */}
              <div className="graph-legend" style={{ flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                <span style={{ color: "#64748b", fontSize: "0.75em", marginRight: "0.25rem" }}>
                  Arrow: caller &rarr; callee | Drag nodes to rearrange
                </span>
                {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                  <span key={cat} className="graph-legend__item" title={CATEGORY_DESCRIPTIONS[cat] ?? ""}>
                    <span className="graph-legend__dot" style={{ backgroundColor: color }} />
                    <span style={{ fontSize: "0.8em" }}>{cat.replace("_", " ")}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Function detail card */}
          {selectedNode && (
            <div className="graph-explorer__detail">
              <FunctionCard
                node={selectedNode}
                fileId={
                  graphData.edges.find(
                    (e) => e.source === selectedNode.id && e.type === "DEFINED_IN",
                  )?.target
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
