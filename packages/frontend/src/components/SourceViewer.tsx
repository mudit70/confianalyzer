import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { SourceCodeResponse } from "../types/graph";

interface SourceViewerProps {
  fileId: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  onClose: () => void;
}

const KEYWORDS = new Set([
  "function",
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "import",
  "export",
  "class",
  "interface",
  "type",
  "extends",
  "implements",
  "new",
  "this",
  "super",
  "async",
  "await",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "from",
  "default",
  "yield",
  // Python
  "def",
  "elif",
  "except",
  "lambda",
  "pass",
  "raise",
  "with",
  "as",
  "in",
  "is",
  "not",
  "and",
  "or",
  "None",
  "True",
  "False",
  "self",
  "nonlocal",
  "global",
  // Go
  "func",
  "package",
  "go",
  "chan",
  "select",
  "defer",
  "range",
  "struct",
  "map",
  // Rust
  "fn",
  "pub",
  "mod",
  "use",
  "crate",
  "impl",
  "trait",
  "enum",
  "match",
  "mut",
  "ref",
  "move",
  "where",
]);

function highlightLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    // Check for // comments
    if (line[i] === "/" && line[i + 1] === "/") {
      parts.push(
        <span key={i} style={{ color: "#6b7280" }}>
          {line.slice(i)}
        </span>,
      );
      return parts;
    }

    // Check for # comments (but not #! or #include)
    if (line[i] === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      parts.push(
        <span key={i} style={{ color: "#6b7280" }}>
          {line.slice(i)}
        </span>,
      );
      return parts;
    }

    // Check for strings
    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) {
        if (line[j] === "\\") j++; // skip escaped char
        j++;
      }
      j = Math.min(j + 1, len);
      parts.push(
        <span key={i} style={{ color: "#22c55e" }}>
          {line.slice(i, j)}
        </span>,
      );
      i = j;
      continue;
    }

    // Check for keywords (word boundary match)
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        parts.push(
          <span key={i} style={{ color: "#3b82f6", fontWeight: 600 }}>
            {word}
          </span>,
        );
      } else {
        parts.push(<span key={i}>{word}</span>);
      }
      i = j;
      continue;
    }

    // Regular character
    parts.push(<span key={i}>{line[i]}</span>);
    i++;
  }

  return parts;
}

export default function SourceViewer({
  fileId,
  startLine,
  endLine,
  language,
  onClose,
}: SourceViewerProps) {
  const [data, setData] = useState<SourceCodeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .getSourceCode(fileId, startLine, endLine)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load source code");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, startLine, endLine]);

  const displayLanguage = data?.language ?? language ?? "unknown";
  const lines = data ? data.content.split("\n") : [];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "50%",
        height: "100%",
        backgroundColor: "#1e1e2e",
        color: "#cdd6f4",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.5)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          backgroundColor: "#181825",
          borderBottom: "1px solid #313244",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span
            style={{
              fontSize: "13px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data?.filePath ?? "Loading..."}
          </span>
          <span
            style={{
              backgroundColor: "#45475a",
              color: "#cdd6f4",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {displayLanguage}
          </span>
          {data && (
            <span style={{ fontSize: "11px", color: "#6c7086", flexShrink: 0 }}>
              Lines {data.startLine}-{data.endLine} of {data.totalLines}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#cdd6f4",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px 8px",
            borderRadius: "4px",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Close"
        >
          X
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
        {loading && (
          <div style={{ padding: "24px", textAlign: "center", color: "#6c7086" }}>
            Loading source code...
          </div>
        )}

        {error && (
          <div style={{ padding: "24px", textAlign: "center", color: "#f38ba8" }}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <pre
            style={{
              margin: 0,
              padding: "12px 0",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: "13px",
              lineHeight: "1.6",
              tabSize: 2,
            }}
          >
            <code>
              {lines.map((line, idx) => {
                const lineNum = data.startLine + idx;
                return (
                  <div
                    key={lineNum}
                    style={{
                      display: "flex",
                      minHeight: "1.6em",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "56px",
                        textAlign: "right",
                        paddingRight: "16px",
                        color: "#585b70",
                        userSelect: "none",
                        flexShrink: 0,
                      }}
                    >
                      {lineNum}
                    </span>
                    <span style={{ whiteSpace: "pre" }}>
                      {highlightLine(line)}
                    </span>
                  </div>
                );
              })}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
