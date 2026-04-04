import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { runQuery } from "../services/neo4j.js";
import { ApiError } from "../middleware/error-handler.js";
import { detectLanguage } from "../services/language-detect.js";

const router = Router();

/**
 * GET /api/projects — list all projects
 */
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await runQuery(
      `MATCH (p:Project)
       OPTIONAL MATCH (r:Repository)-[:BELONGS_TO]->(p)
       RETURN p, count(r) AS repositoryCount
       ORDER BY p.createdAt DESC`,
    );
    const projects = rows.map((r) => {
      const p = r.p as Record<string, unknown>;
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        repositoryCount: r.repositoryCount ?? 0,
      };
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:name — get a single project
 */
router.get("/:name", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await runQuery("MATCH (p:Project {name: $name}) RETURN p", {
      name: req.params.name,
    });
    if (rows.length === 0) {
      throw new ApiError(404, `Project '${req.params.name}' not found`);
    }
    res.json(rows[0].p);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects — create a new project
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name) {
      throw new ApiError(400, "Project name is required");
    }

    // Check if project already exists
    const existing = await runQuery(
      "MATCH (p:Project {name: $name}) RETURN p",
      { name },
    );
    if (existing.length > 0) {
      throw new ApiError(409, `Project '${name}' already exists`);
    }

    const id = randomUUID();
    const createdAt = Date.now();
    const rows = await runQuery(
      `MERGE (p:Project {name: $name})
       ON CREATE SET p.id = $id, p.createdAt = $createdAt
       RETURN p`,
      { name, id, createdAt },
    );
    const p = rows[0].p as Record<string, unknown>;
    res.status(201).json({ id: p.id, name: p.name, createdAt: p.createdAt });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:name/summary — project summary stats
 */
router.get("/:name/summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectName = req.params.name;

    // Check project exists
    const projectRows = await runQuery(
      "MATCH (p:Project {name: $name}) RETURN p",
      { name: projectName },
    );
    if (projectRows.length === 0) {
      throw new ApiError(404, `Project '${projectName}' not found`);
    }

    // Get summary stats
    const summaryRows = await runQuery(
      `MATCH (p:Project {name: $name})
       OPTIONAL MATCH (r:Repository)-[:BELONGS_TO]->(p)
       OPTIONAL MATCH (f:File)-[:IN_REPO]->(r)
       OPTIONAL MATCH (fn:Function)-[:DEFINED_IN]->(f)
       OPTIONAL MATCH (ep:APIEndpoint)<-[:EXPOSES]-(fn2:Function)-[:DEFINED_IN]->(f2:File)-[:IN_REPO]->(r2:Repository)-[:BELONGS_TO]->(p)
       OPTIONAL MATCH (dt:DBTable)<-[:READS|WRITES]-(fn3:Function)-[:DEFINED_IN]->(f3:File)-[:IN_REPO]->(r3:Repository)-[:BELONGS_TO]->(p)
       RETURN count(DISTINCT r) AS repositoryCount,
              count(DISTINCT f) AS fileCount,
              count(DISTINCT fn) AS functionCount,
              count(DISTINCT ep) AS endpointCount,
              count(DISTINCT dt) AS dbTableCount`,
      { name: projectName },
    );

    // Get category counts
    const categoryRows = await runQuery(
      `MATCH (p:Project {name: $name})<-[:BELONGS_TO]-(r:Repository)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
       RETURN fn.category AS category, count(fn) AS cnt`,
      { name: projectName },
    );
    const categoryCounts: Record<string, number> = {};
    for (const row of categoryRows) {
      if (row.category) {
        categoryCounts[row.category as string] = row.cnt as number;
      }
    }

    // Get repositories
    const repoRows = await runQuery(
      `MATCH (p:Project {name: $name})<-[:BELONGS_TO]-(r:Repository)
       OPTIONAL MATCH (f:File)-[:IN_REPO]->(r)
       OPTIONAL MATCH (fn:Function)-[:DEFINED_IN]->(f)
       RETURN r.name AS name, r.language AS language,
              count(DISTINCT f) AS fileCount, count(DISTINCT fn) AS functionCount`,
      { name: projectName },
    );

    const summary = summaryRows[0] ?? {};
    res.json({
      name: projectName,
      repositoryCount: summary.repositoryCount ?? 0,
      fileCount: summary.fileCount ?? 0,
      functionCount: summary.functionCount ?? 0,
      endpointCount: summary.endpointCount ?? 0,
      dbTableCount: summary.dbTableCount ?? 0,
      categoryCounts,
      repositories: repoRows.map((r) => ({
        name: r.name,
        language: r.language ?? "unknown",
        fileCount: r.fileCount ?? 0,
        functionCount: r.functionCount ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:name/repositories — list repos in a project
 */
router.get("/:name/repositories", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await runQuery(
      `MATCH (r:Repository)-[:BELONGS_TO]->(p:Project {name: $name})
       RETURN r.id AS id, r.name AS name, r.url AS url,
              r.language AS language, r.lastAnalyzedAt AS lastAnalyzedAt,
              r.status AS status`,
      { name: req.params.name },
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        language: r.language ?? "unknown",
        lastAnalyzedAt: r.lastAnalyzedAt ?? null,
        status: r.status ?? "pending",
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:name/repositories — add a repository to a project
 */
router.post("/:name/repositories", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectName = req.params.name;
    const { name: repoName, path: repoPath } = req.body as { name?: string; path?: string };

    if (!repoName) {
      throw new ApiError(400, "Repository name is required");
    }
    if (!repoPath) {
      throw new ApiError(400, "Repository path is required");
    }

    // Validate path exists on disk
    if (!fs.existsSync(repoPath)) {
      throw new ApiError(400, `Path does not exist: ${repoPath}`);
    }

    // Check project exists
    const projectRows = await runQuery(
      "MATCH (p:Project {name: $name}) RETURN p",
      { name: projectName },
    );
    if (projectRows.length === 0) {
      throw new ApiError(404, `Project '${projectName}' not found`);
    }

    // Auto-detect language
    const language = detectLanguage(repoPath);

    const id = randomUUID();
    const rows = await runQuery(
      `MATCH (p:Project {name: $projectName})
       MERGE (r:Repository {name: $repoName})-[:BELONGS_TO]->(p)
       ON CREATE SET r.id = $id, r.url = $path, r.language = $language, r.status = 'pending'
       RETURN r`,
      { projectName, repoName, id, path: repoPath, language },
    );

    const r = rows[0].r as Record<string, unknown>;
    res.status(201).json({
      id: r.id,
      name: r.name,
      path: r.url,
      language: r.language,
      status: r.status ?? "pending",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/projects/:name/repositories/:repoName — remove a repo from a project
 */
router.delete("/:name/repositories/:repoName", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name: projectName, repoName } = req.params;

    // Check the repo exists
    const existing = await runQuery(
      `MATCH (r:Repository {name: $repoName})-[:BELONGS_TO]->(p:Project {name: $projectName})
       RETURN r`,
      { repoName, projectName },
    );
    if (existing.length === 0) {
      throw new ApiError(404, `Repository '${repoName}' not found in project '${projectName}'`);
    }

    // Delete the repository and all related nodes
    await runQuery(
      `MATCH (r:Repository {name: $repoName})-[:BELONGS_TO]->(p:Project {name: $projectName})
       OPTIONAL MATCH (r)<-[:IN_REPO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
       DETACH DELETE fn, f, r`,
      { repoName, projectName },
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
