export type {
  IrDocument,
  AnalyzerMeta,
  RepositoryMeta,
  SourceLocation,
  FileIR,
  FunctionIR,
  ParameterIR,
  CallIR,
  ImportIR,
  ImportedSymbolIR,
  ExportIR,
  ClassIR,
  EndpointInfo,
  Enrichment,
  RouteInfo,
  DbOperationInfo,
  HttpCallInfo,
  FileEnrichment,
} from "./types.js";

export { irSchema } from "./schema.js";
export { validateIrDocument } from "./validator.js";
export type { ValidationResult } from "./validator.js";
