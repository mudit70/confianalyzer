import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import type { FunctionResult, FunctionCategory } from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";
import { useProjectName } from "../hooks/useProjectName";

interface CategoryListProps {
  category: string;
  title: string;
  description: string;
  emptyMessage: string;
}

export default function CategoryList({ category, title, description, emptyMessage }: CategoryListProps) {
  const projectName = useProjectName();
  const navigate = useNavigate();
  const [functions, setFunctions] = useState<FunctionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (projectName === "default") return;
    setLoading(true);
    apiClient
      .getCategoryFunctions(projectName, category)
      .then(setFunctions)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [projectName, category]);

  const filtered = useMemo(() => {
    if (!searchQuery) return functions;
    const q = searchQuery.toLowerCase();
    return functions.filter(
      (fn) => fn.name.toLowerCase().includes(q) || fn.filePath.toLowerCase().includes(q),
    );
  }, [functions, searchQuery]);

  const color = CATEGORY_COLORS[category as FunctionCategory] ?? "#6b7280";

  function handleViewGraph(fn: FunctionResult) {
    // Navigate to graph explorer — it will load via search
    navigate(`/graph?fn=${encodeURIComponent(fn.id)}`);
  }

  if (loading) return <div className="loading">Loading {title.toLowerCase()}...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div>
      <h2>{title}</h2>
      <p className="text-muted" style={{ marginBottom: 16 }}>{description}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          className="search-input"
          placeholder="Filter by name or file..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span style={{ color: "#94a3b8", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
          {filtered.length} of {functions.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: "2rem", textAlign: "center",
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
        }}>
          <p style={{ color: "#64748b", margin: 0 }}>{functions.length === 0 ? emptyMessage : "No matches for this filter."}</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Function</th>
              <th>File</th>
              <th>Lines</th>
              <th>Repository</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((fn) => (
              <tr key={fn.id}>
                <td>
                  <span style={{ fontWeight: 500 }}>{fn.name}</span>
                  <span className="badge" style={{
                    marginLeft: 8, backgroundColor: color, color: "#fff",
                    fontSize: "0.65rem", padding: "1px 6px",
                  }}>{category}</span>
                </td>
                <td>
                  <code style={{ fontSize: "0.82rem" }}>
                    {fn.filePath.length > 50 ? "..." + fn.filePath.slice(-47) : fn.filePath}
                  </code>
                </td>
                <td style={{ whiteSpace: "nowrap", color: "#64748b" }}>
                  {fn.startLine}-{fn.endLine}
                </td>
                <td>{fn.repoName}</td>
                <td>
                  <button
                    className="btn btn--sm"
                    onClick={() => handleViewGraph(fn)}
                    title="View in Graph Explorer"
                  >
                    Graph
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
