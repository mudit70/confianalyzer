import { useState, useEffect } from "react";
import { apiClient } from "../api/client";
import type { GraphNode, GraphEdge, SummarizeResponse } from "../types/graph";

interface SubgraphSummaryProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  context?: string;
  onClose: () => void;
}

export default function SubgraphSummary({
  nodes,
  edges,
  context,
  onClose,
}: SubgraphSummaryProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nodes.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    apiClient
      .summarizeSubgraph(nodes, edges, context)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Summarization failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nodes, edges, context]);

  return (
    <div className={`subgraph-summary ${loading ? "subgraph-summary--loading" : ""}`}>
      <div className="subgraph-summary__header">
        <strong>Subgraph Summary</strong>
        <button
          className="btn btn--sm"
          onClick={onClose}
          aria-label="Close summary panel"
        >
          Close
        </button>
      </div>

      <div className="subgraph-summary__body">
        {loading && <p className="text-muted">Generating summary...</p>}
        {error && <p className="query-bar__error">{error}</p>}
        {result && (
          <>
            <p>{result.summary}</p>

            {result.keyEntities.length > 0 && (
              <div className="subgraph-summary__entities">
                <strong>Key entities</strong>
                <div className="subgraph-summary__chips">
                  {result.keyEntities.map((entity) => (
                    <span key={entity} className="badge badge--sm">
                      {entity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.concerns.length > 0 && (
              <div className="subgraph-summary__concerns">
                <strong>Concerns</strong>
                <ul>
                  {result.concerns.map((concern, i) => (
                    <li key={i}>{concern}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
