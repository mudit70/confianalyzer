/**
 * Intermediate Representation (IR) types.
 *
 * Every language parser transforms a Tree-Sitter AST into these
 * language-neutral IR nodes (P1 — Deterministic Analysis).  The shared IR
 * is what the analysis pipeline, cross-file resolution, and cross-repo
 * stitching all operate on.
 */

import { FunctionCategory, HttpMethod } from "./enums.js";

// ---------------------------------------------------------------------------
// Base IR node
// ---------------------------------------------------------------------------

/** Discriminant tag for each IR node kind. */
export type IRNodeKind =
  | "function"
  | "call"
  | "import"
  | "export"
  | "class"
  | "method"
  | "parameter";

/** Source location within a file. */
export interface SourceLocation {
  /** 1-based line number */
  readonly startLine: number;
  /** 1-based line number */
  readonly endLine: number;
  /** 0-based column offset */
  readonly startColumn: number;
  /** 0-based column offset */
  readonly endColumn: number;
}

/**
 * Base interface shared by every IR node.
 *
 * All nodes carry a `kind` discriminant so consumers can narrow with a
 * simple `switch` on `node.kind`.
 */
export interface IRNodeBase {
  /** Discriminant tag. */
  readonly kind: IRNodeKind;

  /** Absolute file path the node was parsed from. */
  readonly filePath: string;

  /** Position of the node in the source file. */
  readonly location: SourceLocation;
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

/** A single parameter of a function or method. */
export interface IRParameter extends IRNodeBase {
  readonly kind: "parameter";

  /** Parameter name as written in source. */
  readonly name: string;

  /** Type annotation if present (e.g. `string`, `int`, `User`). */
  readonly typeAnnotation?: string;

  /** Whether the parameter has a default value. */
  readonly hasDefault: boolean;

  /** Whether this is a rest / variadic parameter. */
  readonly isRest: boolean;
}

// ---------------------------------------------------------------------------
// Functions & methods
// ---------------------------------------------------------------------------

/**
 * A top-level or module-scoped function.
 *
 * Arrow functions, function expressions assigned to a name, and
 * traditional function declarations all produce `IRFunction` nodes.
 */
export interface IRFunction extends IRNodeBase {
  readonly kind: "function";

  /** Function name. Anonymous functions use `"<anonymous>"`. */
  readonly name: string;

  /** Full signature string (e.g. `"fetchUser(id: string): Promise<User>"`). */
  readonly signature: string;

  /** Ordered parameter list. */
  readonly parameters: readonly IRParameter[];

  /** Return type annotation if present. */
  readonly returnType?: string;

  /** Whether the function is exported from its module. */
  readonly isExported: boolean;

  /** Whether the function is async. */
  readonly isAsync: boolean;

  /** Category assigned during the categorization pipeline step. */
  category?: FunctionCategory;

  /**
   * If this function is an API endpoint handler, the HTTP method and route
   * are captured here during categorization.
   */
  readonly endpointInfo?: {
    readonly method: HttpMethod;
    readonly path: string;
  };

  /** Framework-specific enrichments added by plugins (P5). */
  enrichments?: FrameworkEnrichment[];
}

/**
 * A method defined inside a class body.
 *
 * Carries the same information as `IRFunction` plus class context.
 */
export interface IRMethod extends IRNodeBase {
  readonly kind: "method";

  /** Method name. */
  readonly name: string;

  /** Fully-qualified name: `ClassName.methodName`. */
  readonly qualifiedName: string;

  /** Full signature string. */
  readonly signature: string;

  /** Ordered parameter list. */
  readonly parameters: readonly IRParameter[];

  /** Return type annotation if present. */
  readonly returnType?: string;

  /** Whether the method is static. */
  readonly isStatic: boolean;

  /** Visibility modifier if present. */
  readonly accessibility?: "public" | "protected" | "private";

  /** Whether the method is async. */
  readonly isAsync: boolean;

  /** Category assigned during the categorization pipeline step. */
  category?: FunctionCategory;

  /** Framework-specific enrichments added by plugins (P5). */
  enrichments?: FrameworkEnrichment[];
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * A function or method call expression found inside a function body.
 *
 * This is the raw call-site data used to build the per-file call graph
 * (pipeline step 1).
 */
export interface IRCall extends IRNodeBase {
  readonly kind: "call";

  /**
   * The callee expression as written in source.
   *
   * Examples: `"fetchUser"`, `"this.validate"`, `"axios.get"`,
   * `"db.query"`.
   */
  readonly callee: string;

