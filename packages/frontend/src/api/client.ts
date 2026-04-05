import type {
  ProjectSummary,
  GraphData,
  FileDetail,
  FunctionResult,
  SourceCodeResponse,
  EndpointResult,
  FlowPath,
  NlpQueryResult,
  Repository,
  Endpoint,
  FileNode,
  FunctionNode,
  GraphSummaryResponse,
  EntryToExitTrace,
  NeighborhoodResponse,
  InsightItem,
  GraphNode,
  GraphEdge,
  SummarizeResponse,
  ProjectInfo,
  RepositoryInfo,
  AnalysisStatus,
  BlastRadiusResponse,
  CyclesResponse,
  DeadCodeItem,
  RepoGraphResponse,
  DbTableInfo,
  DbImpactResponse,
  MonorepoDetectionResult,
} from "../types/graph";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new ApiError(response.status, `API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  // ─── Project Management ───

  createProject(name: string): Promise<{ id: string; name: string; createdAt: string }> {
    return request("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  listProjects(): Promise<ProjectInfo[]> {
    return request("/projects");
  },

  addRepository(
    projectName: string,
    repo: { name: string; path: string },
  ): Promise<RepositoryInfo> {
    return request(`/projects/${encodeURIComponent(projectName)}/repositories`, {
      method: "POST",
      body: JSON.stringify(repo),
    });
  },

  listRepositories(projectName: string): Promise<RepositoryInfo[]> {
    return request(`/projects/${encodeURIComponent(projectName)}/repositories`);
  },

  detectStructure(repoPath: string): Promise<MonorepoDetectionResult> {
    return request("/projects/detect-structure", {
      method: "POST",
      body: JSON.stringify({ path: repoPath }),
    });
  },

  removeRepository(projectName: string, repoName: string): Promise<void> {
    return request(
      `/projects/${encodeURIComponent(projectName)}/repositories/${encodeURIComponent(repoName)}`,
      { method: "DELETE" },
    );
  },

  // ─── Analysis ───

  runAnalysis(projectName: string): Promise<{ runId: string }> {
    return request("/analysis/run", {
      method: "POST",
      body: JSON.stringify({ projectName }),
    });
  },

  getAnalysisStatus(runId: string): Promise<AnalysisStatus> {
    return request(`/analysis/status/${encodeURIComponent(runId)}`);
  },

  // Dashboard
  getProjectSummary(projectName: string): Promise<ProjectSummary> {
    return request(`/projects/${encodeURIComponent(projectName)}/summary`);
  },

  // Graph exploration
  getFunctionNeighbors(functionId: string, depth = 1): Promise<GraphData> {
    return request(`/functions/${encodeURIComponent(functionId)}/neighbors?depth=${depth}`);
  },

  getFileContents(fileId: string): Promise<FileDetail> {
    return request(`/files/${encodeURIComponent(fileId)}`);
  },

  // Search
  searchFunctions(query: string): Promise<FunctionResult[]> {
    return request(`/search/functions?q=${encodeURIComponent(query)}`);
  },

  searchEndpoints(query: string): Promise<EndpointResult[]> {
    return request(`/search/endpoints?q=${encodeURIComponent(query)}`);
  },

  // Flow tracing
  traceFlow(
    startFunctionId: string,
    direction: "callers" | "callees",
  ): Promise<FlowPath[]> {
    return request(
      `/functions/${encodeURIComponent(startFunctionId)}/trace?direction=${direction}`,
    );
  },

  // NLP query
  naturalLanguageQuery(
    question: string,
    filters?: { frontendOnly?: boolean; backendOnly?: boolean; excludeTests?: boolean; dbLayerOnly?: boolean },
  ): Promise<NlpQueryResult> {
    return request("/query/nlp", {
      method: "POST",
      body: JSON.stringify({ question, filters }),
    });
  },

  // Lists
  getRepositories(projectName: string): Promise<Repository[]> {
    return request(`/projects/${encodeURIComponent(projectName)}/repositories`);
  },

  getEndpoints(repoName?: string): Promise<Endpoint[]> {
    const qs = repoName ? `?repo=${encodeURIComponent(repoName)}` : "";
    return request(`/endpoints${qs}`);
  },

  getFiles(repoName: string): Promise<FileNode[]> {
    return request(`/repositories/${encodeURIComponent(repoName)}/files`);
  },

  getFunctions(fileId: string): Promise<FunctionNode[]> {
    return request(`/files/${encodeURIComponent(fileId)}/functions`);
  },

  getSourceCode(fileId: string, startLine?: number, endLine?: number): Promise<SourceCodeResponse> {
    const params = new URLSearchParams();
    if (startLine !== undefined) params.set("startLine", String(startLine));
    if (endLine !== undefined) params.set("endLine", String(endLine));
    const qs = params.toString();
    return request(`/files/${encodeURIComponent(fileId)}/source${qs ? `?${qs}` : ""}`);
  },

  // ─── Guided Exploration / Investigator Workspace ───

  getGraphSummary(projectName: string): Promise<GraphSummaryResponse> {
    return request(`/graph/summary/${encodeURIComponent(projectName)}`);
  },

  getEntryToExitTrace(
    nodeId: string,
    maxDepth = 15,
    pruneUtility = false,
  ): Promise<EntryToExitTrace> {
    return request(
      `/graph/node/${encodeURIComponent(nodeId)}/entry-to-exit?maxDepth=${maxDepth}&pruneUtility=${pruneUtility}`,
    );
  },

  getNeighborhood(
    nodeId: string,
    depth = 2,
    maxNodes = 100,
  ): Promise<NeighborhoodResponse> {
    return request(
      `/graph/node/${encodeURIComponent(nodeId)}/neighborhood?depth=${depth}&maxNodes=${maxNodes}`,
    );
  },

  getHotspots(projectName: string, limit = 20): Promise<InsightItem[]> {
    return request(
      `/graph/insights/${encodeURIComponent(projectName)}/hotspots?limit=${limit}`,
    );
  },

  getHighFanout(projectName: string, limit = 20): Promise<InsightItem[]> {
    return request(
      `/graph/insights/${encodeURIComponent(projectName)}/high-fanout?limit=${limit}`,
    );
  },

  getCycles(projectName: string, limit = 20): Promise<CyclesResponse> {
    return request(
      `/graph/insights/${encodeURIComponent(projectName)}/cycles?limit=${limit}`,
    );
  },

  getCategoryFunctions(
    projectName: string,
    category: string,
  ): Promise<FunctionResult[]> {
    return request(
      `/graph/category/${encodeURIComponent(projectName)}/${encodeURIComponent(category)}`,
    );
  },

  // ─── Blast Radius ───

  getBlastRadius(
    nodeId: string,
    maxDepth = 10,
    maxNodes = 200,
  ): Promise<BlastRadiusResponse> {
    return request(
      `/graph/node/${encodeURIComponent(nodeId)}/blast-radius?maxDepth=${maxDepth}&maxNodes=${maxNodes}`,
    );
  },

  // ─── Dead Code ───

  getDeadCode(projectName: string, limit = 50): Promise<DeadCodeItem[]> {
    return request(`/graph/insights/${encodeURIComponent(projectName)}/dead-code?limit=${limit}`);
  },

  // ─── Subgraph Summarization ───

  summarizeSubgraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    context?: string,
  ): Promise<SummarizeResponse> {
    return request("/query/nlp/summarize", {
      method: "POST",
      body: JSON.stringify({
        nodes: nodes.map((n) => ({
          id: n.id,
          label: n.label,
          name: n.label,
          type: n.type,
          category: n.category,
        })),
        relationships: edges.map((e) => ({
          type: e.type,
          sourceId: e.source,
          targetId: e.target,
        })),
        context,
      }),
    });
  },

  // ─── Repo Graph ───

  getRepoGraph(projectName: string): Promise<RepoGraphResponse> {
    return request(`/graph/insights/${encodeURIComponent(projectName)}/repo-graph`);
  },

  // ─── DB Impact ───

  getDbTables(projectName: string): Promise<DbTableInfo[]> {
    return request(`/graph/insights/${encodeURIComponent(projectName)}/tables`);
  },

  getDbImpact(projectName: string, tableName: string, maxDepth = 10): Promise<DbImpactResponse> {
    return request(
      `/graph/insights/${encodeURIComponent(projectName)}/db-impact?table=${encodeURIComponent(tableName)}&maxDepth=${maxDepth}`,
    );
  },
};
