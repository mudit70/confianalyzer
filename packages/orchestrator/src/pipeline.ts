import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ProjectConfig,
  PipelineOptions,
  PipelineResult,
  IrDocument,
  ProjectNode,
  RepositoryNode,
  FileNode,
  FunctionNode,
  ApiEndpointNode,
  DbTableNode,
  Relationship,
  ApiCaller,
  ApiEndpoint,
} from "./types.js";
import { discoverAnalyzers } from "./discovery.js";
import { invokeAnalyzers } from "./invoker.js";
import { readIrFiles } from "./ir-reader.js";
import { resolveCrossFileConnections, makeFunctionId } from "./cross-file-resolution.js";
import { categorizeFunction } from "./categorizer.js";
import { stitchCrossLanguageApis } from "./stitcher.js";
import { generateCypherStatements, generateParameterizedStatements, writeToNeo4j } from "./graph-writer.js";

/**
 * Run the full federated analysis pipeline.
 *
 * Steps:
 * 0. Discover analyzers for each repository
 * 1. Invoke analyzers in parallel
 * 2. Read & validate IR JSON output
 * 3. Cross-file resolution (imports -> exports -> CALLS edges)
 * 4. Function categorization
 * 5. Cross-repo API stitching
 * 6. Generate Cypher & optionally write to Neo4j
 */
export async function runFederatedPipeline(
  config: ProjectConfig,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const projectName = options.projectName ?? config.projectName;

  // Step 0: Discover analyzers
  console.log("Step 0: Discovering analyzers...");
  const assignments = discoverAnalyzers(config);
  console.log(`  Found ${assignments.length} analyzer assignment(s)`);

  // Build previous IR paths map for incremental analysis
  let previousIrPaths: Map<string, string> | undefined;
  if (options.incrementalDir) {
    previousIrPaths = new Map<string, string>();
    for (const assignment of assignments) {
      const prevPath = path.join(options.incrementalDir, `${assignment.repoName}-ir.json`);
      if (fs.existsSync(prevPath)) {
        previousIrPaths.set(assignment.repoName, prevPath);
      }
    }
    if (previousIrPaths.size === 0) {
      previousIrPaths = undefined;
    }
  }

  // Step 1: Invoke analyzers
  console.log("Step 1: Invoking analyzers...");
  const irPaths = await invokeAnalyzers(assignments, (stage, msg) => {
    console.log(`  [${stage}] ${msg}`);
  }, previousIrPaths);
  console.log(`  ${irPaths.size} analyzer(s) completed successfully`);

  // Save IR files to incrementalDir for next run
  if (options.incrementalDir) {
    if (!fs.existsSync(options.incrementalDir)) {
      fs.mkdirSync(options.incrementalDir, { recursive: true });
    }
    for (const [repoName, irPath] of irPaths) {
      const destPath = path.join(options.incrementalDir, `${repoName}-ir.json`);
      fs.copyFileSync(irPath, destPath);
    }
  }

  // Step 2: Read & validate IR JSON
  console.log("Step 2: Reading IR JSON...");
  const irDocuments = readIrFiles(irPaths);

  // Build the result from IR documents
  return buildResultFromIr(irDocuments, projectName, options);
}

/**
 * Build a PipelineResult from pre-loaded IR documents.
 * Useful for testing or when IR files are already in memory.
 */
