import { Router, type Request, type Response, type NextFunction } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runQuery } from "../services/neo4j.js";
import { ApiError } from "../middleware/error-handler.js";

const router = Router();

// ─── Function Neighbors ───

/**
 * GET /api/functions/:id/neighbors?depth=1
 * Returns the function and its callers/callees as a graph.
 */
router.get(
  "/functions/:id/neighbors",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const depth = Math.min(Number(req.query.depth) || 1, 5);

      const rows = await runQuery(
        `MATCH (fn:Function {id: $id})
         OPTIONAL MATCH (fn)-[:CALLS*1..${depth}]->(callee:Function)
         OPTIONAL MATCH (caller:Function)-[:CALLS*1..${depth}]->(fn)
         OPTIONAL MATCH (fn)-[:DEFINED_IN]->(f:File)
         OPTIONAL MATCH (fn)-[:EXPOSES]->(ep:APIEndpoint)
         RETURN fn, collect(DISTINCT callee) AS callees, collect(DISTINCT caller) AS callers,
                f, collect(DISTINCT ep) AS endpoints`,
        { id },
      );

      if (rows.length === 0) {
        throw new ApiError(404, `Function '${id}' not found`);
      }

      const row = rows[0];
      const fn = row.fn as Record<string, unknown>;
      const callers = (row.callers as Record<string, unknown>[]) ?? [];
      const callees = (row.callees as Record<string, unknown>[]) ?? [];
      const file = row.f as Record<string, unknown> | null;
      const endpoints = (row.endpoints as Record<string, unknown>[]) ?? [];

      // Build graph nodes and edges
      const nodesMap = new Map<string, Record<string, unknown>>();
      const edges: Record<string, unknown>[] = [];

      // Center function
      nodesMap.set(fn.id as string, toFunctionNode(fn));

      // File node
      if (file) {
        nodesMap.set(file.id as string, {
          id: file.id,
          label: file.path,
          type: "file",
          metadata: { language: file.language, hash: file.hash },
        });
        edges.push({
          id: `${fn.id}-DEFINED_IN-${file.id}`,
          source: fn.id,
          target: file.id,
          type: "DEFINED_IN",
          properties: {},
        });
      }

      // Endpoint nodes
      for (const ep of endpoints) {
        if (!ep || !(ep.id)) continue;
        nodesMap.set(ep.id as string, {
          id: ep.id,
          label: `${ep.method} ${ep.path}`,
          type: "endpoint",
          metadata: { method: ep.method, path: ep.path, fullRoute: ep.fullRoute },
        });
        edges.push({
          id: `${fn.id}-EXPOSES-${ep.id}`,
          source: fn.id,
          target: ep.id,
          type: "EXPOSES",
          properties: {},
        });
      }

      // Callers
      for (const caller of callers) {
        if (!caller || !(caller.id)) continue;
        nodesMap.set(caller.id as string, toFunctionNode(caller));
        edges.push({
          id: `${caller.id}-CALLS-${fn.id}`,
          source: caller.id,
          target: fn.id,
          type: "CALLS",
          properties: {},
        });
      }

      // Callees
      for (const callee of callees) {
        if (!callee || !(callee.id)) continue;
        nodesMap.set(callee.id as string, toFunctionNode(callee));
        edges.push({
          id: `${fn.id}-CALLS-${callee.id}`,
          source: fn.id,
          target: callee.id,
          type: "CALLS",
          properties: {},
        });
      }

      res.json({
        nodes: [...nodesMap.values()],
        edges,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Flow Tracing ───

/**
 * GET /api/functions/:id/trace?direction=callers|callees
 */
router.get(
  "/functions/:id/trace",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const direction = req.query.direction as string;
      if (direction !== "callers" && direction !== "callees") {
        throw new ApiError(400, "direction must be 'callers' or 'callees'");
      }

      const cypher =
        direction === "callees"
          ? `MATCH path = (start:Function {id: $id})-[:CALLS*1..10]->(target:Function)
             RETURN path, length(path) AS depth
             ORDER BY depth`
          : `MATCH path = (caller:Function)-[:CALLS*1..10]->(start:Function {id: $id})
             RETURN path, length(path) AS depth
             ORDER BY depth`;

      const rows = await runQuery(cypher, { id });

      const flowPaths = rows.map((row) => {
        const segments = row.path as Array<{
          start: Record<string, unknown>;
          relationship: Record<string, unknown>;
          end: Record<string, unknown>;
        }>;
        const nodes = new Map<string, Record<string, unknown>>();
        const edges: Record<string, unknown>[] = [];

        if (Array.isArray(segments)) {
          for (const seg of segments) {
            const startNode = seg.start as Record<string, unknown>;
            const endNode = seg.end as Record<string, unknown>;
            const rel = seg.relationship as Record<string, unknown>;

            if (startNode?.id) nodes.set(startNode.id as string, toFunctionNode(startNode));
            if (endNode?.id) nodes.set(endNode.id as string, toFunctionNode(endNode));

            edges.push({
              id: `${startNode?.id}-CALLS-${endNode?.id}`,
              source: startNode?.id,
              target: endNode?.id,
              type: rel?._type ?? "CALLS",
              properties: {},
            });
          }
        }

        return {
          nodes: [...nodes.values()],
          edges,
          depth: row.depth as number,
        };
      });

      res.json(flowPaths);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Search ───

/**
 * GET /api/search/functions?q=name
 */
router.get(
  "/search/functions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query.q as string;
      if (!q) {
        throw new ApiError(400, "Query parameter 'q' is required");
      }

      const rows = await runQuery(
        `MATCH (fn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository)
         WHERE fn.name CONTAINS $q
         RETURN fn.id AS id, fn.name AS name, fn.signature AS signature,
                fn.category AS category, f.path AS filePath, r.name AS repoName,
                fn.startLine AS startLine, fn.endLine AS endLine
         LIMIT 50`,
        { q },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/search/endpoints?q=path
 */
router.get(
  "/search/endpoints",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query.q as string;
      if (!q) {
        throw new ApiError(400, "Query parameter 'q' is required");
      }

      const rows = await runQuery(
        `MATCH (ep:APIEndpoint)<-[:EXPOSES]-(fn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository)
         WHERE ep.path CONTAINS $q OR ep.fullRoute CONTAINS $q
         RETURN ep.id AS id, ep.method AS method, ep.path AS path,
                ep.fullRoute AS fullRoute, fn.name AS handlerName, r.name AS repoName
         LIMIT 50`,
        { q },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Files ───

/**
 * GET /api/files/:id — file details with functions
 */
router.get(
  "/files/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const rows = await runQuery(
        `MATCH (f:File {id: $id})-[:IN_REPO]->(r:Repository)
         OPTIONAL MATCH (fn:Function)-[:DEFINED_IN]->(f)
         OPTIONAL MATCH (f)-[imp:IMPORTS]->(:File)
         RETURN f, r.name AS repoName,
                collect(DISTINCT fn {.id, .name, .signature, .category, .startLine, .endLine}) AS functions,
                count(DISTINCT imp) AS importCount`,
        { id },
      );

      if (rows.length === 0) {
        throw new ApiError(404, `File '${id}' not found`);
      }

      const row = rows[0];
      const file = row.f as Record<string, unknown>;
      const fns = (row.functions as Record<string, unknown>[]) ?? [];

      res.json({
        id: file.id,
        path: file.path,
        language: file.language,
        repoName: row.repoName,
        functions: fns.map((fn) => ({
          id: fn.id,
          name: fn.name,
          signature: fn.signature,
          category: fn.category,
          filePath: file.path,
          repoName: row.repoName,
          startLine: fn.startLine,
          endLine: fn.endLine,
        })),
        importCount: row.importCount ?? 0,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/files/:id/source?startLine=N&endLine=M — read source code from disk
 */
router.get(
  "/files/:id/source",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Look up file path and repo root from Neo4j
      const rows = await runQuery(
        `MATCH (f:File {id: $id})-[:IN_REPO]->(r:Repository)
         RETURN f.path AS filePath, r.url AS repoPath`,
        { id },
      );

      if (rows.length === 0) {
        throw new ApiError(404, `File '${id}' not found`);
      }

      const filePath = rows[0].filePath as string;
      const repoPath = rows[0].repoPath as string;

      // Resolve and validate path (prevent traversal attacks)
      const repoRoot = path.resolve(repoPath);
      const resolvedPath = path.resolve(repoRoot, filePath);
      if (!resolvedPath.startsWith(repoRoot + path.sep) && resolvedPath !== repoRoot) {
        throw new ApiError(400, "Invalid file path");
      }

      // Read file from disk
      let content: string;
      try {
        content = await fs.readFile(resolvedPath, "utf-8");
      } catch {
        throw new ApiError(404, "File not found on disk");
      }

      const allLines = content.split("\n");
      const totalLines = allLines.length;

      // Parse and clamp line range
      let startLine = Math.max(Number(req.query.startLine) || 1, 1);
      let endLine = Number(req.query.endLine) || startLine + 100;
      endLine = Math.min(endLine, totalLines);
      startLine = Math.min(startLine, totalLines);

      // Enforce max range of 500 lines
      if (endLine - startLine + 1 > 500) {
        endLine = startLine + 499;
      }

      const selectedLines = allLines.slice(startLine - 1, endLine);

      // Determine language from file extension
      const ext = path.extname(filePath).toLowerCase().replace(".", "");
      const languageMap: Record<string, string> = {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        py: "python",
        go: "go",
        rs: "rust",
        java: "java",
        rb: "ruby",
        php: "php",
        cs: "csharp",
        cpp: "cpp",
        c: "c",
        h: "c",
        hpp: "cpp",
        swift: "swift",
        kt: "kotlin",
        scala: "scala",
        sh: "shell",
        bash: "shell",
        json: "json",
        yaml: "yaml",
        yml: "yaml",
        md: "markdown",
        sql: "sql",
        html: "html",
        css: "css",
      };
      const language = languageMap[ext] ?? ext;

      res.json({
        filePath,
        language,
        startLine,
        endLine,
        content: selectedLines.join("\n"),
        totalLines,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/files/:id/functions — list functions in a file
 */
router.get(
  "/files/:id/functions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const rows = await runQuery(
        `MATCH (fn:Function)-[:DEFINED_IN]->(f:File {id: $id})
         RETURN fn.id AS id, fn.name AS name, fn.signature AS signature,
                fn.category AS category, fn.startLine AS startLine, fn.endLine AS endLine`,
        { id },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Repositories ───

/**
 * GET /api/repositories/:name/files — list files in a repo
 */
router.get(
  "/repositories/:name/files",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await runQuery(
        `MATCH (f:File)-[:IN_REPO]->(r:Repository {name: $name})
         RETURN f.id AS id, f.path AS path, f.language AS language, f.hash AS hash`,
        { name: req.params.name },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Endpoints ───

/**
 * GET /api/endpoints?repo=name — list all API endpoints
 */
router.get(
  "/endpoints",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = (req.query.repo as string) || null;

      const rows = await runQuery(
        `MATCH (ep:APIEndpoint)<-[:EXPOSES]-(fn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository)
         WHERE $repo IS NULL OR r.name = $repo
         RETURN ep.id AS id, ep.method AS method, ep.path AS path,
                ep.fullRoute AS fullRoute, fn.name AS handlerName, r.name AS repoName`,
        { repo },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Neighborhood ───

/**
 * GET /api/graph/node/:id/neighborhood?depth=2&maxNodes=100
 * Returns all nodes and relationships within N hops of the target node.
 */
router.get(
  "/graph/node/:id/neighborhood",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const depth = Math.min(Math.max(Number(req.query.depth) || 2, 1), 3);
      const maxNodes = Math.min(Math.max(parseInt(req.query.maxNodes as string, 10) || 100, 1), 500);

      // Two queries: one for neighbor nodes, one for relationships with app-level IDs
      const nodesCypher = `
        MATCH (center {id: $nodeId})
        OPTIONAL MATCH path = (center)-[*1..${depth}]-(neighbor)
        WHERE neighbor <> center
        WITH center, collect(DISTINCT neighbor)[0..$maxNodes] AS neighbors
        RETURN center, neighbors
      `;

      const relsCypher = `
        MATCH (center {id: $nodeId})
        OPTIONAL MATCH path = (center)-[*1..${depth}]-(neighbor)
        WHERE neighbor <> center
        UNWIND relationships(path) AS rel
        WITH DISTINCT rel, startNode(rel) AS sn, endNode(rel) AS en
        RETURN sn.id AS sourceId, en.id AS targetId, type(rel) AS relType
      `;

      const [nodesRows, relsRows] = await Promise.all([
        runQuery(nodesCypher, { nodeId: id, maxNodes }),
        runQuery(relsCypher, { nodeId: id }),
      ]);

      if (nodesRows.length === 0) {
        throw new ApiError(404, `Node '${id}' not found`);
      }

      const row = nodesRows[0];
      const center = row.center as Record<string, unknown>;
      const neighbors = (row.neighbors as Record<string, unknown>[]) ?? [];

      // Build center node
      const centerNode = toGraphNode(center);

      // Build neighbor nodes
      const nodeDepths: Record<string, number> = {};
      nodeDepths[center.id as string] = 0;

      const nodes: Record<string, unknown>[] = [];
      const nodesSet = new Set<string>([center.id as string]);

      for (const neighbor of neighbors) {
        if (!neighbor || !neighbor.id) continue;
        const nId = neighbor.id as string;
        if (nodesSet.has(nId)) continue;
        nodesSet.add(nId);
        nodes.push(toGraphNode(neighbor));
      }

      // Build edges from relationships query (uses app-level UUIDs)
      const edges: Record<string, unknown>[] = [];
      const edgeSet = new Set<string>();

      for (const rel of relsRows) {
        const sourceId = rel.sourceId as string;
        const targetId = rel.targetId as string;
        const relType = rel.relType as string;
        if (!sourceId || !targetId) continue;
        // Only include edges where both endpoints are in our node set
        if (!nodesSet.has(sourceId) || !nodesSet.has(targetId)) continue;
        const edgeId = `${sourceId}-${relType}-${targetId}`;
        if (edgeSet.has(edgeId)) continue;
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          type: relType,
          properties: {},
        });
      }

      // Compute node depths via BFS on edges
      const adjacency = new Map<string, string[]>();
      for (const edge of edges) {
        const s = edge.source as string;
        const t = edge.target as string;
        if (!adjacency.has(s)) adjacency.set(s, []);
        if (!adjacency.has(t)) adjacency.set(t, []);
        adjacency.get(s)!.push(t);
        adjacency.get(t)!.push(s);
      }

      const queue = [center.id as string];
      const visited = new Set<string>([center.id as string]);
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = nodeDepths[current] ?? 0;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            nodeDepths[neighbor] = currentDepth + 1;
            queue.push(neighbor);
          }
        }
      }

      res.json({
        center: centerNode,
        nodes,
        edges,
        depth,
        nodeDepths,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: Hotspots ───

/**
 * GET /api/graph/insights/:projectName/hotspots?limit=20
 * Returns files with the most inbound imports.
 */
router.get(
  "/graph/insights/:projectName/hotspots",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);

      const rows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[imp:IMPORTS]-(importer:File)
         RETURN f.id AS id, f.path AS path, count(imp) AS importCount
         ORDER BY importCount DESC
         LIMIT $limit`,
        { projectName, limit },
      );

      res.json(
        rows.map((row) => ({
          id: row.id,
          name: row.path,
          path: row.path,
          count: row.importCount,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: High Fan-Out ───

/**
 * GET /api/graph/insights/:projectName/high-fanout?limit=20
 * Returns functions that call the most other functions.
 */
router.get(
  "/graph/insights/:projectName/high-fanout",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);

      const rows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)-[c:CALLS]->()
         RETURN fn.id AS id, fn.name AS name, fn.category AS category, count(c) AS callCount
         ORDER BY callCount DESC
         LIMIT $limit`,
        { projectName, limit },
      );

      res.json(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          count: row.callCount,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Entry-to-Exit Trace ───

/**
 * GET /api/graph/node/:id/entry-to-exit?pruneUtility=true&maxDepth=15
 * Traces from a start node through to terminal nodes (DBTable, DB_CALL, API_ENDPOINT).
 */
router.get(
  "/graph/node/:id/entry-to-exit",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const pruneUtility = req.query.pruneUtility !== "false";
      const maxDepth = Math.min(Math.max(parseInt(req.query.maxDepth as string, 10) || 15, 1), 30);

      const cypher = `
        MATCH (start {id: $startNodeId})
        MATCH path = (start)-[:CALLS|CALLS_API|EXPOSES|READS|WRITES*1..${maxDepth}]->(terminal)
        WHERE terminal:DBTable
           OR (terminal:Function AND terminal.category IN ['DB_CALL', 'API_ENDPOINT'])
           OR terminal:APIEndpoint
        WITH path, [n IN nodes(path) | n] AS pathNodes
        OPTIONAL MATCH (fn)-[:DEFINED_IN]->(f:File) WHERE fn IN pathNodes AND fn:Function
        RETURN path, collect(DISTINCT {fnId: fn.id, filePath: f.path}) AS fileMap
      `;

      const rows = await runQuery(cypher, { startNodeId: id });

      if (rows.length === 0) {
        res.json({ paths: [], fileMap: {} });
        return;
      }

      // Build a global fileMap
      const globalFileMap: Record<string, string> = {};
      const paths: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }[] = [];

      for (const row of rows) {
        const segments = row.path as Array<{
          start: Record<string, unknown>;
          relationship: Record<string, unknown>;
          end: Record<string, unknown>;
        }>;
        const fileMapEntries = row.fileMap as Array<{ fnId: string; filePath: string }>;

        // Collect file map entries
        for (const entry of fileMapEntries) {
          if (entry.fnId && entry.filePath) {
            globalFileMap[entry.fnId] = entry.filePath;
          }
        }

        const nodesMap = new Map<string, Record<string, unknown>>();
        const edges: Record<string, unknown>[] = [];

        if (Array.isArray(segments)) {
          for (const seg of segments) {
            const startNode = seg.start as Record<string, unknown>;
            const endNode = seg.end as Record<string, unknown>;
            const rel = seg.relationship as Record<string, unknown>;

            if (startNode?.id) {
              const node = toGraphNode(startNode);
              if (!pruneUtility || node.category !== "UTILITY") {
                nodesMap.set(startNode.id as string, node);
              }
            }
            if (endNode?.id) {
              const node = toGraphNode(endNode);
              if (!pruneUtility || node.category !== "UTILITY") {
                nodesMap.set(endNode.id as string, node);
              }
            }

            const sourceIncluded = nodesMap.has(startNode?.id as string);
            const targetIncluded = nodesMap.has(endNode?.id as string);

            if (sourceIncluded && targetIncluded) {
              edges.push({
                id: `${startNode?.id}-${rel?._type ?? "CALLS"}-${endNode?.id}`,
                source: startNode?.id,
                target: endNode?.id,
                type: rel?._type ?? "CALLS",
                properties: {},
              });
            }
          }
        }

        if (nodesMap.size > 0) {
          paths.push({
            nodes: [...nodesMap.values()],
            edges,
          });
        }
      }

      res.json({ paths, fileMap: globalFileMap });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Blast Radius ───

/**
 * GET /api/graph/node/:id/blast-radius?maxDepth=10&maxNodes=200
 * Returns all transitive callers of a function (reverse CALLS traversal).
 */
router.get(
  "/graph/node/:id/blast-radius",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const maxDepth = Math.min(Math.max(parseInt(req.query.maxDepth as string, 10) || 10, 1), 30);
      const maxNodes = Math.min(Math.max(parseInt(req.query.maxNodes as string, 10) || 200, 1), 1000);

      const cypher = `
        MATCH (target:Function {id: $id})
        MATCH path = (caller:Function)-[:CALLS*1..${maxDepth}]->(target)
        WITH caller, min(length(path)) AS depth
        OPTIONAL MATCH (caller)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository)
        RETURN caller.id AS id, caller.name AS name, caller.category AS category,
               caller.signature AS signature, f.path AS filePath, r.name AS repoName,
               depth
        ORDER BY depth, caller.name
        LIMIT $maxNodes
      `;

      const rows = await runQuery(cypher, { id, maxNodes });

      const callers = rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        signature: row.signature as string,
        filePath: row.filePath as string,
        repoName: row.repoName as string,
        depth: row.depth as number,
      }));

      const directCallers = callers.filter((c) => c.depth === 1).length;
      const transitiveCallers = callers.filter((c) => c.depth > 1).length;
      const reposAffected = [...new Set(callers.map((c) => c.repoName).filter(Boolean))];
      const maxDepthFound = callers.length > 0 ? Math.max(...callers.map((c) => c.depth)) : 0;

      res.json({
        targetId: id,
        callers,
        summary: {
          directCallers,
          transitiveCallers,
          reposAffected,
          maxDepth: maxDepthFound,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Category Functions ───

/**
 * GET /api/graph/category/:projectName/:category
 * Returns all functions with the given category in the project.
 */
router.get(
  "/graph/category/:projectName/:category",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName, category } = req.params;

      const rows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
         WHERE fn.category = $category
         RETURN fn.id AS id, fn.name AS name, fn.signature AS signature,
                fn.category AS category, f.path AS filePath, r.name AS repoName,
                fn.startLine AS startLine, fn.endLine AS endLine
         LIMIT 200`,
        { projectName, category },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: Cycles ───

/**
 * GET /api/graph/insights/:projectName/cycles?limit=20
 * Detects function-level call cycles (circular dependencies).
 */
router.get(
  "/graph/insights/:projectName/cycles",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);

      const rows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
         MATCH path = (fn)-[:CALLS*2..8]->(fn)
         WITH fn, path, [n IN nodes(path) | n.id] AS nodeIds, [n IN nodes(path) | n.name] AS nodeNames
         RETURN DISTINCT nodeIds, nodeNames, length(path) AS cycleLength
         ORDER BY cycleLength
         LIMIT $limit`,
        { projectName, limit },
      );

      res.json({
        cycles: rows.map((row) => ({
          nodeIds: row.nodeIds,
          nodeNames: row.nodeNames,
          length: row.cycleLength,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: Dead Code ───

/**
 * GET /api/graph/insights/:projectName/dead-code?limit=50
 * Returns functions with zero inbound CALLS edges, excluding known entry points.
 */
router.get(
  "/graph/insights/:projectName/dead-code",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);

      const rows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
         WHERE NOT fn.category IN ['API_ENDPOINT', 'UI_INTERACTION']
           AND NOT EXISTS { (caller:Function)-[:CALLS]->(fn) }
           AND NOT EXISTS { (caller:Function)-[:CALLS_API]->(fn) }
         RETURN fn.id AS id, fn.name AS name, fn.category AS category,
                fn.signature AS signature, f.path AS filePath, r.name AS repoName
         ORDER BY r.name, f.path, fn.name
         LIMIT $limit`,
        { projectName, limit },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: Repo Graph ───

/**
 * GET /api/graph/insights/:projectName/repo-graph
 * Aggregates function-level cross-repo edges into repo-level edges.
 */
router.get(
  "/graph/insights/:projectName/repo-graph",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;

      // Query 1: Get repos with stats
      const repoRows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)
         OPTIONAL MATCH (r)<-[:IN_REPO]-(f:File)
         OPTIONAL MATCH (f)<-[:DEFINED_IN]-(fn:Function)
         RETURN r.id AS id, r.name AS name, r.language AS language,
                count(DISTINCT f) AS fileCount, count(DISTINCT fn) AS functionCount`,
        { projectName },
      );

      // Query 2: Get cross-repo edges
      const edgeRows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r1:Repository)<-[:IN_REPO]-(:File)<-[:DEFINED_IN]-(fn1:Function)-[:CALLS_API]->(fn2:Function)-[:DEFINED_IN]->(:File)-[:IN_REPO]->(r2:Repository)-[:BELONGS_TO]->(p)
         WHERE r1 <> r2
         RETURN r1.name AS sourceName, r2.name AS targetName, count(*) AS connectionCount`,
        { projectName },
      );

      const repos = repoRows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        language: row.language as string,
        fileCount: row.fileCount as number,
        functionCount: row.functionCount as number,
      }));

      const edges = edgeRows.map((row) => ({
        source: row.sourceName as string,
        target: row.targetName as string,
        connectionCount: row.connectionCount as number,
      }));

      res.json({ repos, edges });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: DB Tables ───

/**
 * GET /api/graph/insights/:projectName/tables
 * Returns all DB tables in the project with reader/writer counts.
 */
router.get(
  "/graph/insights/:projectName/tables",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;

      const rows = await runQuery(
        `MATCH (p:Project {name: $projectName})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)-[rel:READS|WRITES]->(t:DBTable)
         WITH t, count(DISTINCT CASE WHEN type(rel) = 'READS' THEN fn END) AS readerCount,
              count(DISTINCT CASE WHEN type(rel) = 'WRITES' THEN fn END) AS writerCount
         RETURN t.id AS id, t.name AS name, readerCount, writerCount
         ORDER BY readerCount + writerCount DESC`,
        { projectName },
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Insights: DB Impact ───

/**
 * GET /api/graph/insights/:projectName/db-impact?table=<tableName>&maxDepth=10
 * Given a table name, find all functions that access it, then trace callers transitively upward.
 */
router.get(
  "/graph/insights/:projectName/db-impact",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectName } = req.params;
      const tableName = req.query.table as string;
      if (!tableName) {
        throw new ApiError(400, "Query parameter 'table' is required");
      }
      const maxDepth = Math.min(Math.max(parseInt(req.query.maxDepth as string, 10) || 10, 1), 20);

      const rows = await runQuery(
        `MATCH (t:DBTable {name: $tableName})<-[rel:READS|WRITES]-(dbFn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository)-[:BELONGS_TO]->(p:Project {name: $projectName})
         WITH dbFn, type(rel) AS operation, f.path AS filePath, r.name AS repoName
         OPTIONAL MATCH path = (caller:Function)-[:CALLS*1..${maxDepth}]->(dbFn)
         WITH dbFn, operation, filePath, repoName, caller, min(length(path)) AS depth
         OPTIONAL MATCH (caller)-[:DEFINED_IN]->(cf:File)-[:IN_REPO]->(cr:Repository)
         RETURN dbFn.id AS dbFnId, dbFn.name AS dbFnName, dbFn.category AS dbFnCategory, operation, filePath, repoName,
                caller.id AS callerId, caller.name AS callerName, caller.category AS callerCategory,
                cf.path AS callerFilePath, cr.name AS callerRepoName, depth
         ORDER BY dbFnName, depth`,
        { tableName, projectName },
      );

      // Build structured response
      const directAccessorsMap = new Map<string, { id: string; name: string; category: string; operation: string; filePath: string; repoName: string }>();
      const transitiveCallersMap = new Map<string, { id: string; name: string; category: string; filePath: string; repoName: string; depth: number }>();

      for (const row of rows) {
        const dbFnId = row.dbFnId as string;
        if (!directAccessorsMap.has(dbFnId)) {
          directAccessorsMap.set(dbFnId, {
            id: dbFnId,
            name: row.dbFnName as string,
            category: (row.dbFnCategory as string) ?? "DB_CALL",
            operation: row.operation as string,
            filePath: row.filePath as string,
            repoName: row.repoName as string,
          });
        }

        const callerId = row.callerId as string | null;
        if (callerId && !transitiveCallersMap.has(callerId)) {
          transitiveCallersMap.set(callerId, {
            id: callerId,
            name: row.callerName as string,
            category: (row.callerCategory as string) ?? "UTILITY",
            filePath: (row.callerFilePath as string) ?? "",
            repoName: (row.callerRepoName as string) ?? "",
            depth: row.depth as number,
          });
        }
      }

      const directAccessors = [...directAccessorsMap.values()];
      const transitiveCallers = [...transitiveCallersMap.values()];
      const endpointsAffected = transitiveCallers.filter((c) => c.category === "API_ENDPOINT").length;
      const reposAffected = [
        ...new Set([
          ...directAccessors.map((a) => a.repoName),
          ...transitiveCallers.map((c) => c.repoName),
        ].filter(Boolean)),
      ];

      res.json({
        tableName,
        directAccessors,
        transitiveCallers,
        summary: {
          directAccessors: directAccessors.length,
          transitiveCallers: transitiveCallers.length,
          endpointsAffected,
          reposAffected,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Helpers ───

function toFunctionNode(fn: Record<string, unknown>): Record<string, unknown> {
  return {
    id: fn.id,
    label: fn.name,
    type: "function",
    category: fn.category,
    metadata: {
      signature: fn.signature,
      startLine: fn.startLine,
      endLine: fn.endLine,
    },
  };
}

function toGraphNode(node: Record<string, unknown>): Record<string, unknown> {
  // Detect node type from labels or properties
  if (node.signature !== undefined || node.category !== undefined) {
    return toFunctionNode(node);
  }
  if (node.method !== undefined && node.path !== undefined) {
    return {
      id: node.id,
      label: `${node.method} ${node.path}`,
      type: "endpoint",
      metadata: { method: node.method, path: node.path, fullRoute: node.fullRoute },
    };
  }
  if (node.language !== undefined && node.path !== undefined) {
    return {
      id: node.id,
      label: node.path,
      type: "file",
      metadata: { language: node.language, hash: node.hash },
    };
  }
  if (node.url !== undefined) {
    return {
      id: node.id,
      label: node.name,
      type: "repository",
      metadata: { url: node.url, language: node.language },
    };
  }
  // Fallback
  return {
    id: node.id,
    label: node.name ?? node.path ?? node.id,
    type: "function",
    metadata: {},
  };
}

export default router;
