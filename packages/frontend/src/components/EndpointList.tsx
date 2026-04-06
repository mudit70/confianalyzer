import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import type { Endpoint } from "../types/graph";

const HTTP_METHODS = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#3b82f6",
  PUT: "#f97316",
  PATCH: "#eab308",
  DELETE: "#ef4444",
  OPTIONS: "#6b7280",
  HEAD: "#6b7280",
};

export default function EndpointList() {
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    apiClient
      .getEndpoints()
      .then(setEndpoints)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return endpoints.filter((ep) => {
      if (methodFilter !== "ALL" && ep.method !== methodFilter) return false;
      if (searchQuery && !ep.fullRoute.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [endpoints, methodFilter, searchQuery]);

  if (loading) return <div className="loading">Loading endpoints...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="endpoint-list">
      <h2>API Endpoints</h2>

      <div className="endpoint-list__controls">
        <div className="method-filters">
          {HTTP_METHODS.map((m) => (
            <button
              key={m}
              className={`btn btn--sm ${methodFilter === m ? "btn--active" : ""}`}
              onClick={() => setMethodFilter(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="Filter by path..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Route</th>
            <th>Handler</th>
            <th>Repository</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-muted">
                No endpoints found.
              </td>
            </tr>
          ) : (
            filtered.map((ep) => (
              <tr key={ep.id}>
                <td>
                  <span
                    className="badge badge--method"
                    style={{
                      backgroundColor: METHOD_COLORS[ep.method] ?? "#6b7280",
                    }}
                  >
                    {ep.method}
                  </span>
                </td>
                <td>
                  <code>{ep.fullRoute}</code>
                </td>
                <td>{ep.handlerName}</td>
                <td>{ep.repoName}</td>
                <td>
                  <button
                    className="btn btn--sm"
                    onClick={() => navigate(`/graph?fn=${encodeURIComponent(ep.id)}`)}
                    title="View endpoint in Graph Explorer"
                  >
                    Graph
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
