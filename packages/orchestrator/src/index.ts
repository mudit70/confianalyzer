export { runFederatedPipeline, buildResultFromIr } from "./pipeline.js";
export { discoverAnalyzers } from "./discovery.js";
export { invokeAnalyzers } from "./invoker.js";
export { readIrFiles, readIrDocuments } from "./ir-reader.js";
export { resolveCrossFileConnections, makeFunctionId } from "./cross-file-resolution.js";
export { categorizeFunction } from "./categorizer.js";
export { stitchCrossLanguageApis, normalizePath } from "./stitcher.js";
export { generateCypherStatements, generateParameterizedStatements, writeToNeo4j } from "./graph-writer.js";
export type { CypherStatement } from "./graph-writer.js";

export type {
  ProjectConfig,
  PipelineOptions,
  PipelineResult,
  AnalyzerAssignment,
  ProjectNode,
  RepositoryNode,
  FileNode,
  FunctionNode,
  ApiEndpointNode,
  DbTableNode,
  Relationship,
  FunctionCategory,
  ResolvedCall,
  ApiCaller,
  ApiEndpoint,
  CrossRepoLink,
  IrDocument,
  FileIR,
  FunctionIR,
  CallIR,
  ImportIR,
  ExportIR,
  Enrichment,
} from "./types.js";
