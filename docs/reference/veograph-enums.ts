/**
 * Shared enums for VeoGraph.
 *
 * These enums are the single source of truth used by parsers, the analysis
 * pipeline, the API layer, the frontend, and the Neo4j schema.
 */

// ---------------------------------------------------------------------------
// Function categories (mirrors the DB schema's Function.category values)
// ---------------------------------------------------------------------------

/** Classification of a function's role within the application architecture. */
export enum FunctionCategory {
  /** Event handlers, user-facing triggers (onClick, onSubmit, etc.) */
  UI_INTERACTION = "UI_INTERACTION",

  /** Request handlers, middleware, route callbacks */
  HANDLER = "HANDLER",

  /** Client-side functions that call external HTTP APIs */
  API_CALLER = "API_CALLER",

  /** Server-side route handlers that expose an HTTP endpoint */
  API_ENDPOINT = "API_ENDPOINT",

  /** Functions that read from or write to a database */
  DB_CALL = "DB_CALL",

  /** Helper / shared / utility functions */
  UTILITY = "UTILITY",
}

// ---------------------------------------------------------------------------
// Relationship types (mirrors Neo4j relationship labels)
// ---------------------------------------------------------------------------

/** All relationship labels used in the Neo4j graph. */
export enum RelationshipType {
  /** Repository → Project */
  BELONGS_TO = "BELONGS_TO",

  /** File → Repository */
  IN_REPO = "IN_REPO",

  /** Function → File */
  DEFINED_IN = "DEFINED_IN",

  /** Function → Function (intra- or cross-file call) */
  CALLS = "CALLS",

  /** File → File (module import) */
  IMPORTS = "IMPORTS",

  /** Function → APIEndpoint (server exposes endpoint) */
  EXPOSES = "EXPOSES",

  /** Function → APIEndpoint (client calls endpoint) */
  CALLS_API = "CALLS_API",

  /** Function → DBTable (SELECT / read operation) */
  READS = "READS",

  /** Function → DBTable (INSERT / UPDATE / DELETE) */
  WRITES = "WRITES",
}

// ---------------------------------------------------------------------------
// HTTP methods
// ---------------------------------------------------------------------------

/** Standard HTTP methods relevant to API endpoint matching. */
export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
  OPTIONS = "OPTIONS",
  HEAD = "HEAD",
}

// ---------------------------------------------------------------------------
// Analysis pipeline status
// ---------------------------------------------------------------------------

/** Status of an analysis run triggered for a project. */
export enum AnalysisStatus {
  /** Analysis has been queued but not yet started */
  PENDING = "PENDING",

  /** Currently cloning / fetching repositories */
  CLONING = "CLONING",

  /** Tree-Sitter parsing and IR generation in progress */
  PARSING = "PARSING",

  /** Cross-file and cross-repo resolution in progress */
  RESOLVING = "RESOLVING",

  /** Writing the graph to Neo4j */
  STORING = "STORING",

  /** Analysis completed successfully */
  COMPLETED = "COMPLETED",

  /** Analysis failed — see `errorMessage` for details */
  FAILED = "FAILED",
}

// ---------------------------------------------------------------------------
// Neo4j node labels
// ---------------------------------------------------------------------------

/** All node labels used in the Neo4j graph. */
export enum NodeLabel {
  PROJECT = "Project",
  REPOSITORY = "Repository",
  FILE = "File",
  FUNCTION = "Function",
  API_ENDPOINT = "APIEndpoint",
  DB_TABLE = "DBTable",
  IMPORT = "Import",
}

// ---------------------------------------------------------------------------
// Supported languages (for parsers / file extensions)
// ---------------------------------------------------------------------------

/** Programming languages supported by the analysis pipeline. */
export enum Language {
  TYPESCRIPT = "typescript",
  JAVASCRIPT = "javascript",
  PYTHON = "python",
  GO = "go",
  JAVA = "java",
  VUE = "vue",
  RUST = "rust",
}

// ---------------------------------------------------------------------------
// AI providers
// ---------------------------------------------------------------------------

/** AI service providers supported for NLP translation. */
export enum AIProvider {
  ANTHROPIC = "anthropic",
  OPENAI = "openai",
  OLLAMA = "ollama",
  LMSTUDIO = "lmstudio",
}
