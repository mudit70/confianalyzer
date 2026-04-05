// ─── Project & Repository ───

export interface ProjectSummary {
  name: string;
  repositoryCount: number;
  fileCount: number;
  functionCount: number;
  endpointCount: number;
  dbTableCount: number;
  categoryCounts: Record<string, number>;
  repositories: RepositorySummary[];
}

export interface RepositorySummary {
  name: string;
  language: string;
  fileCount: number;
  functionCount: number;
}

// ─── Graph Data ───

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type NodeType = "function" | "file" | "repository" | "endpoint" | "dbtable";

export type EdgeType =
  | "CALLS"
  | "DEFINED_IN"
  | "IMPORTS"
  | "EXPOSES"
  | "CALLS_API"
  | "READS"
  | "WRITES";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  category?: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  properties: Record<string, unknown>;
}

// ─── Flow Tracing ───

export interface FlowPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

// ─── NLP Query ───

export interface NlpQueryResult {
  question: string;
  cypher: string;
  explanation: string;
  results: Record<string, unknown>[];
}

// ─── Search Results ───

export interface FunctionResult {
  id: string;
  name: string;
  signature: string;
  category: string;
  filePath: string;
  repoName: string;
  startLine: number;
  endLine: number;
}

export interface EndpointResult {
  id: string;
  method: string;
  path: string;
  fullRoute: string;
  handlerName: string;
  repoName: string;
}

// ─── Source Code ───

export interface SourceCodeResponse {
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  totalLines: number;
}

// ─── Detail Views ───

export interface FileDetail {
  id: string;
  path: string;
  language: string;
  repoName: string;
  functions: FunctionResult[];
  importCount: number;
}

export interface Repository {
  id: string;
  name: string;
  url: string;
  language: string;
  lastAnalyzedAt: string | null;
}

export interface Endpoint {
  id: string;
  method: string;
  path: string;
  fullRoute: string;
  handlerName: string;
  repoName: string;
}

export interface FileNode {
  id: string;
  path: string;
  language: string;
  hash: string;
}

export interface FunctionNode {
  id: string;
  name: string;
  signature: string;
  category: string;
  startLine: number;
  endLine: number;
}

// ─── Graph Summary (Guided Exploration) ───

export interface GraphSummaryResponse {
  projectId: string;
  lastAnalyzedAt: string;
  repositories: RepositorySummaryDetailed[];
  totals: {
    files: number;
    functions: number;
    byCategory: Record<string, number>;
    apiEndpoints: number;
    apiCallers: number;
    dbCalls: number;
    uiInteractions: number;
    dbTables: number;
    crossRepoConnections: number;
  };
  topEndpoints: {
    id: string;
    method: string;
    path: string;
    callerCount: number;
  }[];
  topTables: {
    id: string;
    name: string;
    readerCount: number;
    writerCount: number;
  }[];
}

export interface RepositorySummaryDetailed {
  id: string;
  name: string;
  language: string;
  fileCount: number;
  functionCount: number;
  byCategory: Record<string, number>;
  endpointCount: number;
  dbCallCount: number;
  uiInteractionCount: number;
  crossRepoConnectionCount: number;
}

// ─── Cycles ───

export interface CycleInfo {
  nodeIds: string[];
  nodeNames: string[];
  length: number;
}

export interface CyclesResponse {
  cycles: CycleInfo[];
}

// ─── Insights ───

export interface InsightItem {
  id: string;
  name: string;
  path?: string;
  category?: string;
  count: number;
}

// ─── Entry-to-Exit Trace ───

export interface EntryToExitTrace {
  paths: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    fileMap: Record<string, string>;
  }[];
}

export interface CategoryFunctionsResult {
  functions: FunctionResult[];
  category: string;
}

// ─── Neighborhood ───

export interface NeighborhoodResponse {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
  nodeDepths: Record<string, number>;
}

export interface NeighborhoodResult {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
  nodeDepths: Record<string, number>;
}

export interface HotspotItem {
  id: string;
  path: string;
  importCount: number;
}

export interface FanoutItem {
  id: string;
  name: string;
  category: string;
  callCount: number;
}

// ─── Project & Repository Management ───

export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: string;
  repositoryCount: number;
}

export interface RepositoryInfo {
  id: string;
  name: string;
  path: string;
  language: string;
  status: string;
}

export interface AnalysisStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  projectName: string;
  progress: {
    currentRepo?: string;
    completedRepos: number;
    totalRepos: number;
    steps: AnalysisStep[];
  };
  result?: {
    functionCount: number;
    fileCount: number;
    endpointCount: number;
    crossRepoLinks: number;
  };
  error?: string;
}

export interface AnalysisStep {
  repo: string;
  status: "pending" | "running" | "completed" | "failed";
  language: string;
  fileCount: number | null;
}

// ─── Subgraph Summarization ───

export interface SummarizeResponse {
  summary: string;
  keyEntities: string[];
  concerns: string[];
}

// ─── Monorepo Detection ───

export interface MonorepoSubProject {
  name: string;
  relativePath: string;
  absolutePath: string;
  language: string;
  fileCount: number;
}

export interface MonorepoDetectionResult {
  isMonorepo: boolean;
  tool: string | null;
  configFile: string | null;
  subProjects: MonorepoSubProject[];
}

// ─── Blast Radius ───

export interface BlastRadiusCaller {
  id: string;
  name: string;
  category: string;
  signature: string;
  filePath: string;
  repoName: string;
  depth: number;
}

export interface BlastRadiusResponse {
  targetId: string;
  callers: BlastRadiusCaller[];
  summary: {
    directCallers: number;
    transitiveCallers: number;
    reposAffected: string[];
    maxDepth: number;
  };
}

// ─── Dead Code ───

export interface DeadCodeItem {
  id: string;
  name: string;
  category: string;
  signature: string;
  filePath: string;
  repoName: string;
}

// ─── Repo Graph ───

export interface RepoGraphResponse {
  repos: RepoGraphNode[];
  edges: RepoGraphEdge[];
}

export interface RepoGraphNode {
  id: string;
  name: string;
  language: string;
  fileCount: number;
  functionCount: number;
}

export interface RepoGraphEdge {
  source: string;
  target: string;
  connectionCount: number;
}

// ─── DB Impact ───

export interface DbTableInfo {
  id: string;
  name: string;
  readerCount: number;
  writerCount: number;
}

export interface DbImpactResponse {
  tableName: string;
  directAccessors: DbImpactAccessor[];
  transitiveCallers: DbImpactCaller[];
  summary: {
    directAccessors: number;
    transitiveCallers: number;
    endpointsAffected: number;
    reposAffected: string[];
  };
}

export interface DbImpactAccessor {
  id: string;
  name: string;
  category: string;
  operation: string;
  filePath: string;
  repoName: string;
}

export interface DbImpactCaller {
  id: string;
  name: string;
  category: string;
  filePath: string;
  repoName: string;
  depth: number;
}

// ─── Function Categories ───

export type FunctionCategory =
  | "UI_INTERACTION"
  | "HANDLER"
  | "API_CALLER"
  | "API_ENDPOINT"
  | "DB_CALL"
  | "UTILITY";

export const CATEGORY_COLORS: Record<FunctionCategory, string> = {
  UI_INTERACTION: "#22c55e",
  HANDLER: "#8b5cf6",
  API_CALLER: "#3b82f6",
  API_ENDPOINT: "#f97316",
  DB_CALL: "#ef4444",
  UTILITY: "#6b7280",
};

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  function: "#3b82f6",
  file: "#22c55e",
  repository: "#6b7280",
  endpoint: "#f97316",
  dbtable: "#8b5cf6",
};
