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

interface NodePosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
  node: GraphNode;
  depth?: number; // For neighborhood mode
}

/**
 * Concentric ring layout: places nodes in concentric circles based on depth.
 * Center node at the middle, depth-1 on inner ring, depth-2 on outer ring, etc.
 */
function useConcentricLayout(
  nodes: GraphNode[],
  _edges: GraphEdge[],
  width: number,
  height: number,
  nodeDepths: Record<string, number>,
  centerId: string | null,
): NodePosition[] {
  return useMemo(() => {
    if (nodes.length === 0) return [];

    const cx = width / 2;
    const cy = height / 2;
    const RING_SPACING = 150;

    // Group nodes by depth
    const depthGroups = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const d = node.id === centerId ? 0 : (nodeDepths[node.id] ?? 99);
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(node);
    }

    const positions: NodePosition[] = [];

    for (const [depth, group] of depthGroups) {
      if (depth === 0) {
        // Center node
        for (const node of group) {
          positions.push({ x: cx, y: cy, vx: 0, vy: 0, node, depth: 0 });
        }
      } else {
        const radius = depth * RING_SPACING;
        group.forEach((node, i) => {
          const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
          positions.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
            node,
            depth,
          });
        });
      }
    }

    return positions;
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
    if (nodes.length === 0) {
      setPositions([]);
      return;
    }

    const cx = width / 2;
    const cy = height / 2;

    const pos: NodePosition[] = nodes.map((node, i) => ({
      x: cx + Math.cos((i / nodes.length) * Math.PI * 2) * 150,
      y: cy + Math.sin((i / nodes.length) * Math.PI * 2) * 150,
      vx: 0,
      vy: 0,
      node,
    }));

    const idToIdx = new Map(nodes.map((n, i) => [n.id, i]));

    let iterations = 0;
    function tick() {
      // Repulsion
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const dx = pos[j].x - pos[i].x;
          const dy = pos[j].y - pos[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 3000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          pos[i].vx -= fx;
          pos[i].vy -= fy;
          pos[j].vx += fx;
          pos[j].vy += fy;
        }
      }

      // Attraction (edges)
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
        pos[si].vx += fx;
        pos[si].vy += fy;
        pos[ti].vx -= fx;
        pos[ti].vy -= fy;
      }

      // Center gravity
      for (const p of pos) {
        p.vx += (cx - p.x) * 0.005;
        p.vy += (cy - p.y) * 0.005;
        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;
      }

      iterations++;
      setPositions([...pos]);

      if (iterations < 120) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [nodes, edges, width, height]);

  return positions;
}

