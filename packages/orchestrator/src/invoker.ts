import { spawn } from "node:child_process";
import * as readline from "node:readline";
import type { AnalyzerAssignment } from "./types.js";

export type ProgressCallback = (stage: string, message: string, progress: number) => void;

/**
 * Step 1: Invoke analyzers in parallel.
 * Spawns each analyzer as a child process, streams progress from stdout,
 * and returns a map of repoName -> outputPath for successful analyzers.
 */
export async function invokeAnalyzers(
  assignments: AnalyzerAssignment[],
  onProgress?: ProgressCallback,
  previousIrPaths?: Map<string, string>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  const promises = assignments.map(async (assignment) => {
    const [command, ...baseArgs] = assignment.analyzerCommand.split(/\s+/);
    const args = [
      ...baseArgs,
      "--repo", assignment.repoPath,
      "--repo-name", assignment.repoName,
      "--output", assignment.outputPath,
    ];

    // Pass previous IR path for incremental analysis
    const prevIrPath = previousIrPaths?.get(assignment.repoName);
    if (prevIrPath) {
      args.push("--incremental", prevIrPath);
    }

    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    // Stream progress from stdout (JSON Lines)
    const rl = readline.createInterface({ input: proc.stdout });
    for await (const line of rl) {
      try {
        const event = JSON.parse(line) as { event?: string };
        if (onProgress) {
          onProgress("analyzer", `[${assignment.repoName}] ${event.event ?? "progress"}`, 0);
        }
      } catch {
        // Ignore non-JSON lines
      }
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on("close", resolve);
    });

    if (exitCode === 0 || exitCode === 1) {
      results.set(assignment.repoName, assignment.outputPath);
    } else {
      console.error(`Analyzer failed for ${assignment.repoName} (exit ${exitCode})`);
    }
  });

  await Promise.all(promises);
  return results;
}
