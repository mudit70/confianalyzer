/**
 * Neo4j graph node and relationship types.
 *
 * These types describe the shape of data stored in and retrieved from
 * the Neo4j database.  They are used by the analysis pipeline (write side)
 * and the API / frontend (read side).
 */

import {
  FunctionCategory,
  HttpMethod,
  NodeLabel,
  RelationshipType,
} from "./enums.js";

// ═══════════════════════════════════════════════════════════════════════════
// Graph Nodes
// ═══════════════════════════════════════════════════════════════════════════

/** Base properties shared by every graph node. */
export interface GraphNodeBase {
  /** Neo4j internal node identity (stringified to avoid bigint issues). */
  readonly id: string;

  /** Node label — used as the discriminant. */
  readonly label: NodeLabel;
}

// ---------------------------------------------------------------------------
// Concrete node types
// ---------------------------------------------------------------------------

/** A project that groups multiple repositories for joint analysis. */
export interface ProjectNode extends GraphNodeBase {
  readonly label: NodeLabel.PROJECT;

  /** Unique human-readable project name. */
  readonly name: string;

  /** ISO-8601 timestamp of creation. */
  readonly createdAt: string;
}

/** A git repository belonging to a project. */
export interface RepositoryNode extends GraphNodeBase {
  readonly label: NodeLabel.REPOSITORY;

  /** Git remote URL (unique within a project). */
  readonly url: string;

  /** Short repository name (derived from URL). */
  readonly name: string;

  /** Primary language of the repository. */
  readonly language?: string;

  /** ISO-8601 timestamp of the last successful analysis. */
  readonly lastAnalyzedAt?: string;
}

/** A single source file within a repository. */
export interface FileNode extends GraphNodeBase {
  readonly label: NodeLabel.FILE;

  /** File path relative to the repository root (unique within a repo). */
  readonly path: string;

  /** Programming language of the file. */
  readonly language: string;

  /** Content hash used for incremental analysis. */
  readonly hash: string;
}

/** A function or method defined in a source file. */
export interface FunctionNode extends GraphNodeBase {
  readonly label: NodeLabel.FUNCTION;

  /** Function / method name. */
  readonly name: string;

  /** Full signature string for display. */
  readonly signature: string;

  /** Architectural category. */
  readonly category: FunctionCategory;

  /** 1-based start line in the source file. */
  readonly startLine: number;

  /** 1-based end line in the source file. */
  readonly endLine: number;
}

/** An HTTP API endpoint exposed by the application. */
export interface APIEndpointNode extends GraphNodeBase {
  readonly label: NodeLabel.API_ENDPOINT;

  /** HTTP method (GET, POST, etc.). */
  readonly method: HttpMethod;

  /** Route path pattern (e.g. `"/users/:id"`). */
  readonly path: string;

  /** Full route including any base prefix (e.g. `"/api/v1/users/:id"`). */
  readonly fullRoute: string;
}

/** A database table referenced in the code. */
export interface DBTableNode extends GraphNodeBase {
  readonly label: NodeLabel.DB_TABLE;

  /** Table name. */
  readonly name: string;

  /** Database schema / namespace if known. */
  readonly schema?: string;
}

/** Discriminated union of all graph node types. */
export type GraphNode =
  | ProjectNode
  | RepositoryNode
  | FileNode
  | FunctionNode
  | APIEndpointNode
  | DBTableNode;

// ═══════════════════════════════════════════════════════════════════════════
// Graph Relationships
// ═══════════════════════════════════════════════════════════════════════════

/** Base properties shared by every graph relationship. */
export interface GraphRelationshipBase {
  /** Neo4j internal relationship identity (stringified). */
  readonly id: string;

  /** Relationship type — used as the discriminant. */
  readonly type: RelationshipType;

  /** ID of the source node. */
  readonly sourceId: string;

  /** ID of the target node. */
  readonly targetId: string;
}

// ---------------------------------------------------------------------------
// Concrete relationship types
// ---------------------------------------------------------------------------

/** Repository → Project: the repository belongs to this project. */
export interface BelongsTo extends GraphRelationshipBase {
  readonly type: RelationshipType.BELONGS_TO;
}

/** File → Repository: the file lives in this repository. */
export interface InRepo extends GraphRelationshipBase {
  readonly type: RelationshipType.IN_REPO;
}

/** Function → File: the function is defined in this file. */
export interface DefinedIn extends GraphRelationshipBase {
  readonly type: RelationshipType.DEFINED_IN;
}

/** Function → Function: one function calls another. */
export interface Calls extends GraphRelationshipBase {
  readonly type: RelationshipType.CALLS;

  /** Line number of the call site in the calling function's file. */
  readonly callSite: number;
}

/** File → File: one file imports another. */
export interface Imports extends GraphRelationshipBase {
  readonly type: RelationshipType.IMPORTS;

  /** Specific symbol names imported. */
  readonly symbols: readonly string[];
}

/** Function → APIEndpoint: a function exposes (serves) this endpoint. */
export interface Exposes extends GraphRelationshipBase {
  readonly type: RelationshipType.EXPOSES;
}

/** Function → APIEndpoint: a function calls this endpoint as a client. */
export interface CallsAPI extends GraphRelationshipBase {
  readonly type: RelationshipType.CALLS_API;

  /** HTTP method used in the call. */
  readonly httpMethod: HttpMethod;

  /** URL pattern matched. */
  readonly urlPattern: string;
}

/** Function → DBTable: the function reads from this table. */
export interface Reads extends GraphRelationshipBase {
  readonly type: RelationshipType.READS;

  /** The query or ORM expression that performs the read. */
  readonly query?: string;
}

/** Function → DBTable: the function writes to this table. */
export interface Writes extends GraphRelationshipBase {
  readonly type: RelationshipType.WRITES;

  /** The query or ORM expression that performs the write. */
  readonly query?: string;
}

/** Discriminated union of all graph relationship types. */
export type GraphRelationship =
  | BelongsTo
  | InRepo
  | DefinedIn
  | Calls
  | Imports
  | Exposes
  | CallsAPI
  | Reads
  | Writes;
