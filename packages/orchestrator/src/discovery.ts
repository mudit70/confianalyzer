import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ProjectConfig, AnalyzerAssignment } from "./types.js";

/**
 * Recursively scan a directory for file extensions, skipping node_modules, .git, etc.
 */
function scanExtensions(dirPath: string, extensions: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 10) return extensions;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return extensions;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__" || entry.name === "dist" || entry.name === "build") {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanExtensions(fullPath, extensions, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ext) {
        extensions.add(ext);
      }
    }
  }

  return extensions;
}

/**
 * Step 0: Discover which analyzer to use for each repository.
 * Returns an AnalyzerAssignment[] mapping each repo to its analyzer command and output path.
 */
export function discoverAnalyzers(config: ProjectConfig): AnalyzerAssignment[] {
  const assignments: AnalyzerAssignment[] = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "confianalyzer-"));

  for (const repo of config.repositories) {
    const extensions = scanExtensions(repo.path);

    let matchedAnalyzer: string | null = null;
    let matchedCommand: string | null = null;

    for (const [analyzerName, analyzerConfig] of Object.entries(config.analyzers)) {
      const hasMatch = analyzerConfig.extensions.some((ext) => extensions.has(ext));
      if (hasMatch) {
        matchedAnalyzer = analyzerName;
        matchedCommand = analyzerConfig.command;
        break;
      }
    }

    if (!matchedAnalyzer || !matchedCommand) {
      console.warn(`No analyzer found for repository "${repo.name}", skipping`);
      continue;
    }

    assignments.push({
      repoName: repo.name,
      repoPath: repo.path,
      analyzerCommand: matchedCommand,
      outputPath: path.join(tmpDir, `${repo.name}-ir.json`),
    });
  }

  return assignments;
}
