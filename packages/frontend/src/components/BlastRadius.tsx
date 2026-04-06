import { useState, useCallback, useEffect } from "react";
import { apiClient } from "../api/client";
import type { FunctionResult, BlastRadiusResponse, BlastRadiusCaller, FunctionCategory, InsightItem } from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";
import { useProjectName } from "../hooks/useProjectName";

export default function BlastRadius() {
  const projectName = useProjectName();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FunctionResult[]>([]);
  const [selectedFn, setSelectedFn] = useState<FunctionResult | null>(null);
  const [result, setResult] = useState<BlastRadiusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<InsightItem[]>([]);

  // Fetch suggested functions (high fan-out = most impactful to analyze)
  useEffect(() => {
    if (projectName === "default") return;
    apiClient.getHighFanout(projectName, 6).then(setSuggestions).catch(() => {});
  }, [projectName]);

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

  const handleSelect = useCallback(async (fn: FunctionResult) => {
    setSelectedFn(fn);
    setSearchResults([]);
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getBlastRadius(fn.id);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blast radius");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectSuggestion = useCallback(async (item: InsightItem) => {
    const fn: FunctionResult = {
      id: item.id,
      name: item.name,
      category: item.category ?? "UTILITY",
      signature: "",
      filePath: item.path ?? "",
      repoName: "",
      startLine: 0,
      endLine: 0,
    };
    await handleSelect(fn);
  }, [handleSelect]);

  const handleClear = useCallback(() => {
    setSelectedFn(null);
    setResult(null);
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
  }, []);

  function categoryColor(category: string): string {
    return CATEGORY_COLORS[category as FunctionCategory] ?? "#6b7280";
  }

  function groupByDepth(callers: BlastRadiusCaller[]): Map<number, BlastRadiusCaller[]> {
    const groups = new Map<number, BlastRadiusCaller[]>();
    for (const caller of callers) {
      if (!groups.has(caller.depth)) groups.set(caller.depth, []);
      groups.get(caller.depth)!.push(caller);
    }
    return groups;
  }

  const currentStep = !selectedFn ? 1 : 2;
  const hasResult = result !== null;

  // Depth colors for visual hierarchy
  const DEPTH_COLORS = ["#3b82f6", "#8b5cf6", "#f97316", "#ef4444", "#ec4899", "#6b7280"];

  return (
    <div style={{ padding: 0 }}>
      <h2>Blast Radius</h2>

      {/* Workflow step indicator */}
      <div style={{
        display: "flex", gap: 0, marginBottom: "1rem", fontSize: "0.82rem",
      }}>
        {[
          { num: 1, label: "Choose a function" },
          { num: 2, label: "View impact" },
        ].map((step, i) => (
          <div key={step.num} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 14px",
            backgroundColor: currentStep === step.num ? "rgba(59, 130, 246, 0.1)" : currentStep > step.num ? "rgba(34, 197, 94, 0.05)" : "transparent",
            borderBottom: currentStep === step.num ? "2px solid #3b82f6" : currentStep > step.num ? "2px solid #22c55e" : "2px solid #e2e8f0",
            color: currentStep === step.num ? "#3b82f6" : currentStep > step.num ? "#22c55e" : "#94a3b8",
            fontWeight: currentStep === step.num ? 600 : 400,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", fontWeight: 700,
              backgroundColor: currentStep > step.num ? "#22c55e" : currentStep === step.num ? "#3b82f6" : "#e2e8f0",
              color: currentStep >= step.num ? "#fff" : "#94a3b8",
            }}>
              {currentStep > step.num ? "\u2713" : step.num}
            </span>
            {step.label}
            {i < 1 && <span style={{ marginLeft: "8px", color: "#cbd5e1" }}>&rsaquo;</span>}
          </div>
        ))}
      </div>

      {/* ─── STEP 1: Choose function ─── */}
      {!selectedFn && (
        <>
          {/* Guided intro */}
          {!hasResult && (
            <div style={{
              padding: "1rem 1.25rem", marginBottom: "1rem",
              backgroundColor: "rgba(59, 130, 246, 0.04)", border: "1px solid #e2e8f0",
              borderRadius: "8px", lineHeight: 1.5,
            }}>
              <p style={{ color: "#334155", margin: "0 0 0.5rem 0", fontWeight: 500 }}>
                If I change this function, what breaks?
              </p>
              <p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>
                Select a function to see all its callers — direct and transitive. The blast radius shows every function that depends on your selection, grouped by distance. Use this before refactoring to understand the full impact of a change.
              </p>
            </div>
          )}

          {/* Search */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="text" className="search-input"
              placeholder="Search for a function by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <button className="btn" onClick={handleSearch} disabled={loading}>
              {loading ? "..." : "Search"}
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((fn) => (
                <button key={fn.id} className="search-result-item" onClick={() => handleSelect(fn)}>
                  <strong>{fn.name}</strong>
                  <span className="badge" style={{ backgroundColor: categoryColor(fn.category), color: "#fff" }}>
                    {fn.category}
                  </span>
                  <span className="text-muted">{fn.filePath}</span>
                </button>
              ))}
            </div>
          )}

          {/* Suggested starting points */}
          {searchResults.length === 0 && suggestions.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "0.5rem", fontWeight: 500 }}>
                Suggested functions to analyze:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {suggestions.map((item) => (
                  <button key={item.id} onClick={() => handleSelectSuggestion(item)}
                    style={{
                      padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
                      border: "1px solid #e2e8f0", background: "#f8fafc",
                      fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px",
                    }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: categoryColor(item.category ?? "UTILITY"),
                    }} />
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                    <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{item.count} calls</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── STEP 2: Selected function + results ─── */}
      {selectedFn && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
          padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
        }}>
          <span style={{ fontWeight: 600 }}>{selectedFn.name}</span>
          <span className="badge" style={{ backgroundColor: categoryColor(selectedFn.category), color: "#fff" }}>
            {selectedFn.category}
          </span>
          {selectedFn.filePath && (
            <span className="text-muted" style={{ fontSize: "0.82rem" }}>{selectedFn.filePath}</span>
          )}
          <button className="btn btn--sm" onClick={handleClear} style={{ marginLeft: "auto" }}>
            Change
          </button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {loading && <p className="text-muted">Analyzing impact...</p>}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Summary card — light theme */}
          <div style={{
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
            padding: "16px 20px", marginBottom: 20,
            display: "flex", gap: 24, flexWrap: "wrap",
          }}>
            {[
              { value: result.summary.directCallers, label: "Direct callers", color: "#3b82f6" },
              { value: result.summary.transitiveCallers, label: "Transitive callers", color: "#8b5cf6" },
              { value: result.summary.reposAffected.length, label: "Repos affected", color: "#f97316" },
              { value: result.summary.maxDepth, label: "Max depth", color: "#64748b" },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Repos affected */}
          {result.summary.reposAffected.length > 0 && (
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.82rem", color: "#64748b" }}>Repos: </span>
              {result.summary.reposAffected.map((repo) => (
                <span key={repo} className="badge" style={{ backgroundColor: "#e2e8f0", color: "#334155" }}>
                  {repo}
                </span>
              ))}
            </div>
          )}

          {/* No callers */}
          {result.callers.length === 0 && (
            <div style={{
              padding: "2rem", textAlign: "center",
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
            }}>
              <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
                No callers found. This function is not called by any other function in the analyzed codebase.
              </p>
              <p style={{ color: "#94a3b8", margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
                It may be an entry point, a test helper, or dead code.
              </p>
            </div>
          )}

          {/* Callers grouped by depth with visual hierarchy */}
          {[...groupByDepth(result.callers).entries()]
            .sort(([a], [b]) => a - b)
            .map(([depth, callers]) => {
              const depthColor = DEPTH_COLORS[Math.min(depth - 1, DEPTH_COLORS.length - 1)];
              return (
                <div key={depth} style={{ marginBottom: 16 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                    paddingLeft: (depth - 1) * 12,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", backgroundColor: depthColor,
                    }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: depthColor }}>
                      Depth {depth}
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      {callers.length} caller{callers.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 4,
                    paddingLeft: (depth - 1) * 12,
                    borderLeft: `3px solid ${depthColor}22`,
                    marginLeft: 2,
                  }}>
                    {callers.map((caller) => {
                      const isCrossRepo = selectedFn && caller.repoName !== selectedFn.repoName;
                      return (
                        <div key={caller.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 10px", borderRadius: "6px",
                          background: isCrossRepo ? "rgba(245, 158, 11, 0.06)" : "#f8fafc",
                          border: isCrossRepo ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #e2e8f0",
                          fontSize: "0.85rem",
                        }}>
                          <span style={{ fontWeight: 500, minWidth: 150 }}>{caller.name}</span>
                          <span className="badge" style={{
                            backgroundColor: categoryColor(caller.category), color: "#fff",
                            fontSize: "0.65rem", padding: "1px 6px",
                          }}>{caller.category}</span>
                          <span style={{ color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {caller.filePath}
                          </span>
                          {isCrossRepo && (
                            <span className="badge" style={{ backgroundColor: "#f59e0b", color: "#000", fontSize: "0.65rem" }}>
                              cross-repo
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
