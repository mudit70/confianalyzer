import * as fs from "node:fs";
import * as path from "node:path";

export interface ConfiAnalyzerConfig {
  include: string[];
  exclude: string[];
  plugins: string[];
  options: Record<string, unknown>;
}

const DEFAULT_CONFIG: ConfiAnalyzerConfig = {
  include: [],
  exclude: [
    "**/__tests__/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/node_modules/**",
    "**/.venv/**",
    "**/dist/**",
    "**/build/**",
  ],
  plugins: [],
  options: {},
};

/**
 * Load config from a YAML file path.
 * Falls back to .confianalyzer.yaml in repoRoot if configPath is not provided.
 * Returns defaults if no config file is found.
 */
export function loadConfig(repoRoot: string, configPath?: string): ConfiAnalyzerConfig {
  const resolvedPath = configPath ?? path.join(repoRoot, ".confianalyzer.yaml");

  if (!fs.existsSync(resolvedPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  return parseYaml(content);
}

/**
 * Minimal YAML parser for the .confianalyzer.yaml format.
 * Supports top-level keys with string list values and a nested options map.
 */
export function parseYaml(content: string): ConfiAnalyzerConfig {
  const config: ConfiAnalyzerConfig = {
    include: [],
    exclude: [],
    plugins: [],
    options: {},
  };

  const lines = content.split("\n");
  let currentKey: string | null = null;
  let inOptions = false;
  let optionsKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");

    // Skip comments and blank lines
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) {
      continue;
    }

    // Top-level key (no leading whitespace)
    const topLevelMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topLevelMatch) {
      const key = topLevelMatch[1];
      const inlineValue = topLevelMatch[2].trim();

      if (key === "options") {
        inOptions = true;
        currentKey = null;
        optionsKey = null;
        continue;
      }

      inOptions = false;
      optionsKey = null;
      currentKey = key;

      // If there's an inline value (not a list), treat as single value
      if (inlineValue && !inlineValue.startsWith("#")) {
        // Inline scalar value - not used for our list fields but handle gracefully
      }
      continue;
    }

    // Inside options block - nested key
    if (inOptions) {
      const nestedKeyMatch = line.match(/^  (\w+):\s*(.*)$/);
      if (nestedKeyMatch) {
        const key = nestedKeyMatch[1];
        const value = nestedKeyMatch[2].trim().replace(/^["']|["']$/g, "");

        if (value && !value.startsWith("#")) {
          // Simple scalar option value
          config.options[key] = value;
          optionsKey = null;
        } else {
          // Starts a list under options
          optionsKey = key;
          config.options[key] = [];
        }
        continue;
      }

      // List item inside options
      const nestedItemMatch = line.match(/^\s+-\s+(.+)$/);
      if (nestedItemMatch && optionsKey) {
        const value = nestedItemMatch[1].trim().replace(/^["']|["']$/g, "");
        (config.options[optionsKey] as string[]).push(value);
        continue;
      }
      continue;
    }

    // List item for top-level key
    const listItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (listItemMatch && currentKey) {
      const value = listItemMatch[1].trim().replace(/^["']|["']$/g, "");

      if (currentKey === "include") {
        config.include.push(value);
      } else if (currentKey === "exclude") {
        config.exclude.push(value);
      } else if (currentKey === "plugins") {
        config.plugins.push(value);
      }
    }
  }

  return config;
}
