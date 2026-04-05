import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../api/client";
import type { InsightItem, CycleInfo, DeadCodeItem, FunctionCategory } from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";

interface IntelligenceSidebarProps {
  projectName: string;
  onInsightClick: (item: InsightItem) => void;
  visible: boolean;
  onToggle: () => void;
}

type ActivePanel = "hotspots" | "fanout" | "cycles" | "unused" | "stats";

export default function IntelligenceSidebar({
  projectName,
  onInsightClick,
  visible,
  onToggle,
}: IntelligenceSidebarProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>("hotspots");
  const [hotspots, setHotspots] = useState<InsightItem[]>([]);
  const [fanout, setFanout] = useState<InsightItem[]>([]);
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [deadCode, setDeadCode] = useState<DeadCodeItem[]>([]);
  const [deadCodeLoaded, setDeadCodeLoaded] = useState(false);
  const [stats, setStats] = useState<{
    functions: number;
    files: number;
    endpoints: number;
    tables: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHotspots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getHotspots(projectName);
      setHotspots(data);
    } catch {
      setHotspots([]);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const loadFanout = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getHighFanout(projectName);
      setFanout(data);
    } catch {
      setFanout([]);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const loadCycles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getCycles(projectName);
      setCycles(data.cycles);
    } catch {
      setCycles([]);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const loadDeadCode = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getDeadCode(projectName);
      setDeadCode(data);
    } catch {
      setDeadCode([]);
    } finally {
      setDeadCodeLoaded(true);
      setLoading(false);
    }
  }, [projectName]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await apiClient.getProjectSummary(projectName);
      setStats({
        functions: summary.functionCount,
        files: summary.fileCount,
        endpoints: summary.endpointCount,
        tables: summary.dbTableCount,
      });
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    if (!visible) return;
    if (activePanel === "hotspots" && hotspots.length === 0) loadHotspots();
    if (activePanel === "fanout" && fanout.length === 0) loadFanout();
    if (activePanel === "cycles" && cycles.length === 0) loadCycles();
    if (activePanel === "unused" && !deadCodeLoaded) loadDeadCode();
    if (activePanel === "stats" && !stats) loadStats();
  }, [
    visible,
    activePanel,
    hotspots.length,
    fanout.length,
    cycles.length,
    deadCodeLoaded,
    stats,
    loadHotspots,
    loadFanout,
    loadCycles,
    loadDeadCode,
    loadStats,
  ]);

  if (!visible) {
    return (
      <button
        className="intelligence-toggle intelligence-toggle--collapsed"
        onClick={onToggle}
        title="Show Intelligence Sidebar"
      >
        Insights
      </button>
    );
  }

  return (
    <div className="intelligence-sidebar">
      <div className="intelligence-sidebar__header">
        <h3>Insights</h3>
        <button
          className="btn btn--sm"
          onClick={onToggle}
          title="Hide sidebar"
        >
          &times;
        </button>
      </div>

      <div className="intelligence-sidebar__tabs">
        <button
          className={`intelligence-tab ${activePanel === "hotspots" ? "intelligence-tab--active" : ""}`}
          onClick={() => setActivePanel("hotspots")}
        >
          Hotspots
        </button>
        <button
          className={`intelligence-tab ${activePanel === "fanout" ? "intelligence-tab--active" : ""}`}
          onClick={() => setActivePanel("fanout")}
        >
          Fan-Out
        </button>
        <button
          className={`intelligence-tab ${activePanel === "cycles" ? "intelligence-tab--active" : ""}`}
          onClick={() => setActivePanel("cycles")}
        >
          Cycles
        </button>
        <button
          className={`intelligence-tab ${activePanel === "unused" ? "intelligence-tab--active" : ""}`}
          onClick={() => setActivePanel("unused")}
        >
          Unused
        </button>
        <button
          className={`intelligence-tab ${activePanel === "stats" ? "intelligence-tab--active" : ""}`}
          onClick={() => setActivePanel("stats")}
        >
          Stats
        </button>
      </div>

      <div className="intelligence-sidebar__content">
        {loading && <div className="loading">Loading...</div>}

        {activePanel === "hotspots" && !loading && (
          <div className="insight-list">
            <p className="insight-list__desc">
              Files with the most inbound dependencies (highest fan-in).
            </p>
            {hotspots.length === 0 ? (
              <p className="text-muted">No data available.</p>
            ) : (
              hotspots.map((item) => {
                const fullPath = item.path ?? item.name;
                const fileName = fullPath.split("/").pop() ?? fullPath;
                const dirPath = fullPath.includes("/") ? fullPath.slice(0, fullPath.lastIndexOf("/")) : "";
                return (
                  <button
                    key={item.id}
                    className="insight-item"
                    onClick={() => onInsightClick(item)}
                    title={fullPath}
                    style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                      <span className="insight-item__name" style={{ fontWeight: 600 }}>{fileName}</span>
                      <span className="insight-item__count">{item.count} imports</span>
                    </span>
                    {dirPath && (
                      <span style={{ fontSize: "0.72rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {dirPath}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {activePanel === "fanout" && !loading && (
          <div className="insight-list">
            <p className="insight-list__desc">
              Functions that call the most other functions.
            </p>
            {fanout.length === 0 ? (
              <p className="text-muted">No data available.</p>
            ) : (
              fanout.map((item) => (
                <button
                  key={item.id}
                  className="insight-item"
                  onClick={() => onInsightClick(item)}
                >
                  <span className="insight-item__name">{item.name}</span>
                  {item.category && (
                    <span className="badge badge--sm" style={{
                      backgroundColor: CATEGORY_COLORS[item.category as FunctionCategory] ?? "#6b7280",
                      color: "#fff", fontSize: "0.65rem", padding: "1px 6px", borderRadius: "3px",
                    }}>{item.category}</span>
                  )}
                  <span className="insight-item__count">
                    {item.count} calls
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {activePanel === "cycles" && !loading && (
          <div className="insight-list">
            <p className="insight-list__desc">
              Circular dependencies between functions (call cycles).
            </p>
            {cycles.length === 0 ? (
              <p className="text-muted">No circular dependencies detected.</p>
            ) : (
              cycles.map((cycle, idx) => (
                <button
                  key={idx}
                  className="insight-item"
                  onClick={() =>
                    onInsightClick({
                      id: cycle.nodeIds[0],
                      name: cycle.nodeNames[0],
                      count: cycle.length,
                    })
                  }
                  style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                    <span style={{ fontWeight: 600, color: "var(--warning)" }}>Cycle ({cycle.length})</span>
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", wordBreak: "break-word", whiteSpace: "normal", lineHeight: 1.4 }}>
                    {cycle.nodeNames.join(" \u2192 ")}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {activePanel === "unused" && !loading && (
          <div className="insight-list">
            <p className="insight-list__desc">
              {deadCode.length} potentially unused function{deadCode.length !== 1 ? "s" : ""}
            </p>
            {deadCode.length === 0 ? (
              <p className="text-muted">No unused functions detected.</p>
            ) : (
              deadCode.map((item) => {
                const fileName = item.filePath.split("/").pop() ?? item.filePath;
                return (
                  <button
                    key={item.id}
                    className="insight-item"
                    onClick={() =>
                      onInsightClick({
                        id: item.id,
                        name: item.name,
                        category: item.category,
                        count: 0,
                      })
                    }
                    title={item.filePath}
                    style={{ flexDirection: "column", alignItems: "flex-start", gap: "2px" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                      <span className="insight-item__name" style={{ fontWeight: 600 }}>{item.name}</span>
                      {item.category && (
                        <span
                          className="badge badge--sm"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category as FunctionCategory] ?? "#6b7280",
                            color: "#fff", fontSize: "0.65rem", padding: "1px 6px", borderRadius: "3px",
                          }}
                        >
                          {item.category}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                      {fileName} &middot; {item.repoName}
                    </span>
                  </button>
                );
              })
            )}
            <p className="text-muted" style={{ fontSize: "0.8em", marginTop: "0.5rem" }}>
              Excludes API endpoints and UI entry points. Dynamic dispatch may hide callers.
            </p>
          </div>
        )}

        {activePanel === "stats" && !loading && stats && (
          <div className="insight-stats">
            <div className="insight-stat">
              <span className="insight-stat__value">{stats.functions}</span>
              <span className="insight-stat__label">Functions</span>
            </div>
            <div className="insight-stat">
              <span className="insight-stat__value">{stats.files}</span>
              <span className="insight-stat__label">Files</span>
            </div>
            <div className="insight-stat">
              <span className="insight-stat__value">{stats.endpoints}</span>
              <span className="insight-stat__label">Endpoints</span>
            </div>
            <div className="insight-stat">
              <span className="insight-stat__value">{stats.tables}</span>
              <span className="insight-stat__label">DB Tables</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