export default function GraphExplorer() {
  const projectName = useProjectName();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FunctionResult[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Neighborhood mode state
  const [neighborhoodCenter, setNeighborhoodCenter] = useState<string | null>(
    null,
  );
  const [neighborhoodDepth, setNeighborhoodDepth] = useState(1);
  const [neighborhoodNodeIds, setNeighborhoodNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [neighborhoodMode, setNeighborhoodMode] = useState(false);

  // Node depth mapping for concentric layout
  const [nodeDepths, setNodeDepths] = useState<Record<string, number>>({});

  // Intelligence sidebar
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const WIDTH = 800;
  const HEIGHT = 500;
  const forcePositions = useForceLayout(
    graphData.nodes,
    graphData.edges,
    WIDTH,
    HEIGHT,
  );
  const concentricPositions = useConcentricLayout(
    graphData.nodes,
    graphData.edges,
    WIDTH,
    HEIGHT,
    nodeDepths,
    neighborhoodCenter,
  );
  const positions = neighborhoodMode ? concentricPositions : forcePositions;

  // Compute distinct depth levels for drawing ring guides
  const ringDepths = useMemo(() => {
    if (!neighborhoodMode) return [];
    const depths = new Set<number>();
    for (const d of Object.values(nodeDepths)) {
      if (d > 0) depths.add(d);
    }
    return Array.from(depths).sort((a, b) => a - b);
  }, [neighborhoodMode, nodeDepths]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await apiClient.searchFunctions(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadNeighbors = useCallback(
    async (functionId: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getFunctionNeighbors(
          functionId,
          neighborhoodDepth,
        );
        setGraphData(data);
        const center = data.nodes.find((n) => n.id === functionId);
        setSelectedNode(center ?? null);

        // Track neighborhood
        setNeighborhoodCenter(functionId);
        setNeighborhoodNodeIds(new Set(data.nodes.map((n) => n.id)));
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
        setError(
          err instanceof Error ? err.message : "Failed to load neighborhood",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      if (node.type === "function" && !neighborhoodMode) {
        loadNeighbors(node.id);
      }
    },
    [loadNeighbors, neighborhoodMode],
  );

  const handleInsightClick = useCallback(
    (item: InsightItem) => {
      // Load the insight item into the graph
      loadNeighbors(item.id);
    },
    [loadNeighbors],
  );

  const handleShowNeighborhood = useCallback(() => {
    if (selectedNode) {
      loadNeighborhood(selectedNode.id, neighborhoodDepth);
    }
  }, [selectedNode, neighborhoodDepth, loadNeighborhood]);

  // Re-fetch neighborhood when depth changes while in neighborhood mode
  const handleDepthChange = useCallback(
    (d: number) => {
      setNeighborhoodDepth(d);
      if (neighborhoodMode && neighborhoodCenter) {
        loadNeighborhood(neighborhoodCenter, d);
      }
    },
    [neighborhoodMode, neighborhoodCenter, loadNeighborhood],
  );

  const handleExitNeighborhood = useCallback(() => {
    setNeighborhoodMode(false);
    setNeighborhoodCenter(null);
    setNeighborhoodNodeIds(new Set());
    setNodeDepths({});
  }, []);

  function getNodeFill(node: GraphNode): string {
    // In neighborhood mode, use category colors for function nodes
    if (node.type === "function" && node.category) {
      return (
        CATEGORY_COLORS[node.category as FunctionCategory] ??
        (NODE_TYPE_COLORS[node.type] ?? "#6b7280")
      );
    }
    return NODE_TYPE_COLORS[node.type] ?? "#6b7280";
  }

  function getNodeOpacity(node: GraphNode): number {
    if (!neighborhoodMode) return 1;
    if (node.id === neighborhoodCenter) return 1;
    if (neighborhoodNodeIds.has(node.id)) return 1;
    return 0.15;
  }

  const posById = new Map(positions.map((p) => [p.node.id, p]));

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
          <div className="graph-explorer__controls">
            <input
              type="text"
              className="search-input"
              placeholder="Search functions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button className="btn" onClick={handleSearch} disabled={loading}>
              Search
            </button>

            {/* Depth control */}
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

            {/* Neighborhood actions */}
            {selectedNode && (selectedNode.type === "function" || selectedNode.type === "file") && (
              <button
                className="graph-explorer__neighborhood-btn"
                onClick={handleShowNeighborhood}
                title="Show neighborhood with dimming for context"
              >
                Show Neighborhood
              </button>
            )}
            {neighborhoodMode && (
              <button
                className="btn btn--sm"
                onClick={handleExitNeighborhood}
              >
                Exit Neighborhood
              </button>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          {searchResults.length > 0 && graphData.nodes.length === 0 && (
            <div className="search-results">
              {searchResults.map((fn) => (
                <button
                  key={fn.id}
                  className="search-result-item"
                  onClick={() => loadNeighbors(fn.id)}
                >
                  <strong>{fn.name}</strong>
                  <span className="badge">{fn.category}</span>
                  <span className="text-muted">{fn.filePath}</span>
                </button>
              ))}
            </div>
          )}

          <div className="graph-explorer__canvas">
            <svg width={WIDTH} height={HEIGHT} className="graph-svg">
              {/* Concentric ring guides */}
              {neighborhoodMode && ringDepths.map((d) => (
                <circle
                  key={`ring-${d}`}
                  cx={WIDTH / 2}
                  cy={HEIGHT / 2}
                  r={d * 150}
                  className="graph-explorer__ring"
                />
              ))}

              {/* Edges */}
              {graphData.edges.map((edge) => {
                const s = posById.get(edge.source);
                const t = posById.get(edge.target);
                if (!s || !t) return null;
                const edgeOpacity =
                  neighborhoodMode
                    ? neighborhoodNodeIds.has(edge.source) &&
                      neighborhoodNodeIds.has(edge.target)
                      ? 1
                      : 0.1
                    : 1;
                return (
                  <line
                    key={edge.id}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    className="graph-edge"
                    style={{ opacity: edgeOpacity }}
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
                  refX="20"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                </marker>
              </defs>

              {/* Nodes */}
              {positions.map((p) => {
                const isCenter =
                  neighborhoodMode && p.node.id === neighborhoodCenter;
                const isDimmed =
                  neighborhoodMode && !neighborhoodNodeIds.has(p.node.id);
                const opacity = getNodeOpacity(p.node);
                const nodeClass = [
                  "graph-node",
                  isCenter ? "graph-explorer__node--center" : "",
                  isDimmed ? "graph-explorer__node--dimmed" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <g
                    key={p.node.id}
                    transform={`translate(${p.x},${p.y})`}
                    onClick={() => handleNodeClick(p.node)}
                    className={nodeClass}
                    style={{ opacity }}
                  >
                    {/* Center node glow */}
                    {isCenter && (
                      <circle
                        r={22}
                        fill="none"
                        stroke={getNodeFill(p.node)}
                        strokeWidth={3}
                        className="graph-explorer__node--center-glow"
                      />
                    )}
                    <circle
                      r={
                        isCenter
                          ? 16
                          : selectedNode?.id === p.node.id
                            ? 14
                            : 10
                      }
                      fill={getNodeFill(p.node)}
                      stroke={
                        isCenter
                          ? "#facc15"
                          : selectedNode?.id === p.node.id
                            ? "#fff"
                            : "none"
                      }
                      strokeWidth={isCenter ? 3 : 2}
                    />
                    <text
                      y={-16}
                      textAnchor="middle"
                      className="graph-node__label"
                    >
                      {p.node.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="graph-legend">
              {Object.entries(NODE_TYPE_COLORS).map(([type, color]) => (
                <span key={type} className="graph-legend__item">
                  <span
                    className="graph-legend__dot"
                    style={{ backgroundColor: color }}
                  />
                  {type}
                </span>
              ))}
            </div>
          </div>

          {selectedNode && (
            <div className="graph-explorer__detail">
              <FunctionCard
                node={selectedNode}
                fileId={
                  graphData.edges
                    .find(
                      (e) =>
                        e.source === selectedNode.id && e.type === "DEFINED_IN",
                    )
                    ?.target
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
