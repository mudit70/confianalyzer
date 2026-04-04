import { useEffect, useState, useMemo, useCallback } from "react";
import { apiClient } from "../api/client";
import type { Repository, FileNode as FileNodeType, FunctionNode } from "../types/graph";

interface TreeDir {
  name: string;
  children: Map<string, TreeDir>;
  files: FileNodeType[];
}

function buildTree(files: FileNodeType[]): TreeDir {
  const root: TreeDir = { name: "", children: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    const filename = parts.pop()!;
    let current = root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, children: new Map(), files: [] });
      }
      current = current.children.get(part)!;
    }
    current.files.push({ ...file, path: filename });
  }
  return root;
}

function TreeNode({
  dir,
  depth,
  onFileClick,
}: {
  dir: TreeDir;
  depth: number;
  onFileClick: (file: FileNodeType) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const sortedDirs = useMemo(
    () => [...dir.children.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [dir.children],
  );

  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {dir.name && (
        <div
          className="tree-dir"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="tree-dir__icon">{expanded ? "v" : ">"}</span>
          <span className="tree-dir__name">{dir.name}/</span>
        </div>
      )}
      {expanded && (
        <>
          {sortedDirs.map((child) => (
            <TreeNode
              key={child.name}
              dir={child}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          ))}
          {dir.files
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((file) => (
              <div
                key={file.id}
                className="tree-file"
                style={{ paddingLeft: 16 }}
                onClick={() => onFileClick(file)}
              >
                <span className="tree-file__name">{file.path}</span>
                <span className="badge badge--sm">{file.language}</span>
              </div>
            ))}
        </>
      )}
    </div>
  );
}

export default function FileTree() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNodeType[]>([]);
  const [functions, setFunctions] = useState<FunctionNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNodeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getRepositories("default")
      .then(setRepos)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load repos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setLoading(true);
    setFiles([]);
    setSelectedFile(null);
    apiClient
      .getFiles(selectedRepo)
      .then(setFiles)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load files"))
      .finally(() => setLoading(false));
  }, [selectedRepo]);

  const handleFileClick = useCallback(async (file: FileNodeType) => {
    setSelectedFile(file);
    try {
      const fns = await apiClient.getFunctions(file.id);
      setFunctions(fns);
    } catch {
      setFunctions([]);
    }
  }, []);

  const tree = useMemo(() => buildTree(files), [files]);

  if (loading && repos.length === 0) {
    return <div className="loading">Loading repositories...</div>;
  }
  if (error && repos.length === 0) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="file-tree-page">
      <h2>Files</h2>

      <div className="file-tree-page__repos">
        {repos.map((repo) => (
          <button
            key={repo.name}
            className={`btn ${selectedRepo === repo.name ? "btn--active" : ""}`}
            onClick={() => setSelectedRepo(repo.name)}
          >
            {repo.name}
            <span className="badge badge--sm">{repo.language}</span>
          </button>
        ))}
      </div>

      {loading && <div className="loading">Loading files...</div>}

      <div className="file-tree-page__layout">
        {files.length > 0 && (
          <div className="file-tree-panel">
            <TreeNode dir={tree} depth={0} onFileClick={handleFileClick} />
          </div>
        )}

        {selectedFile && (
          <div className="file-detail-panel">
            <h3>{selectedFile.path}</h3>
            <p className="text-muted">{selectedFile.language}</p>
            {functions.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {functions.map((fn) => (
                    <tr key={fn.id}>
                      <td>{fn.name}</td>
                      <td>
                        <span className="badge">{fn.category}</span>
                      </td>
                      <td>
                        {fn.startLine}&ndash;{fn.endLine}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted">No functions found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
