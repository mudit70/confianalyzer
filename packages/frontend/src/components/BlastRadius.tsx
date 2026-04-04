import { useState, useCallback } from "react";
import { apiClient } from "../api/client";
import type { FunctionResult, BlastRadiusResponse, BlastRadiusCaller, FunctionCategory } from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";

export default function BlastRadius() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FunctionResult[]>([]);
  const [selectedFn, setSelectedFn] = useState<FunctionResult | null>(null);
  const [result, setResult] = useState<BlastRadiusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Group callers by depth
  function groupByDepth(callers: BlastRadiusCaller[]): Map<number, BlastRadiusCaller[]> {
    const groups = new Map<number, BlastRadiusCaller[]>();
    for (const caller of callers) {
      if (!groups.has(caller.depth)) groups.set(caller.depth, []);
      groups.get(caller.depth)!.push(caller);
    }
    return groups;
  }

  return (
    <div style={{ padding: "0" }}>
      <h2>Blast Radius</h2>
      <p className="text-muted" style={{ marginBottom: 16 }}>
        Find all functions that directly or transitively call a given function.
      </p>

      {/* Search controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          className="search-input"
          placeholder="Search for a function..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button className="btn" onClick={handleSearch} disabled={loading}>
          Search
        </button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && !selectedFn && (
        <div className="search-results">
          {searchResults.map((fn) => (
            <button
              key={fn.id}
              className="search-result-item"
              onClick={() => handleSelect(fn)}
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

      {/* Selected function */}
      {selectedFn && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span>
            Analyzing: <strong>{selectedFn.name}</strong>
          </span>
          <span
            className="badge"
            style={{ backgroundColor: categoryColor(selectedFn.category) }}
          >
            {selectedFn.category}
          </span>
          <span className="text-muted">
            {selectedFn.repoName} - {selectedFn.filePath}
          </span>
          <button className="btn btn--sm" onClick={handleClear}>
            Change
          </button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading && <p className="text-muted">Loading...</p>}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Summary card */}
          <div
            style={{
              background: "#1e293b",
              borderRadius: 8,
              padding: 20,
              marginBottom: 24,
              display: "flex",
              gap: 32,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {result.summary.directCallers}
              </div>
              <div className="text-muted">Direct callers</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {result.summary.transitiveCallers}
              </div>
              <div className="text-muted">Transitive callers</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {result.summary.reposAffected.length}
              </div>
              <div className="text-muted">Repos affected</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {result.summary.maxDepth}
              </div>
              <div className="text-muted">Max depth</div>
            </div>
          </div>

          {/* Repos affected list */}
          {result.summary.reposAffected.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <span className="text-muted">Repos: </span>
              {result.summary.reposAffected.map((repo) => (
                <span
                  key={repo}
                  className="badge"
                  style={{ marginRight: 6, backgroundColor: "#334155" }}
                >
                  {repo}
                </span>
              ))}
            </div>
          )}

          {/* Callers grouped by depth */}
          {result.callers.length === 0 && (
            <p className="text-muted">No callers found for this function.</p>
          )}

          {[...groupByDepth(result.callers).entries()].map(([depth, callers]) => (
            <div key={depth} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8, color: "#94a3b8" }}>
                Depth {depth} ({callers.length} caller{callers.length !== 1 ? "s" : ""})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {callers.map((caller) => {
                  const isCrossRepo =
                    selectedFn && caller.repoName !== selectedFn.repoName;
                  return (
                    <div
                      key={caller.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "#1e293b",
                        border: isCrossRepo
                          ? "2px solid #f59e0b"
                          : "1px solid #334155",
                      }}
                    >
                      <span style={{ fontWeight: 600, minWidth: 180 }}>
                        {caller.name}
                      </span>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: categoryColor(caller.category),
                        }}
                      >
                        {caller.category}
                      </span>
                      <span className="text-muted" style={{ flex: 1 }}>
                        {caller.filePath}
                      </span>
                      <span className="text-muted">{caller.repoName}</span>
                      {isCrossRepo && (
                        <span
                          className="badge"
                          style={{ backgroundColor: "#f59e0b", color: "#000" }}
                        >
                          cross-repo
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedFn && !result && !loading && !error && (
        <p className="text-muted">Loading blast radius...</p>
      )}
    </div>
  );
}
