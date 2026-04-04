import { useState } from "react";
import type { GraphNode } from "../types/graph";
import { CATEGORY_COLORS, type FunctionCategory } from "../types/graph";
import SourceViewer from "./SourceViewer";

interface FunctionCardProps {
  node: GraphNode;
  fileId?: string;
}

export default function FunctionCard({ node, fileId }: FunctionCardProps) {
  const [showSource, setShowSource] = useState(false);
  const category = node.category as FunctionCategory | undefined;
  const categoryColor = category ? (CATEGORY_COLORS[category] ?? "#6b7280") : "#6b7280";
  const meta = node.metadata;

  const startLine =
    "startLine" in meta && typeof meta.startLine === "number" ? meta.startLine : undefined;
  const endLine =
    "endLine" in meta && typeof meta.endLine === "number" ? meta.endLine : undefined;

  return (
    <div className="function-card">
      <div className="function-card__header">
        <h3 className="function-card__name">{node.label}</h3>
        {category && (
          <span
            className="badge"
            style={{ backgroundColor: categoryColor }}
          >
            {category}
          </span>
        )}
      </div>

      <dl className="function-card__details">
        <dt>Type</dt>
        <dd>{node.type}</dd>

        {"signature" in meta && meta.signature != null && (
          <>
            <dt>Signature</dt>
            <dd>
              <code>{String(meta.signature)}</code>
            </dd>
          </>
        )}

        {"filePath" in meta && meta.filePath != null && (
          <>
            <dt>File</dt>
            <dd>{String(meta.filePath)}</dd>
          </>
        )}

        {"startLine" in meta && meta.startLine !== undefined && (
          <>
            <dt>Lines</dt>
            <dd>
              {String(meta.startLine)}&ndash;{String(meta.endLine)}
            </dd>
          </>
        )}

        {"repoName" in meta && meta.repoName != null && (
          <>
            <dt>Repository</dt>
            <dd>{String(meta.repoName)}</dd>
          </>
        )}

        {"method" in meta && meta.method != null && (
          <>
            <dt>Endpoint</dt>
            <dd>
              <span className="badge badge--method">{String(meta.method)}</span>{" "}
              {String(("path" in meta && meta.path) || ("fullRoute" in meta && meta.fullRoute) || "")}
            </dd>
          </>
        )}
      </dl>

      {fileId && node.type === "function" && (
        <button
          className="btn btn--sm"
          style={{ marginTop: "8px" }}
          onClick={() => setShowSource(true)}
        >
          View Source
        </button>
      )}

      {showSource && fileId && (
        <SourceViewer
          fileId={fileId}
          startLine={startLine}
          endLine={endLine}
          onClose={() => setShowSource(false)}
        />
      )}
    </div>
  );
}
