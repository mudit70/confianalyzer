import { useState, useEffect, useRef } from "react";
import { apiClient } from "../api/client";
import type { NlpQueryResult, GraphNode, GraphEdge } from "../types/graph";
import SubgraphSummary from "./SubgraphSummary";

interface FilterChip {
  key: string;
  label: string;
  hint: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { key: "frontend", label: "Frontend Only", hint: "only in frontend repositories" },
  { key: "backend", label: "Backend Only", hint: "only in backend repositories" },
  { key: "excludeTests", label: "Exclude Tests", hint: "excluding test files" },
  { key: "dbLayer", label: "DB Layer Only", hint: "only functions with DB_CALL category" },
];

const THINKING_STEPS = [
  "Understanding your question...",
  "Generating Cypher query...",
  "Executing against graph...",
  "Done",
];

export default function QueryBar() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<NlpQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCypher, setShowCypher] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [thinkingStep, setThinkingStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const stepTimerRef = useRef<ReturnType<typeof setInterval>>();

  function toggleFilter(key: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function buildFiltersObject(): { frontendOnly?: boolean; backendOnly?: boolean; excludeTests?: boolean; dbLayerOnly?: boolean } | undefined {
    if (activeFilters.size === 0) return undefined;
    return {
      frontendOnly: activeFilters.has("frontend") || undefined,
      backendOnly: activeFilters.has("backend") || undefined,
      excludeTests: activeFilters.has("excludeTests") || undefined,
      dbLayerOnly: activeFilters.has("dbLayer") || undefined,
    };
  }

  // Advance thinking steps while loading
  useEffect(() => {
    if (loading) {
      setThinkingStep(0);
      stepTimerRef.current = setInterval(() => {
        setThinkingStep((prev) => Math.min(prev + 1, THINKING_STEPS.length - 2));
      }, 800);
    } else {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (result) setThinkingStep(THINKING_STEPS.length - 1);
    }
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [loading, result]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const filters = buildFiltersObject();
      const res = await apiClient.naturalLanguageQuery(query.trim(), filters);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="query-bar">
      <form onSubmit={handleSubmit} className="query-bar__form">
        <input
          type="text"
          className="query-bar__input"
          placeholder="Ask about your codebase..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="query-bar__btn" disabled={loading}>
          {loading ? "..." : "Ask"}
        </button>
      </form>

      {/* Filter chips */}
      <div className="filter-chips">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`filter-chip ${activeFilters.has(chip.key) ? "filter-chip--active" : ""}`}
            onClick={() => toggleFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Thinking indicator */}
      {loading && (
        <div className="thinking-indicator">
          {THINKING_STEPS.map((step, i) => (
            <span
              key={step}
              className={`thinking-step ${
                i < thinkingStep
                  ? "thinking-step--done"
                  : i === thinkingStep
                    ? "thinking-step--active"
                    : "thinking-step--pending"
              }`}
            >
              <span className="thinking-step__dot" />
              {step}
            </span>
          ))}
        </div>
      )}

      {error && <div className="query-bar__error">{error}</div>}

      {result && (
        <div className="query-bar__results">
          <p className="query-bar__explanation">{result.explanation}</p>
          <button
            type="button"
            className="query-bar__toggle"
            onClick={() => setShowCypher(!showCypher)}
          >
            {showCypher ? "Hide Cypher" : "Show Cypher"}
          </button>
          {showCypher && (
            <pre className="query-bar__cypher">{result.cypher}</pre>
          )}
          {result.results.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn--sm query-bar__summarize-btn"
                onClick={() => setShowSummary(true)}
              >
                Summarize results
              </button>
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(result.results[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j}>{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {showSummary && result.results.length > 0 && (
            <SubgraphSummary
              nodes={result.results.map((row, i) => ({
                id: String(row.id ?? `result-${i}`),
                label: String(row.name ?? row.label ?? row.path ?? `Row ${i}`),
                type: (row.type as GraphNode["type"]) ?? "function",
                category: row.category as string | undefined,
                metadata: row,
              } as GraphNode))}
              edges={[] as GraphEdge[]}
              context={`NLP query: ${result.question}`}
              onClose={() => setShowSummary(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
