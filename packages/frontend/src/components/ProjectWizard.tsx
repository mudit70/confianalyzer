import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import type { RepositoryInfo, AnalysisStatus, MonorepoSubProject } from "../types/graph";

type WizardStep = "create" | "repos" | "analyzing" | "done";

export default function ProjectWizard() {
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>("create");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repo management
  const [repoName, setRepoName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [addingRepo, setAddingRepo] = useState(false);

  // Monorepo detection
  const [detecting, setDetecting] = useState(false);
  const [detectedSubProjects, setDetectedSubProjects] = useState<MonorepoSubProject[]>([]);
  const [selectedSubProjects, setSelectedSubProjects] = useState<Set<string>>(new Set());
  const [monorepoTool, setMonorepoTool] = useState<string | null>(null);
  const [monorepoConfigFile, setMonorepoConfigFile] = useState<string | null>(null);
  const [addingMonorepo, setAddingMonorepo] = useState(false);

  // Analysis
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleCreate() {
    if (!projectName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiClient.createProject(projectName.trim());
      setStep("repos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddRepo() {
    if (!repoName.trim() || !repoPath.trim()) return;
    setAddingRepo(true);
    setError(null);
    try {
      const repo = await apiClient.addRepository(projectName, {
        name: repoName.trim(),
        path: repoPath.trim(),
      });
      setRepositories((prev) => [...prev, repo]);
      setRepoName("");
      setRepoPath("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add repository");
    } finally {
      setAddingRepo(false);
    }
  }

  async function handleDetectStructure() {
    if (!repoPath.trim()) return;
    setDetecting(true);
    setError(null);
    setDetectedSubProjects([]);
    setSelectedSubProjects(new Set());
    setMonorepoTool(null);
    setMonorepoConfigFile(null);
    try {
      const result = await apiClient.detectStructure(repoPath.trim());
      if (result.isMonorepo && result.subProjects.length > 0) {
        setDetectedSubProjects(result.subProjects);
        setSelectedSubProjects(new Set(result.subProjects.map((sp) => sp.relativePath)));
        setMonorepoTool(result.tool);
        setMonorepoConfigFile(result.configFile);
      } else {
        // Not a monorepo — add as single repo
        if (!repoName.trim()) {
          // Auto-generate name from path
          const pathName = repoPath.trim().split("/").pop() ?? "repo";
          setRepoName(pathName);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect structure");
    } finally {
      setDetecting(false);
    }
  }

  function toggleSubProject(relativePath: string) {
    setSelectedSubProjects((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }

  async function handleAddSelectedSubProjects() {
    setAddingMonorepo(true);
    setError(null);
    try {
      const rootPath = repoPath.trim();
      const selected = detectedSubProjects.filter((sp) => selectedSubProjects.has(sp.relativePath));
      for (const sp of selected) {
        const repo = await apiClient.addRepository(projectName, {
          name: sp.name,
          path: sp.absolutePath,
        });
        setRepositories((prev) => [...prev, repo]);
      }
      // Clear detection state
      setDetectedSubProjects([]);
      setSelectedSubProjects(new Set());
      setRepoPath("");
      setRepoName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add repositories");
    } finally {
      setAddingMonorepo(false);
    }
  }

  function handleAddAsSingleRepo() {
    // Clear detection and let user add the root path as one repo
    setDetectedSubProjects([]);
    setSelectedSubProjects(new Set());
    const pathName = repoPath.trim().split("/").pop() ?? "repo";
    if (!repoName.trim()) setRepoName(pathName);
    // User can now click "Add" to add it as a single repo
  }

  async function handleRemoveRepo(name: string) {
    setError(null);
    try {
      await apiClient.removeRepository(projectName, name);
      setRepositories((prev) => prev.filter((r) => r.name !== name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove repository");
    }
  }

  async function handleRunAnalysis() {
    if (repositories.length === 0) return;
    setError(null);
    try {
      const { runId } = await apiClient.runAnalysis(projectName);
      setStep("analyzing");

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const status = await apiClient.getAnalysisStatus(runId);
          setAnalysisStatus(status);
          if (status.status === "completed" || status.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (status.status === "completed") {
              setStep("done");
            } else {
              setError(status.error || "Analysis failed");
            }
          }
        } catch {
          // Polling error -- keep trying
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (step === "create") handleCreate();
      else if (step === "repos") handleAddRepo();
    }
  }

  return (
    <div className="wizard" onKeyDown={handleKeyDown}>
      {error && <div className="error-message">{error}</div>}

      {step === "create" && (
        <>
          <h2>Create New Project</h2>
          <div className="wizard__field">
            <label htmlFor="project-name">Project Name</label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., my-checkout-system"
              autoFocus
            />
          </div>
          <button
            className="btn btn--primary"
            onClick={handleCreate}
            disabled={!projectName.trim() || creating}
          >
            {creating ? "Creating..." : "Create Project"}
          </button>
        </>
      )}

      {step === "repos" && (
        <>
          <h2>Project: {projectName}</h2>
          <h3>Add Repositories</h3>

          <div className="wizard__repo-form">
            <input
              placeholder="Repository name"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
            />
            <input
              placeholder="Local path (e.g., /Users/me/code/frontend)"
              value={repoPath}
              onChange={(e) => {
                setRepoPath(e.target.value);
                // Clear detection when path changes
                if (detectedSubProjects.length > 0) {
                  setDetectedSubProjects([]);
                  setSelectedSubProjects(new Set());
                }
              }}
            />
            <button
              className="btn"
              onClick={handleDetectStructure}
              disabled={!repoPath.trim() || detecting}
              title="Check if this path is a monorepo with multiple sub-projects"
            >
              {detecting ? "Detecting..." : "Detect Structure"}
            </button>
            <button
              className="btn"
              onClick={handleAddRepo}
              disabled={!repoName.trim() || !repoPath.trim() || addingRepo}
            >
              {addingRepo ? "Adding..." : "Add"}
            </button>
          </div>

          {/* Monorepo detection results */}
          {detectedSubProjects.length > 0 && (
            <div className="wizard__monorepo-detection" style={{
              border: "1px solid #6366f1",
              borderRadius: "8px",
              padding: "1rem",
              margin: "1rem 0",
              backgroundColor: "rgba(99, 102, 241, 0.05)",
            }}>
              <h4 style={{ margin: "0 0 0.5rem 0", color: "#6366f1" }}>
                Monorepo detected
                {monorepoTool && <span style={{ fontWeight: "normal", color: "#94a3b8" }}> ({monorepoTool} workspace{monorepoConfigFile ? ` — ${monorepoConfigFile}` : ""})</span>}
              </h4>
              <p style={{ margin: "0 0 0.75rem 0", color: "#94a3b8", fontSize: "0.9em" }}>
                Found {detectedSubProjects.length} sub-projects. Select which ones to add as separate repositories for cross-app dependency analysis.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                {detectedSubProjects.map((sp) => (
                  <label key={sp.relativePath} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.5rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor: selectedSubProjects.has(sp.relativePath) ? "rgba(99, 102, 241, 0.1)" : "transparent",
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedSubProjects.has(sp.relativePath)}
                      onChange={() => toggleSubProject(sp.relativePath)}
                    />
                    <span style={{ fontWeight: 500 }}>{sp.relativePath}</span>
                    <span className="badge" style={{ fontSize: "0.75em" }}>{sp.language}</span>
                    <span style={{ color: "#94a3b8", fontSize: "0.85em" }}>{sp.fileCount} files</span>
                  </label>
                ))}
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn--primary"
                  onClick={handleAddSelectedSubProjects}
                  disabled={selectedSubProjects.size === 0 || addingMonorepo}
                >
                  {addingMonorepo
                    ? "Adding..."
                    : `Add ${selectedSubProjects.size} as separate repositories`}
                </button>
                <button
                  className="btn"
                  onClick={handleAddAsSingleRepo}
                >
                  Add as single repository
                </button>
              </div>
            </div>
          )}

          {repositories.length > 0 && (
            <div className="wizard__repo-list">
              {repositories.map((repo) => (
                <div key={repo.name} className="wizard__repo-item">
                  <span className="wizard__repo-name">{repo.name}</span>
                  <span className={`badge badge--lang-${repo.language?.toLowerCase()}`}>
                    {repo.language}
                  </span>
                  <span className="wizard__repo-path">{repo.path}</span>
                  <button
                    onClick={() => handleRemoveRepo(repo.name)}
                    className="wizard__repo-remove"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="wizard__actions">
            <button
              className="btn btn--primary"
              onClick={handleRunAnalysis}
              disabled={repositories.length === 0}
            >
              Analyze {repositories.length}{" "}
              {repositories.length === 1 ? "Repository" : "Repositories"}
            </button>
          </div>
        </>
      )}

      {step === "analyzing" && (
        <>
          <h2>Analyzing: {projectName}</h2>

          {analysisStatus && (
            <div className="wizard__progress">
              {analysisStatus.progress.steps.map((s) => (
                <div key={s.repo} className={`wizard__step wizard__step--${s.status}`}>
                  <span className="wizard__step-icon">
                    {s.status === "completed"
                      ? "\u2713"
                      : s.status === "running"
                        ? "\u27F3"
                        : "\u25CB"}
                  </span>
                  <span className="wizard__step-repo">{s.repo}</span>
                  <span className="wizard__step-lang">({s.language})</span>
                  {s.fileCount != null && (
                    <span className="wizard__step-files">{s.fileCount} files</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!analysisStatus && <div className="loading">Starting analysis...</div>}
        </>
      )}

      {step === "done" && analysisStatus?.result && (
        <>
          <h2>Analysis Complete!</h2>
          <div className="wizard__result">
            <p>
              {analysisStatus.result.functionCount} functions,{" "}
              {analysisStatus.result.fileCount} files,{" "}
              {analysisStatus.result.endpointCount} endpoints
            </p>
            {analysisStatus.result.crossRepoLinks > 0 && (
              <p className="text-muted">
                {analysisStatus.result.crossRepoLinks} cross-repo links discovered
              </p>
            )}
          </div>
          <button className="btn btn--primary" onClick={() => navigate("/")}>
            Explore Dashboard
          </button>
        </>
      )}
    </div>
  );
}
