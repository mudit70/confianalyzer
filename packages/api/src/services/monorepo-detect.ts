import * as fs from "node:fs";
import * as path from "node:path";
import { detectLanguage } from "./language-detect.js";

export interface SubProject {
  name: string;
  relativePath: string;
  absolutePath: string;
  language: string;
  fileCount: number;
}

export interface MonorepoDetectionResult {
  isMonorepo: boolean;
  tool: string | null;
  configFile: string | null;
  subProjects: SubProject[];
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "vendor", "__pycache__", "dist", "build",
  ".next", "venv", ".venv", "target", ".cache", "coverage",
]);

/**
 * Count source files in a directory (non-recursive for speed).
 */
function countSourceFiles(dir: string): number {
  const sourceExts = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rs", ".rb", ".php", ".cs"]);
  let count = 0;
  function walk(d: string, depth: number): void {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        walk(path.join(d, entry.name), depth + 1);
      } else if (entry.isFile()) {
        if (sourceExts.has(path.extname(entry.name).toLowerCase())) {
          count++;
        }
      }
    }
  }
  walk(dir, 0);
  return count;
}

/**
 * Resolve glob-like workspace patterns to actual directories.
 * Supports patterns like "apps/*", "packages/*", "services/**".
 */
function resolveWorkspacePatterns(rootPath: string, patterns: string[]): string[] {
  const dirs: string[] = [];
  for (const pattern of patterns) {
    const hasGlob = pattern.includes("*");
    // Strip trailing /** or /*
    const cleanPattern = pattern.replace(/\/?\*\*?$/, "").replace(/\/?\*$/, "");

    if (hasGlob) {
      // Pattern like "apps/*" — list child directories of the parent
      const parentDir = path.join(rootPath, cleanPattern);
      if (fs.existsSync(parentDir)) {
        try {
          const entries = fs.readdirSync(parentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
              dirs.push(path.join(parentDir, entry.name));
            }
          }
        } catch {
          // skip unreadable dirs
        }
      }
    } else {
      // Exact path like "packages/shared"
      const fullPath = path.join(rootPath, cleanPattern);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        dirs.push(fullPath);
      }
    }
  }
  return dirs;
}

/**
 * Build SubProject entries from resolved directory paths.
 */
