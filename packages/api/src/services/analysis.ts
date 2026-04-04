import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { runQuery } from "./neo4j.js";
import { detectLanguage } from "./language-detect.js";

export interface RepoStep {
  repo: string;
  status: "pending" | "running" | "completed" | "failed";
  language: string;
  fileCount: number | null;
  error?: string;
}

export interface AnalysisProgress {
  currentRepo: string | null;
  completedRepos: number;
  totalRepos: number;
  currentStep: string;
  steps: RepoStep[];
}

export interface AnalysisResult {
  functionCount: number;
  fileCount: number;
  endpointCount: number;
  crossRepoLinks: number;
}

export interface AnalysisRun {
  runId: string;
  projectName: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  progress: AnalysisProgress;
  result: AnalysisResult | null;
}

const runs = new Map<string, AnalysisRun>();

export function getRunStatus(runId: string): AnalysisRun | undefined {
  return runs.get(runId);
}

/**
 * Find the project root directory (where the top-level package.json lives).
 */
function findProjectRoot(): string {
  // In production: packages/api/dist/services/analysis.js -> go up 4 levels
  // In dev/test: packages/api/src/services/analysis.ts -> go up 4 levels
  let dir = path.dirname(new URL(import.meta.url).pathname);
  // Walk up until we find a directory that has a "packages" subdirectory
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "packages", "api")) && fs.existsSync(path.join(dir, "packages", "orchestrator"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: 4 levels up from current file
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
}

function getAnalyzerCommand(language: string, repoPath: string, repoName: string, outputPath: string): { cmd: string; args: string[] } {
  const rootDir = findProjectRoot();

  switch (language) {
    case "typescript":
      return {
        cmd: "node",
        args: [
          path.join(rootDir, "analyzers", "js-ts", "dist", "cli.js"),
          "--repo", repoPath,
          "--repo-name", repoName,
          "--output", outputPath,
        ],
      };
    case "python":
      return {
        cmd: "python3",
        args: [
          "-m", "confianalyzer_python",
          "--repo", repoPath,
          "--repo-name", repoName,
          "--output", outputPath,
        ],
      };
    case "go":
      return {
        cmd: path.join(rootDir, "analyzers", "go", "confianalyzer-analyze-go"),
        args: [
          "--repo", repoPath,
          "--repo-name", repoName,
          "--output", outputPath,
        ],
      };
    default:
      throw new Error(`No analyzer available for language: ${language}`);
  }
}

function runAnalyzerProcess(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Analyzer exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn analyzer: ${err.message}`));
    });
  });
}

/**
 * Trigger analysis for a project. Looks up repos from Neo4j, runs analyzers,
 * and feeds results through the orchestrator pipeline.
 */
export async function triggerAnalysis(projectName: string): Promise<AnalysisRun> {
  // Look up project and repositories
  const projectRows = await runQuery(
    "MATCH (p:Project {name: $name}) RETURN p",
    { name: projectName },
  );
  if (projectRows.length === 0) {
    throw new Error(`Project '${projectName}' not found`);
  }

  const repoRows = await runQuery(
    `MATCH (r:Repository)-[:BELONGS_TO]->(p:Project {name: $name})
     RETURN r.name AS name, r.url AS url, r.language AS language`,
    { name: projectName },
  );

  if (repoRows.length === 0) {
    throw new Error(`Project '${projectName}' has no repositories`);
  }

  const repos = repoRows.map((r) => ({
    name: r.name as string,
    path: r.url as string,
    language: r.language as string,
  }));

  const runId = randomUUID();
  const steps: RepoStep[] = repos.map((r) => ({
    repo: r.name,
    status: "pending" as const,
    language: r.language,
    fileCount: null,
  }));

  const run: AnalysisRun = {
    runId,
    projectName,
    status: "pending",
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    progress: {
      currentRepo: null,
      completedRepos: 0,
      totalRepos: repos.length,
      currentStep: "starting",
      steps,
    },
    result: null,
  };
  runs.set(runId, run);

  // Run analysis asynchronously
  void runAnalysisPipeline(run, repos);

  return run;
}

async function runAnalysisPipeline(
  run: AnalysisRun,
  repos: Array<{ name: string; path: string; language: string }>,
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "confianalyzer-"));
  const irPaths = new Map<string, string>();

  try {
    run.status = "running";
    run.progress.currentStep = "analyzing";

    // Run each analyzer sequentially
    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const step = run.progress.steps[i];
      run.progress.currentRepo = repo.name;
      step.status = "running";

      try {
        // Re-detect language from files if needed
        const language = repo.language === "unknown" ? detectLanguage(repo.path) : repo.language;
        step.language = language;

        const outputPath = path.join(tmpDir, `${repo.name}-ir.json`);
        const { cmd, args } = getAnalyzerCommand(language, repo.path, repo.name, outputPath);

        await runAnalyzerProcess(cmd, args);

        // Read the IR to count files
        const irRaw = await readFile(outputPath, "utf-8");
        const irDoc = JSON.parse(irRaw);
        step.fileCount = Array.isArray(irDoc.files) ? irDoc.files.length : 0;

        irPaths.set(repo.name, outputPath);
        step.status = "completed";
        run.progress.completedRepos++;
      } catch (err) {
        step.status = "failed";
        step.error = err instanceof Error ? err.message : String(err);
        // Continue with other repos even if one fails
      }
    }

    // Feed through orchestrator pipeline if we have any IR output
    if (irPaths.size > 0) {
      run.progress.currentStep = "processing";
      run.progress.currentRepo = null;

      // Dynamic import of the orchestrator
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readIrFiles, buildResultFromIr } = await import("../../orchestrator/dist/index.js" as string);
      const irDocuments = readIrFiles(irPaths);
      const pipelineResult = await buildResultFromIr(irDocuments, run.projectName, {
        dryRun: false,
        neo4jUri: process.env.NEO4J_URI ?? "bolt://localhost:7687",
        neo4jUser: process.env.NEO4J_USER ?? "neo4j",
        neo4jPassword: process.env.NEO4J_PASSWORD ?? "password",
        projectName: run.projectName,
      });

      run.result = {
        functionCount: pipelineResult.functions?.length ?? 0,
        fileCount: pipelineResult.files?.length ?? 0,
        endpointCount: pipelineResult.apiEndpoints?.length ?? 0,
        crossRepoLinks: pipelineResult.relationships?.filter(
          (r: { type: string }) => r.type === "CALLS_API"
        ).length ?? 0,
      };

      // Update repo lastAnalyzedAt in Neo4j
      for (const repoName of irPaths.keys()) {
        await runQuery(
          `MATCH (r:Repository {name: $name}) SET r.lastAnalyzedAt = $now, r.status = 'analyzed'`,
          { name: repoName, now: new Date().toISOString() },
        ).catch(() => { /* best effort */ });
      }
    }

    run.status = "completed";
    run.completedAt = new Date().toISOString();
    run.progress.currentStep = "completed";
    run.progress.currentRepo = null;
  } catch (err) {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    run.error = err instanceof Error ? err.message : String(err);
    run.progress.currentStep = "failed";
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
