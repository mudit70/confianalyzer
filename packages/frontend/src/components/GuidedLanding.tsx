import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import type { GraphSummaryResponse, FunctionCategory } from "../types/graph";
import { CATEGORY_COLORS } from "../types/graph";

interface SummaryCard {
  key: string;
  label: string;
  count: number;
  subtitle: string;
  category?: string;
}

export default function GuidedLanding() {
  const [summary, setSummary] = useState<GraphSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient
      .getGraphSummary("default")
      .then(setSummary)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  const cards = useMemo<SummaryCard[]>(() => {
    if (!summary) return [];
    const t = summary.totals;
    const topEpNames = summary.topEndpoints
      .slice(0, 3)
      .map((e) => `${e.method} ${e.path}`)
      .join(", ");
    const topTableNames = summary.topTables
      .slice(0, 3)
      .map((tb) => tb.name)
      .join(", ");
    const readCount = summary.topTables.reduce(
      (s, tb) => s + tb.readerCount,
      0,
    );
    const writeCount = summary.topTables.reduce(
      (s, tb) => s + tb.writerCount,
      0,
    );

    return [
      {
        key: "endpoints",
        label: "API Endpoints",
        count: t.apiEndpoints,
        subtitle: topEpNames || "No endpoints",
        category: "API_ENDPOINT",
      },
      {
        key: "callers",
        label: "API Callers",
        count: t.apiCallers,
        subtitle: `${t.apiCallers} callers across repos`,
        category: "API_CALLER",
      },
      {
        key: "dbcalls",
        label: "Database Calls",
        count: t.dbCalls,
        subtitle: `${readCount} reads, ${writeCount} writes`,
        category: "DB_CALL",
      },
      {
        key: "ui",
        label: "UI Interactions",
        count: t.uiInteractions,
        subtitle: `Across ${summary.repositories.length} repos`,
        category: "UI_INTERACTION",
      },
      {
        key: "crossrepo",
        label: "Cross-Repo Connections",
        count: t.crossRepoConnections,
        subtitle: `Across ${summary.repositories.length} repo pairs`,
      },
      {
        key: "tables",
        label: "DB Tables",
        count: t.dbTables,
        subtitle: topTableNames || "No tables",
      },
    ];
  }, [summary]);

  const totalFunctions = useMemo(() => {
    if (!summary) return 0;
    return Object.values(summary.totals.byCategory).reduce(
      (s, c) => s + c,
      0,
    );
  }, [summary]);

  if (loading)
    return <div className="loading">Loading analysis summary...</div>;
  if (error)
    return (
      <div className="error-message">
        Could not load summary. Is the backend running? ({error})
      </div>
    );
  if (!summary) return null;

  function handleCardClick(card: SummaryCard) {
    if (card.category) {
      navigate(`/graph?category=${card.category}`);
    } else if (card.key === "crossrepo") {
      navigate("/graph?view=cross-repo");
    } else if (card.key === "tables") {
      navigate("/graph?view=tables");
    }
  }

  return (
    <div className="guided-landing">
      <div className="guided-landing__header">
        <h2>Analysis Summary</h2>
        <p className="text-muted">
          {summary.repositories.length} repositories &middot;{" "}
          {summary.totals.files} files &middot; {summary.totals.functions}{" "}
          functions
        </p>
      </div>

      {/* Summary cards */}
      <div className="summary-cards">
        {cards.map((card) => (
          <button
            key={card.key}
            className="summary-card"
            onClick={() => handleCardClick(card)}
          >
            <div className="summary-card__count">{card.count}</div>
            <div className="summary-card__label">{card.label}</div>
            <div className="summary-card__subtitle">{card.subtitle}</div>
            <span className="summary-card__arrow">&rarr;</span>
          </button>
        ))}
      </div>

      {/* Category breakdown */}
      <section className="guided-landing__section">
        <h3>Category Breakdown</h3>
        <div className="category-bars">
          {Object.entries(summary.totals.byCategory).map(
            ([category, count]) => {
              const pct =
                totalFunctions > 0
                  ? ((count / totalFunctions) * 100).toFixed(1)
                  : "0";
              return (
                <div key={category} className="category-bar">
                  <span className="category-bar__label">{category}</span>
                  <div className="category-bar__track">
                    <div
                      className="category-bar__fill"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          CATEGORY_COLORS[category as FunctionCategory] ??
                          "#6b7280",
                      }}
                    />
                  </div>
                  <span className="category-bar__count">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            },
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="guided-landing__section">
        <h3>Quick Actions</h3>
        <div className="quick-actions">
          <button className="btn" onClick={() => navigate("/files")}>
            Browse Files
          </button>
          <button className="btn" onClick={() => navigate("/graph")}>
            View Repository Graph
          </button>
          <button className="btn" onClick={() => navigate("/endpoints")}>
            Find Endpoint
          </button>
          <button className="btn" onClick={() => navigate("/flow")}>
            Trace a Flow
          </button>
        </div>
      </section>

      {/* Per-repository breakdown */}
      <section className="guided-landing__section">
        <h3>Per-Repository Breakdown</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th>Files</th>
              <th>Functions</th>
              <th>Endpoints</th>
              <th>DB Calls</th>
              <th>UI</th>
              <th>Cross-Repo</th>
            </tr>
          </thead>
          <tbody>
            {summary.repositories.map((repo) => (
              <tr
                key={repo.name}
                className="repo-row--clickable"
                onClick={() =>
                  navigate(`/graph?repo=${encodeURIComponent(repo.name)}`)
                }
              >
                <td>
                  <strong>{repo.name}</strong>{" "}
                  <span className="badge badge--sm">{repo.language}</span>
                </td>
                <td>{repo.fileCount}</td>
                <td>{repo.functionCount}</td>
                <td>{repo.endpointCount}</td>
                <td>{repo.dbCallCount}</td>
                <td>{repo.uiInteractionCount}</td>
                <td>{repo.crossRepoConnectionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