  /** Number of arguments at the call site. */
  readonly argumentCount: number;

  /**
   * If the call is on a member expression, the object part.
   * E.g. for `router.get(...)` this would be `"router"`.
   */
  readonly receiver?: string;

  /**
   * If the call is on a member expression, the method part.
   * E.g. for `router.get(...)` this would be `"get"`.
   */
  readonly method?: string;

  /** References to named identifiers passed as call arguments (e.g., function names). */
  readonly argumentRefs?: readonly string[];

  /** String literal values from arguments (e.g., route paths like '/users'). */
  readonly stringArgs?: readonly string[];

  /**
   * The fully-qualified name of the enclosing function that contains
   * this call.  Set during cross-file resolution (pipeline step 3).
   */
  enclosingFunction?: string;

  /** Framework-specific enrichments added by plugins (P5). */
  enrichments?: FrameworkEnrichment[];
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

/** A single imported symbol binding. */
export interface ImportedSymbol {
  /** The exported name from the source module. */
  readonly name: string;

  /** Local alias if renamed (e.g. `import { foo as bar }`). */
  readonly alias?: string;
}

/**
 * A module import statement.
 *
 * Covers default imports, named imports, namespace imports, and
 * side-effect-only imports across all supported languages.
 */
export interface IRImport extends IRNodeBase {
  readonly kind: "import";

  /** The module specifier as written in source (e.g. `"./utils"`, `"express"`). */
  readonly modulePath: string;

  /** Resolved absolute path after import resolution. Set in pipeline step 2. */
  resolvedPath?: string;

  /** Whether the import targets an external (node_modules / third-party) package. */
  readonly isExternal: boolean;

  /** Individual named symbols imported. Empty for namespace / side-effect imports. */
  readonly symbols: readonly ImportedSymbol[];

  /** Name of the default import binding, if any. */
  readonly defaultImport?: string;

  /** Name of the namespace import binding (e.g. `import * as utils`), if any. */
  readonly namespaceImport?: string;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * A module export statement.
 *
 * Covers named exports, default exports, and re-exports.
 */
export interface IRExport extends IRNodeBase {
  readonly kind: "export";

  /** Exported symbol name. `"default"` for default exports. */
  readonly name: string;

  /** Local name if different from the exported name. */
  readonly localName?: string;

  /** Whether this is the default export. */
  readonly isDefault: boolean;

  /** If this is a re-export, the source module specifier. */
  readonly fromModule?: string;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/**
 * A class declaration or expression.
 *
 * Methods within the class are represented as separate `IRMethod` nodes
 * and are **not** nested inside this node — they reference the class via
 * `IRMethod.qualifiedName`.
 */
export interface IRClass extends IRNodeBase {
  readonly kind: "class";

  /** Class name. Anonymous classes use `"<anonymous>"`. */
  readonly name: string;

  /** Superclass name if the class extends another. */
  readonly superClass?: string;

  /** Implemented interface names (TypeScript / Java). */
  readonly implements: readonly string[];

  /** Whether the class is exported from its module. */
  readonly isExported: boolean;

  /** Whether the class is abstract (TypeScript / Java). */
  readonly isAbstract: boolean;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

/** Discriminated union of all IR node types. */
export type IRNode =
  | IRFunction
  | IRCall
  | IRImport
  | IRExport
  | IRClass
  | IRMethod
  | IRParameter;

// ---------------------------------------------------------------------------
// Framework enrichment (P5)
// ---------------------------------------------------------------------------

/** Metadata added by framework plugins to IR nodes. */
export interface FrameworkEnrichment {
  /** Plugin that produced this enrichment. */
  readonly pluginName: string;

  /** For route handlers: HTTP method + path. */
  readonly route?: {
    readonly method: string;
    readonly path: string;
  };

  /** For ORM calls: table/collection name and operation. */
  readonly dbOperation?: {
    readonly table: string;
    readonly operation: "read" | "write" | "delete" | "transaction";
  };

  /** For HTTP client calls: target URL pattern and method. */
  readonly httpCall?: {
    readonly method: string;
    readonly urlPattern: string;
  };

  /** For component rendering: child component names. */
  readonly renders?: readonly string[];

  /** For middleware: order in chain. */
  readonly middlewareOrder?: number;

  /** Suggested category override from the plugin. */
  readonly suggestedCategory?: FunctionCategory;
}
