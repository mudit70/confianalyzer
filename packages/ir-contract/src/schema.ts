const sourceLocationSchema = {
  type: "object",
  properties: {
    startLine: { type: "integer" },
    endLine: { type: "integer" },
    startColumn: { type: "integer" },
    endColumn: { type: "integer" },
  },
  required: ["startLine", "endLine", "startColumn", "endColumn"],
  additionalProperties: false,
} as const;

const routeInfoSchema = {
  type: "object",
  properties: {
    method: { type: "string" },
    path: { type: "string" },
  },
  required: ["method", "path"],
  additionalProperties: false,
} as const;

const dbOperationInfoSchema = {
  type: "object",
  properties: {
    table: { type: "string" },
    operation: { type: "string", enum: ["read", "write", "delete", "transaction"] },
  },
  required: ["table", "operation"],
  additionalProperties: false,
} as const;

const httpCallInfoSchema = {
  type: "object",
  properties: {
    method: { type: "string" },
    urlPattern: { type: "string" },
  },
  required: ["method", "urlPattern"],
  additionalProperties: false,
} as const;

const enrichmentSchema = {
  type: "object",
  properties: {
    pluginName: { type: "string" },
    route: { oneOf: [routeInfoSchema, { type: "null" }] },
    dbOperation: { oneOf: [dbOperationInfoSchema, { type: "null" }] },
    httpCall: { oneOf: [httpCallInfoSchema, { type: "null" }] },
    renders: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
    middlewareOrder: { oneOf: [{ type: "integer" }, { type: "null" }] },
    suggestedCategory: { oneOf: [{ type: "string" }, { type: "null" }] },
  },
  required: [
    "pluginName",
    "route",
    "dbOperation",
    "httpCall",
    "renders",
    "middlewareOrder",
    "suggestedCategory",
  ],
  additionalProperties: false,
} as const;

const endpointInfoSchema = {
  type: "object",
  properties: {
    method: { type: "string" },
    path: { type: "string" },
  },
  required: ["method", "path"],
  additionalProperties: false,
} as const;

const parameterIrSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    typeAnnotation: { oneOf: [{ type: "string" }, { type: "null" }] },
    hasDefault: { type: "boolean" },
    isRest: { type: "boolean" },
  },
  required: ["name", "typeAnnotation", "hasDefault", "isRest"],
  additionalProperties: false,
} as const;

const functionIrSchema = {
  type: "object",
  properties: {
    kind: { type: "string", const: "function" },
    name: { type: "string" },
    qualifiedName: { oneOf: [{ type: "string" }, { type: "null" }] },
    signature: { type: "string" },
    parameters: { type: "array", items: parameterIrSchema },
    returnType: { oneOf: [{ type: "string" }, { type: "null" }] },
    isExported: { type: "boolean" },
    isAsync: { type: "boolean" },
    isStatic: { type: "boolean" },
    accessibility: {
      oneOf: [
        { type: "string", enum: ["public", "protected", "private"] },
        { type: "null" },
      ],
    },
    location: sourceLocationSchema,
    endpointInfo: { oneOf: [endpointInfoSchema, { type: "null" }] },
    enrichments: { type: "array", items: enrichmentSchema },
  },
  required: [
    "kind",
    "name",
    "qualifiedName",
    "signature",
    "parameters",
    "returnType",
    "isExported",
    "isAsync",
    "location",
  ],
  additionalProperties: false,
} as const;

const callIrSchema = {
  type: "object",
  properties: {
    kind: { type: "string", const: "call" },
    callee: { type: "string" },
    receiver: { oneOf: [{ type: "string" }, { type: "null" }] },
    method: { oneOf: [{ type: "string" }, { type: "null" }] },
    argumentCount: { type: "integer" },
    argumentRefs: { type: "array", items: { type: "string" } },
    stringArgs: { type: "array", items: { type: "string" } },
    enclosingFunction: { oneOf: [{ type: "string" }, { type: "null" }] },
    location: sourceLocationSchema,
    enrichments: { type: "array", items: enrichmentSchema },
  },
  required: [
    "kind",
    "callee",
    "receiver",
    "method",
    "argumentCount",
    "enclosingFunction",
    "location",
  ],
  additionalProperties: false,
} as const;

const importedSymbolIrSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    alias: { oneOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["name", "alias"],
  additionalProperties: false,
} as const;

const importIrSchema = {
  type: "object",
  properties: {
    kind: { type: "string", const: "import" },
    modulePath: { type: "string" },
    resolvedPath: { oneOf: [{ type: "string" }, { type: "null" }] },
    isExternal: { type: "boolean" },
    symbols: { type: "array", items: importedSymbolIrSchema },
    defaultImport: { oneOf: [{ type: "string" }, { type: "null" }] },
    namespaceImport: { oneOf: [{ type: "string" }, { type: "null" }] },
    location: sourceLocationSchema,
  },
  required: [
    "kind",
    "modulePath",
    "resolvedPath",
    "isExternal",
    "symbols",
    "defaultImport",
    "namespaceImport",
    "location",
  ],
  additionalProperties: false,
} as const;

const exportIrSchema = {
  type: "object",
  properties: {
    kind: { type: "string", const: "export" },
    name: { type: "string" },
    localName: { oneOf: [{ type: "string" }, { type: "null" }] },
    isDefault: { type: "boolean" },
    fromModule: { oneOf: [{ type: "string" }, { type: "null" }] },
    location: sourceLocationSchema,
  },
  required: ["kind", "name", "localName", "isDefault", "fromModule", "location"],
  additionalProperties: false,
} as const;

const classIrSchema = {
  type: "object",
  properties: {
    kind: { type: "string", const: "class" },
    name: { type: "string" },
    superClass: { oneOf: [{ type: "string" }, { type: "null" }] },
    implements: { type: "array", items: { type: "string" } },
    isExported: { type: "boolean" },
    isAbstract: { type: "boolean" },
    methods: { type: "array", items: { type: "string" } },
    location: sourceLocationSchema,
  },
  required: [
    "kind",
    "name",
    "superClass",
    "implements",
    "isExported",
    "isAbstract",
    "methods",
    "location",
  ],
  additionalProperties: false,
} as const;

const fileEnrichmentSchema = {
  type: "object",
  properties: {
    pluginName: { type: "string" },
    isPage: { type: "boolean" },
    pageRoute: { oneOf: [{ type: "string" }, { type: "null" }] },
    isLayout: { type: "boolean" },
    componentName: { oneOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["pluginName"],
  additionalProperties: false,
} as const;

const fileIrSchema = {
  type: "object",
  properties: {
    path: { type: "string" },
    relativePath: { type: "string" },
    language: { type: "string" },
    size: { type: "integer" },
    hash: { type: "string" },
    functions: { type: "array", items: functionIrSchema },
    calls: { type: "array", items: callIrSchema },
    imports: { type: "array", items: importIrSchema },
    exports: { type: "array", items: exportIrSchema },
    classes: { type: "array", items: classIrSchema },
    enrichments: { type: "array", items: fileEnrichmentSchema },
  },
  required: [
    "path",
    "relativePath",
    "language",
    "size",
    "hash",
    "functions",
    "calls",
    "imports",
    "exports",
    "classes",
  ],
  additionalProperties: false,
} as const;

export const irSchema = {
  $id: "confianalyzer-ir-v1",
  type: "object",
  properties: {
    $schema: { type: "string", const: "confianalyzer-ir-v1" },
    version: { type: "string" },
    generatedAt: { type: "string" },
    analyzer: {
      type: "object",
      properties: {
        name: { type: "string" },
        version: { type: "string" },
        language: { type: "string" },
      },
      required: ["name", "version", "language"],
      additionalProperties: false,
    },
    repository: {
      type: "object",
      properties: {
        name: { type: "string" },
        rootPath: { type: "string" },
      },
      required: ["name", "rootPath"],
      additionalProperties: false,
    },
    files: { type: "array", items: fileIrSchema },
  },
  required: ["$schema", "version", "generatedAt", "analyzer", "repository", "files"],
  additionalProperties: false,
} as const;
