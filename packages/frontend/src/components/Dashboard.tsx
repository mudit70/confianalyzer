import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import type { ProjectInfo, ProjectSummary } from "../types/graph";
import { CATEGORY_COLORS, type FunctionCategory } from "../types/graph";

const STAT_LABELS: { key: keyof ProjectSummary; label: string }[] = [
  { key: "repositoryCount", label: "Repositories" },
  { key: "fileCount", label: "Files" },
  { key: "functionCount", label: "Functions" },
  { key: "endpointCount", label: "Endpoints" },
  { key: "dbTableCount", label: "DB Tables" },
];

function ProjectSummaryView({ projectName }: { projectName: string }) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .getProjectSummary(projectName)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [projectName]);

  if (loading) return <div className="loading">Loading project summary...</div>;
  if (error || !summary) {
    return (
      <div className="text-muted" style={{ marginTop: "1rem" }}>
        No analysis data yet for this project. Add repositories and run an analysis.
      </div>
    );
  }

  const maxCategoryCount = Math.max(...Object.values(summary.categoryCounts), 1);

  return (
    <>
      <div className="stat-cards">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="stat-card">
            <div className="stat-card__value">{summary[key] as number}</div>
            <div className="stat-card__label">{label}</div>
          </div>
        ))}
      </div>

      <section className="dashboard__section">
        <h3>Function Categories</h3>
        <div className="category-bars">
          {Object.entries(summary.categoryCounts).map(([category, count]) => (
            <div key={category} className="category-bar">
              <span className="category-bar__label">{category}</span>
              <div className="category-bar__track">
                <div
                  className="category-bar__fill"
                  style={{
                    width: `${(count / maxCategoryCount) * 100}%`,
                    backgroundColor:
                      CATEGORY_COLORS[category as FunctionCategory] ?? "#6b7280",
                  }}
                />
              </div>
              <span className="category-bar__count">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard__section">
        <h3>Repositories</h3>
        <div className="repo-list">
          {summary.repositories.map((repo) => (
            <div key={repo.name} className="repo-card">
              <span className="repo-card__name">{repo.name}</span>
              <span className={`badge badge--lang-${repo.language.toLowerCase()}`}>
                {repo.language}
              </span>
              <span className="repo-card__stat">
                {repo.fileCount} files, {repo.functionCount} functions
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listProjects()
      .then((list) => {
        setProjects(list);
        // Auto-select first project if available
        if (list.length > 0) {
          setSelectedProject(list[0].name);
        }
      })
      .catch(() => {
        // If listing fails (e.g. endpoint not ready), show welcome state
        setProjects([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  // Welcome state -- no projects
  if (projects.length === 0) {
    return (
      <div className="dashboard">
        <h2>Welcome to ConfiAnalyzer</h2>
        <p style={{ color: "#6b7280", marginTop: "1rem" }}>
          Create a project to start analyzing your codebase.
        </p>
        <button
          onClick={() => navigate("/new-project")}
          className="btn btn--primary"
          style={{ marginTop: "1.5rem" }}
        >
          + Create New Project
        </button>
      </div>
    );
  }

  // Has projects
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h2>Projects</h2>
        <button onClick={() => navigate("/new-project")} className="btn btn--primary">
          + New Project
        </button>
      </div>

      <div className="project-list">
        {projects.map((p) => (
          <div
            key={p.id}
            className={`project-card${selectedProject === p.name ? " project-card--selected" : ""}`}
            onClick={() => setSelectedProject(p.name)}
          >
            <h3>{p.name}</h3>
            <span className="text-muted">{p.repositoryCount} repositories</span>
            <span className="text-muted">
              {new Date(p.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>

      {selectedProject && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Project: {selectedProject}</h2>
          <ProjectSummaryView projectName={selectedProject} />
        </div>
      )}
    </div>
  );
}
