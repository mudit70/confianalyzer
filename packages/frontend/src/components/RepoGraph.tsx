import { useState, useEffect, useMemo, useCallback } from "react";
import { apiClient } from "../api/client";
import type { RepoGraphNode, RepoGraphEdge } from "../types/graph";
import { useProjectName } from "../hooks/useProjectName";

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: "#3b82f6",
  javascript: "#3b82f6",
  python: "#22c55e",
  go: "#06b6d4",
  java: "#f97316",
  rust: "#ef4444",
};

const DEFAULT_COLOR = "#6b7280";

function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language.toLowerCase()] ?? DEFAULT_COLOR;
}

interface RepoPosition {
  x: number;
  y: number;
  node: RepoGraphNode;
}

function computeCircleLayout(
  repos: RepoGraphNode[],
  width: number,
  height: number,
): RepoPosition[] {
  if (repos.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;

  if (repos.length === 1) {
    return [{ x: cx, y: cy, node: repos[0] }];
  }

  const radius = Math.min(width, height) * 0.32;
  return repos.map((node, i) => {
    const angle = (i / repos.length) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      node,
    };
  });
}

export default function RepoGraph() {
  const projectName = useProjectName();
  const [repos, setRepos] = useState<RepoGraphNode[]>([]);
  const [edges, setEdges] = useState<RepoGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoGraphNode | null>(null);

  const WIDTH = 900;
  const HEIGHT = 600;
  const NODE_RADIUS = 45;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getRepoGraph(projectName)
      .then((data) => {
        if (cancelled) return;
        setRepos(data.repos);
        setEdges(data.edges);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? "Failed to load repo graph");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectName]);

  const positions = useMemo(
    () => computeCircleLayout(repos, WIDTH, HEIGHT),
    [repos],
  );

  const positionsByName = useMemo(() => {
    const map = new Map<string, RepoPosition>();
    for (const p of positions) {
      map.set(p.node.name, p);
    }
    return map;
  }, [positions]);

  const maxConnectionCount = useMemo(() => {
    if (edges.length === 0) return 1;
    return Math.max(...edges.map((e) => e.connectionCount));
  }, [edges]);

  const connectedRepos = useMemo(() => {
    if (!selectedRepo) return [];
    const connected: { name: string; connectionCount: number; direction: string }[] = [];
    for (const edge of edges) {
      if (edge.source === selectedRepo.name) {
        connected.push({ name: edge.target, connectionCount: edge.connectionCount, direction: "outgoing" });
      } else if (edge.target === selectedRepo.name) {
        connected.push({ name: edge.source, connectionCount: edge.connectionCount, direction: "incoming" });
      }
    }
    return connected;
  }, [selectedRepo, edges]);

  const handleNodeClick = useCallback((node: RepoGraphNode) => {
    setSelectedRepo((prev) => (prev?.id === node.id ? null : node));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
        Loading repository graph...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#ef4444" }}>
        {error}
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
        No repositories found. Run an analysis first.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 24 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600 }}>
          Repository Graph
        </h2>
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{
            background: "#111827",
            borderRadius: 8,
            border: "1px solid #374151",
            maxWidth: "100%",
          }}
        >
          {/* Edges */}
          {edges.map((edge) => {
            const source = positionsByName.get(edge.source);
            const target = positionsByName.get(edge.target);
            if (!source || !target) return null;

            const strokeWidth = Math.max(
              1.5,
              (edge.connectionCount / maxConnectionCount) * 6,
            );

            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;

            return (
              <g key={`${edge.source}-${edge.target}`}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#4b5563"
                  strokeWidth={strokeWidth}
                  strokeOpacity={0.7}
                />
                <text
                  x={midX}
                  y={midY - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#9ca3af"
                >
                  {edge.connectionCount}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {positions.map((pos) => {
            const color = getLanguageColor(pos.node.language);
            const isSelected = selectedRepo?.id === pos.node.id;

            return (
              <g
                key={pos.node.id}
                style={{ cursor: "pointer" }}
                onClick={() => handleNodeClick(pos.node)}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS}
                  fill={color}
                  fillOpacity={0.15}
                  stroke={isSelected ? "#ffffff" : color}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text
                  x={pos.x}
                  y={pos.y - 6}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill="#e5e7eb"
                >
                  {pos.node.name}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill={color}
                >
                  {pos.node.language}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail panel */}
      {selectedRepo && (
        <div
          style={{
            width: 280,
            background: "#1f2937",
            borderRadius: 8,
            padding: 20,
            border: "1px solid #374151",
            alignSelf: "flex-start",
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "#f3f4f6" }}>
            {selectedRepo.name}
          </h3>
          <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.8 }}>
            <div>
              <strong>Language:</strong>{" "}
              <span style={{ color: getLanguageColor(selectedRepo.language) }}>
                {selectedRepo.language}
              </span>
            </div>
            <div>
              <strong>Files:</strong> {selectedRepo.fileCount}
            </div>
            <div>
              <strong>Functions:</strong> {selectedRepo.functionCount}
            </div>
          </div>

          {connectedRepos.length > 0 && (
            <>
              <h4
                style={{
                  margin: "16px 0 8px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Connections
              </h4>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13 }}>
                {connectedRepos.map((c) => (
                  <li
                    key={`${c.name}-${c.direction}`}
                    style={{
                      padding: "4px 0",
                      color: "#d1d5db",
                      borderBottom: "1px solid #374151",
                    }}
                  >
                    {c.direction === "outgoing" ? "\u2192" : "\u2190"} {c.name}{" "}
                    <span style={{ color: "#6b7280" }}>
                      ({c.connectionCount} call{c.connectionCount !== 1 ? "s" : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
