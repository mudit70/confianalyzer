import ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { IrDocument, FileIR } from "./types.js";
import { walkFile } from "./ast-walker.js";
import { createDefaultPlugins } from "./framework-plugins/index.js";
import type { ConfiAnalyzerConfig } from "./config.js";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".git",
  ".cache",
  "out",
  "__pycache__",
]);

const VALID_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * Simple glob matcher for include/exclude patterns.
 * Converts a glob pattern to a RegExp.
 */
function globToRegex(pattern: string): RegExp {
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // **/ or ** at end
      if (pattern[i + 2] === "/") {
        regex += "(?:.+/)?";
        i += 3;
      } else {
        regex += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      regex += "[^/]*";
      i++;
    } else if (ch === "?") {
      regex += "[^/]";
      i++;
    } else if (ch === ".") {
      regex += "\\.";
      i++;
    } else {
      regex += ch;
      i++;
    }
  }
  return new RegExp("^" + regex + "$");
}

function matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (globToRegex(pattern).test(relativePath)) {
      return true;
    }
  }
  return false;
}

function discoverFiles(dir: string, config?: ConfiAnalyzerConfig): string[] {
  const results: string[] = [];
  const hasInclude = config && config.include.length > 0;
  const hasExclude = config && config.exclude.length > 0;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (VALID_EXTENSIONS.has(ext)) {
          // Exclude test files and .d.ts by default
          if (
            entry.name.includes(".test.") ||
            entry.name.includes(".spec.") ||
            entry.name.endsWith(".d.ts")
          ) {
            continue;
          }

          // Apply config-based include/exclude filtering
          if (hasInclude || hasExclude) {
            const relativePath = path.relative(dir, fullPath);
            if (hasInclude && !matchesAnyPattern(relativePath, config!.include)) {
              continue;
            }
            if (hasExclude && matchesAnyPattern(relativePath, config!.exclude)) {
              continue;
            }
          }

          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath);
  switch (ext) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
      return "javascript";
    case ".jsx":
      return "jsx";
    default:
      return "javascript";
  }
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function analyzeRepository(
  repoPath: string,
  repoName: string,
  verbose: boolean,
  incrementalPath?: string,
  config?: ConfiAnalyzerConfig
): Promise<IrDocument> {
  const absoluteRepoPath = path.resolve(repoPath);

  if (verbose) {
    console.error(`[info] Discovering files in ${absoluteRepoPath}`);
  }

  // Load previous IR for incremental analysis
  let previousHashes: Map<string, string> | null = null;
  let previousFiles: Map<string, FileIR> | null = null;

  if (incrementalPath) {
    try {
      const prevDoc: IrDocument = JSON.parse(fs.readFileSync(incrementalPath, "utf-8"));
      previousHashes = new Map(prevDoc.files.map((f) => [f.relativePath, f.hash]));
      previousFiles = new Map(prevDoc.files.map((f) => [f.relativePath, f]));
      if (verbose) {
        console.error(`[info] Loaded previous IR with ${prevDoc.files.length} files for incremental analysis`);
      }
    } catch (err) {
      console.error(`[warn] Could not load previous IR from ${incrementalPath}: ${err}`);
    }
  }

  const files = discoverFiles(absoluteRepoPath, config);

  if (verbose) {
    console.error(`[info] Found ${files.length} source files`);
  }

  // Emit progress
  console.log(JSON.stringify({ event: "discovery", fileCount: files.length }));

  // Determine which files need full analysis vs reuse
  const filesToAnalyze: string[] = [];
  const reusedFileIRs: FileIR[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(absoluteRepoPath, filePath);
    const hash = hashFile(filePath);

    if (previousHashes && previousFiles && previousHashes.get(relativePath) === hash) {
      // Hash matches — reuse previous entry
      reusedFileIRs.push(previousFiles.get(relativePath)!);
      if (verbose) {
        console.error(`[info] Reusing cached analysis for ${relativePath}`);
      }
    } else {
      filesToAnalyze.push(filePath);
    }
  }

  if (verbose && previousHashes) {
    console.error(`[info] Incremental: reusing ${reusedFileIRs.length}, re-analyzing ${filesToAnalyze.length}`);
  }

  // Determine compiler options for JSX support
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.React,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    // Attempt to read the repo's tsconfig if it exists
  };

  // Try to load the repo's tsconfig.json (use config option if specified)
  const tsconfigName = config?.options?.tsconfig ? String(config.options.tsconfig) : "tsconfig.json";
  const tsconfigPath = ts.findConfigFile(absoluteRepoPath, ts.sys.fileExists, tsconfigName);
  if (tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
      Object.assign(compilerOptions, parsed.options);
      // Ensure JSX is enabled
      if (!compilerOptions.jsx) {
        compilerOptions.jsx = ts.JsxEmit.React;
      }
    }
  }

  // Only create program for files that need analysis (but include all files for type resolution)
  const program = ts.createProgram(files, compilerOptions);
  let plugins = createDefaultPlugins();

  // Filter plugins by config if plugins list is specified
  if (config && config.plugins.length > 0) {
    const allowedPlugins = new Set(config.plugins.map((p) => p.toLowerCase()));
    plugins = plugins.filter((p) => allowedPlugins.has(p.name.toLowerCase()));
  }

  const fileIRs: FileIR[] = [...reusedFileIRs];
  let processedCount = reusedFileIRs.length;

  for (const filePath of filesToAnalyze) {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      if (verbose) {
        console.error(`[warn] Could not get source file for ${filePath}`);
      }
      continue;
    }

    try {
      const walkResult = walkFile(sourceFile, program, plugins);
      const stat = fs.statSync(filePath);
      const hash = hashFile(filePath);
      const relativePath = path.relative(absoluteRepoPath, filePath);

      const fileIR: FileIR = {
        path: filePath,
        relativePath,
        language: detectLanguage(filePath),
        size: stat.size,
        hash,
        functions: walkResult.functions,
        calls: walkResult.calls,
        imports: walkResult.imports,
        exports: walkResult.exports,
        classes: walkResult.classes,
      };

      fileIRs.push(fileIR);
      processedCount++;

      if (verbose && processedCount % 50 === 0) {
        console.error(`[info] Processed ${processedCount}/${files.length} files`);
      }
    } catch (err) {
      console.error(`[error] Failed to process ${filePath}: ${err}`);
    }
  }

  console.log(
    JSON.stringify({ event: "complete", filesProcessed: processedCount, totalFiles: files.length })
  );

  return {
    $schema: "confianalyzer-ir-v1",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    analyzer: {
      name: "@confianalyzer/js-ts-analyzer",
      version: "0.1.0",
      language: "typescript",
    },
    repository: {
      name: repoName,
      rootPath: absoluteRepoPath,
    },
    files: fileIRs,
  };
}
