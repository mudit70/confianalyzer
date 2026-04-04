import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Detect the dominant programming language in a repository by scanning file extensions.
 * Walks the directory tree (skipping node_modules, .git, vendor, __pycache__, dist, build).
 */
export function detectLanguage(repoPath: string): string {
  const counts: Record<string, number> = {};
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "vendor",
    "__pycache__",
    "dist",
    "build",
    ".next",
    "venv",
    ".venv",
  ]);

  const extToLang: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "typescript",
    ".jsx": "typescript",
    ".py": "python",
    ".go": "go",
    ".java": "java",
    ".rs": "rust",
  };

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const lang = extToLang[ext];
        if (lang) {
          counts[lang] = (counts[lang] ?? 0) + 1;
        }
      }
    }
  }

  walk(repoPath);

  let dominant = "unknown";
  let maxCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = lang;
    }
  }

  return dominant;
}