function buildSubProjects(rootPath: string, dirs: string[]): SubProject[] {
  const subProjects: SubProject[] = [];
  for (const dir of dirs) {
    const relativePath = path.relative(rootPath, dir);
    const fileCount = countSourceFiles(dir);
    if (fileCount === 0) continue; // Skip empty directories
    const language = detectLanguage(dir);
    const name = relativePath.replace(/\//g, "-");
    subProjects.push({ name, relativePath, absolutePath: dir, language, fileCount });
  }
  return subProjects.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Detect monorepo structure by scanning for workspace configuration files.
 */
export function detectMonorepoStructure(rootPath: string): MonorepoDetectionResult {
  const noResult: MonorepoDetectionResult = {
    isMonorepo: false, tool: null, configFile: null, subProjects: [],
  };

  // 1. pnpm workspaces
  const pnpmWorkspace = path.join(rootPath, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspace)) {
    try {
      const content = fs.readFileSync(pnpmWorkspace, "utf-8");
      // Simple YAML parsing for packages list — handles "  - 'apps/*'" format
      const patterns: string[] = [];
      let inPackages = false;
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (/^packages\s*:/.test(trimmed)) {
          inPackages = true;
          continue;
        }
        if (inPackages) {
          if (trimmed.startsWith("-")) {
            const value = trimmed.slice(1).trim().replace(/^['"]|['"]$/g, "");
            if (value) patterns.push(value);
          } else if (trimmed && !trimmed.startsWith("#")) {
            inPackages = false;
          }
        }
      }
      if (patterns.length > 0) {
        const dirs = resolveWorkspacePatterns(rootPath, patterns);
        const subProjects = buildSubProjects(rootPath, dirs);
        if (subProjects.length > 1) {
          return { isMonorepo: true, tool: "pnpm", configFile: "pnpm-workspace.yaml", subProjects };
        }
      }
    } catch {
      // Fall through
    }
  }

  // 2. npm/yarn workspaces (package.json)
  const packageJson = path.join(rootPath, "package.json");
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
      const workspaces: string[] | undefined =
        Array.isArray(pkg.workspaces) ? pkg.workspaces :
        Array.isArray(pkg.workspaces?.packages) ? pkg.workspaces.packages :
        undefined;
      if (workspaces && workspaces.length > 0) {
        const dirs = resolveWorkspacePatterns(rootPath, workspaces);
        const subProjects = buildSubProjects(rootPath, dirs);
        if (subProjects.length > 1) {
          const tool = fs.existsSync(path.join(rootPath, "yarn.lock")) ? "yarn" : "npm";
          return { isMonorepo: true, tool, configFile: "package.json", subProjects };
        }
      }
    } catch {
      // Fall through
    }
  }

  // 3. Lerna
  const lernaJson = path.join(rootPath, "lerna.json");
  if (fs.existsSync(lernaJson)) {
    try {
      const lerna = JSON.parse(fs.readFileSync(lernaJson, "utf-8"));
      const patterns: string[] = lerna.packages ?? ["packages/*"];
      const dirs = resolveWorkspacePatterns(rootPath, patterns);
      const subProjects = buildSubProjects(rootPath, dirs);
      if (subProjects.length > 1) {
        return { isMonorepo: true, tool: "lerna", configFile: "lerna.json", subProjects };
      }
    } catch {
      // Fall through
    }
  }

  // 4. Cargo workspaces
  const cargoToml = path.join(rootPath, "Cargo.toml");
  if (fs.existsSync(cargoToml)) {
    try {
      const content = fs.readFileSync(cargoToml, "utf-8");
      if (content.includes("[workspace]")) {
        const membersMatch = content.match(/members\s*=\s*\[([^\]]+)\]/);
        if (membersMatch) {
          const patterns = membersMatch[1]
            .split(",")
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
            .filter(Boolean);
          const dirs = resolveWorkspacePatterns(rootPath, patterns);
          const subProjects = buildSubProjects(rootPath, dirs);
          if (subProjects.length > 1) {
            return { isMonorepo: true, tool: "cargo", configFile: "Cargo.toml", subProjects };
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  // 5. Go workspaces
  const goWork = path.join(rootPath, "go.work");
  if (fs.existsSync(goWork)) {
    try {
      const content = fs.readFileSync(goWork, "utf-8");
      const patterns: string[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("use ") && !trimmed.startsWith("use (")) {
          patterns.push(trimmed.slice(4).trim());
        } else if (/^\t/.test(line) || /^  /.test(line)) {
          const val = trimmed.replace(/^\.\//, "");
          if (val && !val.startsWith("//") && !val.startsWith(")")) {
            patterns.push(val);
          }
        }
      }
      if (patterns.length > 0) {
        const dirs = resolveWorkspacePatterns(rootPath, patterns);
        const subProjects = buildSubProjects(rootPath, dirs);
        if (subProjects.length > 1) {
          return { isMonorepo: true, tool: "go", configFile: "go.work", subProjects };
        }
      }
    } catch {
      // Fall through
    }
  }

  // 6. Fallback heuristic — look for common monorepo directory patterns
  const heuristicParents = ["apps", "packages", "services", "libs", "modules"];
  const heuristicDirs: string[] = [];
  for (const parent of heuristicParents) {
    const parentDir = path.join(rootPath, parent);
    if (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(parentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
            heuristicDirs.push(path.join(parentDir, entry.name));
          }
        }
      } catch {
        // skip
      }
    }
  }
  if (heuristicDirs.length > 1) {
    const subProjects = buildSubProjects(rootPath, heuristicDirs);
    if (subProjects.length > 1) {
      return { isMonorepo: true, tool: "heuristic", configFile: null, subProjects };
    }
  }

  return noResult;
}
