import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import type { RepositoryInfo, AnalysisStatus } from "../types/graph";

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
              onChange={(e) => setRepoPath(e.target.value)}
            />
            <button
              className="btn"
              onClick={handleAddRepo}
              disabled={!repoName.trim() || !repoPath.trim() || addingRepo}
            >
              {addingRepo ? "Adding..." : "Add"}
            </button>
          </div>

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
