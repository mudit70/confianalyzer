// ─── IR Types (mirrored from @confianalyzer/ir-contract) ───

export interface IrDocument {
  $schema: "confianalyzer-ir-v1";
  version: string;
  generatedAt: string;
  analyzer: AnalyzerMeta;
  repository: RepositoryMeta;
  files: FileIR[];
}

export interface AnalyzerMeta {
  name: string;
  version: string;
  language: string;
}

export interface RepositoryMeta {
  name: string;
  rootPath: string;
}

export interface SourceLocation {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface FileIR {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  hash: string;
  functions: FunctionIR[];
  calls: CallIR[];
  imports: ImportIR[];
  exports: ExportIR[];
  classes: ClassIR[];
  enrichments?: FileEnrichment[];
}

export interface FunctionIR {
  kind: "function";
  name: string;
  qualifiedName: string | null;
  signature: string;
  parameters: ParameterIR[];
  returnType: string | null;
  isExported: boolean;
  isAsync: boolean;
  isStatic?: boolean;
  accessibility?: "public" | "protected" | "private" | null;
  location: SourceLocation;
  endpointInfo?: EndpointInfo | null;
  enrichments?: Enrichment[];
}

export interface ParameterIR {
  name: string;
  typeAnnotation: string | null;
  hasDefault: boolean;
  isRest: boolean;
}

export interface CallIR {
  kind: "call";
  callee: string;
  receiver: string | null;
  method: string | null;
  argumentCount: number;
  argumentRefs?: string[];
  stringArgs?: string[];
  enclosingFunction: string | null;
  location: SourceLocation;
  enrichments?: Enrichment[];
}

export interface ImportIR {
  kind: "import";
  modulePath: string;
  resolvedPath: string | null;
  isExternal: boolean;
  symbols: ImportedSymbolIR[];
  defaultImport: string | null;
  namespaceImport: string | null;
  location: SourceLocation;
}

export interface ImportedSymbolIR {
  name: string;
  alias: string | null;
}

export interface ExportIR {
  kind: "export";
  name: string;
  localName: string | null;
  isDefault: boolean;
  fromModule: string | null;
  location: SourceLocation;
}

export interface ClassIR {
  kind: "class";
  name: string;
  superClass: string | null;
  implements: string[];
  isExported: boolean;
  isAbstract: boolean;
  methods: string[];
  location: SourceLocation;
}

export interface EndpointInfo {
  method: string;
  path: string;
}

export interface Enrichment {
  pluginName: string;
  route: RouteInfo | null;
  dbOperation: DbOperationInfo | null;
  httpCall: HttpCallInfo | null;
  renders: string[] | null;
  middlewareOrder: number | null;
  suggestedCategory: string | null;
}

export interface RouteInfo {
  method: string;
  path: string;
}

export interface DbOperationInfo {
  table: string;
  operation: "read" | "write" | "delete" | "transaction";
}

export interface HttpCallInfo {
  method: string;
  urlPattern: string;
}

export interface FileEnrichment {
  pluginName: string;
  isPage?: boolean;
  pageRoute?: string | null;
  isLayout?: boolean;
  componentName?: string | null;
}

// ─── Orchestrator Types ───

export interface ProjectConfig {
  projectName: string;
  analyzers: Record<string, AnalyzerConfig>;
  repositories: RepoConfig[];
}

export interface AnalyzerConfig {
  command: string;
  extensions: string[];
}

export interface RepoConfig {
  name: string;
  path: string;
}

export interface PipelineOptions {
  dryRun: boolean;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  projectName?: string;
  incrementalDir?: string;
}

export interface AnalyzerAssignment {
  repoName: string;
  repoPath: string;
  analyzerCommand: string;
  outputPath: string;
}

export interface ProjectNode {
  id: string;
  name: string;
  createdAt: string;
}

export interface RepositoryNode {
  id: string;
  url: string;
  name: string;
  language: string;
  lastAnalyzedAt: string;
}

export interface FileNode {
  id: string;
  path: string;
  language: string;
  hash: string;
  repoName: string;
}

export interface FunctionNode {
  id: string;
  name: string;
  signature: string;
  category: string;
  startLine: number;
  endLine: number;
  filePath: string;
  repoName: string;
}

export interface ApiEndpointNode {
  id: string;
  method: string;
  path: string;
  fullRoute: string;
}

export interface DbTableNode {
  id: string;
  name: string;
  schema: string | null;
}

export interface Relationship {
  type: string;
  fromId: string;
  toId: string;
  properties: Record<string, unknown>;
}

export type FunctionCategory =
  | "UI_INTERACTION"
  | "HANDLER"
  | "API_CALLER"
  | "API_ENDPOINT"
  | "DB_CALL"
  | "UTILITY";

export interface ResolvedCall {
  callerId: string;
  targetId: string;
  callSite: number;
}

export interface ApiCaller {
  functionId: string;
  httpMethod: string;
  urlPattern: string;
  repoName: string;
}

export interface ApiEndpoint {
  functionId: string;
  httpMethod: string;
  routePath: string;
  repoName: string;
}

export interface CrossRepoLink {
  callerId: string;
  endpointId: string;
  httpMethod: string;
  urlPattern: string;
  matchConfidence: "exact" | "suffix" | "parameterized" | "version-stripped";
}

export interface PipelineResult {
  projects: ProjectNode[];
  repositories: RepositoryNode[];
  files: FileNode[];
  functions: FunctionNode[];
  apiEndpoints: ApiEndpointNode[];
  dbTables: DbTableNode[];
  relationships: Relationship[];
  cypherStatements: string[];
}