export async function buildResultFromIr(
  irDocuments: Map<string, IrDocument>,
  projectName: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  // Build nodes from IR
  const project: ProjectNode = {
    id: crypto.randomUUID(),
    name: projectName,
    createdAt: new Date().toISOString(),
  };

  const repositories: RepositoryNode[] = [];
  const files: FileNode[] = [];
  const functions: FunctionNode[] = [];
  const apiEndpoints: ApiEndpointNode[] = [];
  const dbTables: DbTableNode[] = [];
  const relationships: Relationship[] = [];

  // Track IDs for relationship building
  const repoIdMap = new Map<string, string>();
  const fileIdMap = new Map<string, string>(); // "repoName::relativePath" -> fileId
  const functionIdMap = new Map<string, string>(); // "repoName::relativePath::funcName" -> funcNodeId
  const dbTableIdMap = new Map<string, string>(); // tableName -> id

  // Collect API callers and endpoints for stitching
  const apiCallers: ApiCaller[] = [];
  const apiEndpointsList: ApiEndpoint[] = [];
  const endpointRouteSet = new Set<string>(); // Dedup: "METHOD::path::funcId"
  // Track category upgrades from call-level enrichments (funcId -> category)
  const callLevelCategories = new Map<string, string>();

  for (const [repoName, doc] of irDocuments) {
    // Repository node
    const repoId = crypto.randomUUID();
    repoIdMap.set(repoName, repoId);
    repositories.push({
      id: repoId,
      url: doc.repository.rootPath,
      name: repoName,
      language: doc.analyzer.language,
      lastAnalyzedAt: new Date().toISOString(),
    });

    for (const file of doc.files) {
      // File node
      const fileId = crypto.randomUUID();
      const fileKey = `${repoName}::${file.relativePath}`;
      fileIdMap.set(fileKey, fileId);
      files.push({
        id: fileId,
        path: file.relativePath,
        language: file.language,
        hash: file.hash,
        repoName,
      });

      // Function nodes
      for (const func of file.functions) {
        const funcKey = makeFunctionId(repoName, file.relativePath, func.name);
        const funcId = crypto.randomUUID();
        functionIdMap.set(funcKey, funcId);

        // Step 4: Categorize
        const category = categorizeFunction(func);

        functions.push({
          id: funcId,
          name: func.name,
          signature: func.signature,
          category,
          startLine: func.location.startLine,
          endLine: func.location.endLine,
          filePath: file.relativePath,
          repoName,
        });

        // API Endpoint nodes
        if (func.endpointInfo) {
          const epId = crypto.randomUUID();
          apiEndpoints.push({
            id: epId,
            method: func.endpointInfo.method,
            path: func.endpointInfo.path,
            fullRoute: func.endpointInfo.path,
          });

          // EXPOSES relationship
          relationships.push({
            type: "EXPOSES",
            fromId: funcId,
            toId: epId,
            properties: {},
          });

          // Collect for stitching
          apiEndpointsList.push({
            functionId: funcId,
            httpMethod: func.endpointInfo.method,
            routePath: func.endpointInfo.path,
            repoName,
          });
        }

        // Enrichment-based endpoints (route info)
        if (func.enrichments) {
          for (const enrichment of func.enrichments) {
            if (enrichment.route && !func.endpointInfo) {
              const epId = crypto.randomUUID();
              apiEndpoints.push({
                id: epId,
                method: enrichment.route.method,
                path: enrichment.route.path,
                fullRoute: enrichment.route.path,
              });
              relationships.push({
                type: "EXPOSES",
                fromId: funcId,
                toId: epId,
                properties: {},
              });
              apiEndpointsList.push({
                functionId: funcId,
                httpMethod: enrichment.route.method,
                routePath: enrichment.route.path,
                repoName,
              });
            }

            // HTTP callers
            if (enrichment.httpCall) {
              apiCallers.push({
                functionId: funcId,
                httpMethod: enrichment.httpCall.method,
                urlPattern: enrichment.httpCall.urlPattern,
                repoName,
              });
            }

            // DB operations
            if (enrichment.dbOperation) {
              const tableName = enrichment.dbOperation.table;
              let tableId = dbTableIdMap.get(tableName);
              if (!tableId) {
                tableId = crypto.randomUUID();
                dbTableIdMap.set(tableName, tableId);
                dbTables.push({
                  id: tableId,
                  name: tableName,
                  schema: null,
                });
              }

              const relType = enrichment.dbOperation.operation === "read" ? "READS" : "WRITES";
              relationships.push({
                type: relType,
                fromId: funcId,
                toId: tableId,
                properties: {},
              });
            }
          }
        }
      }

      // Call-level enrichments: detect endpoints and DB operations from enrichments on calls
      // This handles patterns where the enrichment lands on the call node rather than the function:
      // - Fastify/Express routes with anonymous arrow handlers
      // - Prisma calls like prisma.user.findMany() inside functions
      for (const call of file.calls) {
        if (!call.enrichments) continue;
        const enclosingFuncName = call.enclosingFunction;
        const funcKey = enclosingFuncName ? makeFunctionId(repoName, file.relativePath, enclosingFuncName) : null;
        const funcId = funcKey ? functionIdMap.get(funcKey) : null;

        for (const enrichment of call.enrichments) {
          // Route enrichments → API endpoint nodes
          if (enrichment.route && funcId) {
            const routeKey = `${enrichment.route.method}::${enrichment.route.path}::${funcId}`;
            if (!endpointRouteSet.has(routeKey)) {
              endpointRouteSet.add(routeKey);
              const epId = crypto.randomUUID();
              apiEndpoints.push({
                id: epId,
                method: enrichment.route.method,
                path: enrichment.route.path,
                fullRoute: enrichment.route.path,
              });
              relationships.push({
                type: "EXPOSES",
                fromId: funcId,
                toId: epId,
                properties: {},
              });
              apiEndpointsList.push({
                functionId: funcId,
                httpMethod: enrichment.route.method,
                routePath: enrichment.route.path,
                repoName,
              });
            }
          }

          // DB operation enrichments → DB table nodes + READS/WRITES relationships
          if (enrichment.dbOperation && funcId) {
            const tableName = enrichment.dbOperation.table;
            let tableId = dbTableIdMap.get(tableName);
            if (!tableId) {
              tableId = crypto.randomUUID();
              dbTableIdMap.set(tableName, tableId);
              dbTables.push({
                id: tableId,
                name: tableName,
                schema: null,
              });
            }
            const relType = enrichment.dbOperation.operation === "read" ? "READS" : "WRITES";
            relationships.push({
              type: relType,
              fromId: funcId,
              toId: tableId,
              properties: {},
            });
            // Track for category upgrade
            if (!callLevelCategories.has(funcId)) {
              callLevelCategories.set(funcId, enrichment.suggestedCategory ?? "DB_CALL");
            }
          }
        }
      }

      // IMPORTS relationships (file -> file)
      for (const imp of file.imports) {
        if (imp.isExternal || !imp.resolvedPath) continue;
        // Find target file — try resolvedPath directly, then strip rootPath prefix
        let targetFileId: string | undefined;
        const sourceFileId = fileIdMap.get(fileKey);
        targetFileId = fileIdMap.get(`${repoName}::${imp.resolvedPath}`);
        if (!targetFileId && imp.resolvedPath.startsWith(doc.repository.rootPath)) {
          let stripped = imp.resolvedPath.slice(doc.repository.rootPath.length);
          if (stripped.startsWith("/")) stripped = stripped.slice(1);
          targetFileId = fileIdMap.get(`${repoName}::${stripped}`);
        }
        if (targetFileId && sourceFileId) {
          const symbols = imp.symbols.map((s) => s.alias ?? s.name);
          if (imp.defaultImport) symbols.push(imp.defaultImport);
          if (imp.namespaceImport) symbols.push(`* as ${imp.namespaceImport}`);
          relationships.push({
            type: "IMPORTS",
            fromId: sourceFileId,
            toId: targetFileId,
            properties: { symbols },
          });
        }
      }
    }
  }

  // Upgrade function categories based on call-level enrichments
  // (e.g., functions containing prisma.user.findMany() should be DB_CALL, not UTILITY)
  for (const [funcId, category] of callLevelCategories) {
    const fn = functions.find((f) => f.id === funcId);
    if (fn && fn.category === "UTILITY") {
      fn.category = category;
    }
  }

  // Step 3: Cross-file resolution
  console.log("Step 3: Resolving cross-file connections...");
  const resolvedCalls = resolveCrossFileConnections(irDocuments);
  for (const call of resolvedCalls) {
    const callerNodeId = functionIdMap.get(call.callerId);
    const targetNodeId = functionIdMap.get(call.targetId);
    if (callerNodeId && targetNodeId) {
      relationships.push({
        type: "CALLS",
        fromId: callerNodeId,
        toId: targetNodeId,
        properties: { callSite: call.callSite },
      });
    }
  }
  console.log(`  Resolved ${resolvedCalls.length} cross-file call(s)`);

  // Step 5: Cross-repo stitching
  console.log("Step 5: Stitching cross-repo APIs...");
  const crossRepoLinks = stitchCrossLanguageApis(apiCallers, apiEndpointsList);
  for (const link of crossRepoLinks) {
    // Find the APIEndpoint node for the target
    const epNode = apiEndpoints.find((ep) => {
      // Match by the function that EXPOSES it
      const exposesRel = relationships.find(
        (r) => r.type === "EXPOSES" && r.fromId === link.endpointId
      );
      return exposesRel ? ep.id === exposesRel.toId : false;
    });
    if (epNode) {
      relationships.push({
        type: "CALLS_API",
        fromId: link.callerId,
        toId: epNode.id,
        properties: {
          httpMethod: link.httpMethod,
          urlPattern: link.urlPattern,
        },
      });
    }
  }
  console.log(`  Found ${crossRepoLinks.length} cross-repo link(s)`);

  // Step 6: Generate Cypher
  console.log("Step 6: Generating Cypher...");
  const result: PipelineResult = {
    projects: [project],
    repositories,
    files,
    functions,
    apiEndpoints,
    dbTables,
    relationships,
    cypherStatements: [],
  };

  // Generate parameterized statements for safe Neo4j execution
  const paramStatements = generateParameterizedStatements(result);
  // Also generate legacy string statements for dry-run display / cypherStatements field
  result.cypherStatements = generateCypherStatements(result);
  console.log(`  Generated ${paramStatements.length} Cypher statement(s)`);

  // Write to Neo4j if not dry-run — use parameterized queries for safety
  if (!options.dryRun && options.neo4jUri && options.neo4jUser && options.neo4jPassword) {
    console.log("Writing to Neo4j...");
    await writeToNeo4j(
      paramStatements,
      options.neo4jUri,
      options.neo4jUser,
      options.neo4jPassword,
    );
    console.log("  Done.");
  }

  return result;
}
