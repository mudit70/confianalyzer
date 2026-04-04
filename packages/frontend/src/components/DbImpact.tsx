import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import type {
  DbTableInfo,
  DbImpactResponse,
  DbImpactCaller,
  FunctionCategory,
} from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";
import { useProjectName } from "../hooks/useProjectName";

export default function DbImpact() {
  const projectName = useProjectName();
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [impact, setImpact] = useState<DbImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTableLoading(true);
    apiClient
      .getDbTables(projectName)
      .then(setTables)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load tables"),
      )
      .finally(() => setTableLoading(false));
  }, [projectName]);

  const handleSelectTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setLoading(true);
    setError(null);
    setImpact(null);
    try {
      const data = await apiClient.getDbImpact(projectName, tableName);
      setImpact(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DB impact");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTable(null);
    setImpact(null);
    setError(null);
  }, []);

  function categoryColor(category: string): string {
    return CATEGORY_COLORS[category as FunctionCategory] ?? "#6b7280";
  }

  function groupByDepth(callers: DbImpactCaller[]): Map<number, DbImpactCaller[]> {
    const groups = new Map<number, DbImpactCaller[]>();
    for (const caller of callers) {
      if (!groups.has(caller.depth)) groups.set(caller.depth, []);
      groups.get(caller.depth)!.push(caller);
    }
    return groups;
  }

  return (
    <div style={{ padding: 0 }}>
      <h2>DB Impact Analysis</h2>
      <p className="text-muted" style={{ marginBottom: 16 }}>
        Trace reverse dependencies from database tables to find all functions and
        endpoints affected by a table change.
      </p>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 16,
            background: "#fef2f2",
            color: "#dc2626",
            borderRadius: 6,
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      )}

      {/* Table List */}
      {!selectedTable && (
        <>
          {tableLoading && <p className="text-muted">Loading tables...</p>}
          {!tableLoading && tables.length === 0 && !error && (
            <p className="text-muted">
              No database tables found. Run an analysis that includes DB access
              patterns first.
            </p>
          )}
          {tables.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => handleSelectTable(table.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "#1e1e2e",
                    border: "1px solid #333",
                    borderRadius: 8,
                    cursor: "pointer",
                    color: "#e0e0e0",
                    textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor = "#8b5cf6")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor = "#333")
                  }
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: "#8b5cf620",
                        color: "#8b5cf6",
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      T
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      {table.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                    <span style={{ color: "#3b82f6" }}>
                      {table.readerCount} reader{table.readerCount !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: "#f97316" }}>
                      {table.writerCount} writer{table.writerCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Impact Results */}
      {selectedTable && (
        <>
          <button
            onClick={handleBack}
            className="btn"
            style={{ marginBottom: 16 }}
          >
            Back to tables
          </button>

          {loading && <p className="text-muted">Analyzing impact...</p>}

          {impact && (
            <>
              {/* Summary Card */}
              <div
                style={{
                  padding: "16px 20px",
                  marginBottom: 20,
                  background: "#1e1e2e",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
              >
                <h3 style={{ margin: "0 0 8px 0", fontSize: 18 }}>
                  Table: {impact.tableName}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "#a0a0b0",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: "#e0e0e0" }}>
                    {impact.summary.directAccessors}
                  </strong>{" "}
                  direct accessor
                  {impact.summary.directAccessors !== 1 ? "s" : ""},{" "}
                  <strong style={{ color: "#e0e0e0" }}>
                    {impact.summary.transitiveCallers}
                  </strong>{" "}
                  transitive caller
                  {impact.summary.transitiveCallers !== 1 ? "s" : ""},{" "}
                  <strong style={{ color: "#f97316" }}>
                    {impact.summary.endpointsAffected}
                  </strong>{" "}
                  endpoint{impact.summary.endpointsAffected !== 1 ? "s" : ""}{" "}
                  affected across{" "}
                  <strong style={{ color: "#e0e0e0" }}>
                    {impact.summary.reposAffected.length}
                  </strong>{" "}
                  repo{impact.summary.reposAffected.length !== 1 ? "s" : ""}
                  {impact.summary.reposAffected.length > 0 && (
                    <span>
                      {" "}
                      ({impact.summary.reposAffected.join(", ")})
                    </span>
                  )}
                </p>
              </div>

              {/* Direct Accessors */}
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>Direct Accessors</h3>
              {impact.directAccessors.length === 0 ? (
                <p className="text-muted">No direct accessors found.</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    marginBottom: 24,
                  }}
                >
                  {impact.directAccessors.map((accessor) => (
                    <div
                      key={accessor.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        background: "#1e1e2e",
                        border: "1px solid #333",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#e0e0e0" }}>
                        {accessor.name}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: categoryColor(accessor.category) + "20",
                          color: categoryColor(accessor.category),
                        }}
                      >
                        {accessor.category}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            accessor.operation === "WRITES"
                              ? "#f9731620"
                              : "#3b82f620",
                          color:
                            accessor.operation === "WRITES"
                              ? "#f97316"
                              : "#3b82f6",
                        }}
                      >
                        {accessor.operation}
                      </span>
                      <span
                        className="text-muted"
                        style={{ marginLeft: "auto", fontSize: 12 }}
                      >
                        {accessor.repoName} - {accessor.filePath}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Transitive Callers */}
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>
                Transitive Callers
              </h3>
              {impact.transitiveCallers.length === 0 ? (
                <p className="text-muted">No transitive callers found.</p>
              ) : (
                <div style={{ marginBottom: 24 }}>
                  {[...groupByDepth(impact.transitiveCallers).entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([depth, callers]) => (
                      <div key={depth} style={{ marginBottom: 12 }}>
                        <h4
                          style={{
                            fontSize: 13,
                            color: "#a0a0b0",
                            marginBottom: 6,
                          }}
                        >
                          Depth {depth} ({callers.length} caller
                          {callers.length !== 1 ? "s" : ""})
                        </h4>
                        <div style={{ display: "grid", gap: 4 }}>
                          {callers.map((caller) => {
                            const isEndpoint =
                              caller.category === "API_ENDPOINT";
                            return (
                              <div
                                key={caller.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "10px 14px",
                                  background: isEndpoint
                                    ? "#f9731610"
                                    : "#1e1e2e",
                                  border: `1px solid ${isEndpoint ? "#f9731640" : "#333"}`,
                                  borderRadius: 6,
                                  fontSize: 13,
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: isEndpoint
                                      ? "#f97316"
                                      : "#e0e0e0",
                                  }}
                                >
                                  {caller.name}
                                </span>
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background:
                                      categoryColor(caller.category) + "20",
                                    color: categoryColor(caller.category),
                                  }}
                                >
                                  {caller.category}
                                </span>
                                <span
                                  className="text-muted"
                                  style={{
                                    marginLeft: "auto",
                                    fontSize: 12,
                                  }}
                                >
                                  {caller.repoName} - {caller.filePath}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
