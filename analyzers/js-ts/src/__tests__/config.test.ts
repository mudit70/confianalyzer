import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseYaml, loadConfig } from "../config.js";
import { analyzeRepository } from "../analyzer.js";

describe("Config parsing", () => {
  it("should parse a full config file", () => {
    const yaml = `
include:
  - "src/**"
  - "lib/**"

exclude:
  - "**/__tests__/**"
  - "**/*.test.*"

plugins:
  - express
  - react

options:
  tsconfig: "tsconfig.build.json"
  import_roots:
    - "app"
    - "lib"
`;
    const config = parseYaml(yaml);

    expect(config.include).toEqual(["src/**", "lib/**"]);
    expect(config.exclude).toEqual(["**/__tests__/**", "**/*.test.*"]);
    expect(config.plugins).toEqual(["express", "react"]);
    expect(config.options.tsconfig).toBe("tsconfig.build.json");
    expect(config.options.import_roots).toEqual(["app", "lib"]);
  });

  it("should handle empty config", () => {
    const config = parseYaml("");
    expect(config.include).toEqual([]);
    expect(config.exclude).toEqual([]);
    expect(config.plugins).toEqual([]);
    expect(config.options).toEqual({});
  });

  it("should handle comments and blank lines", () => {
    const yaml = `
# This is a comment
include:
  - "src/**"

  # Another comment
exclude:
  - "**/dist/**"
`;
    const config = parseYaml(yaml);
    expect(config.include).toEqual(["src/**"]);
    expect(config.exclude).toEqual(["**/dist/**"]);
  });

  it("should return defaults when config file does not exist", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.include).toEqual([]);
    expect(config.exclude.length).toBeGreaterThan(0);
    expect(config.plugins).toEqual([]);
  });

  it("should load config from repo root .confianalyzer.yaml", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confianalyzer-cfg-"));
    fs.writeFileSync(
      path.join(dir, ".confianalyzer.yaml"),
      `include:\n  - "src/**"\nplugins:\n  - express\n`
    );
    const config = loadConfig(dir);
    expect(config.include).toEqual(["src/**"]);
    expect(config.plugins).toEqual(["express"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should load config from explicit path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confianalyzer-cfg-"));
    const configPath = path.join(dir, "custom.yaml");
    fs.writeFileSync(configPath, `plugins:\n  - axios\n`);
    const config = loadConfig("/some/repo", configPath);
    expect(config.plugins).toEqual(["axios"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("Config-based file filtering", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "confianalyzer-filter-"));

    // Create a repo structure
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "lib"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "scripts"), { recursive: true });

    fs.writeFileSync(path.join(tempDir, "src", "app.ts"), `export function app() {}`);
    fs.writeFileSync(path.join(tempDir, "lib", "utils.ts"), `export function util() {}`);
    fs.writeFileSync(path.join(tempDir, "scripts", "build.ts"), `export function build() {}`);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should include only matching files when include patterns specified", async () => {
    const config = {
      include: ["src/**"],
      exclude: [],
      plugins: [],
      options: {},
    };
    const ir = await analyzeRepository(tempDir, "test-repo", false, undefined, config);
    expect(ir.files).toHaveLength(1);
    expect(ir.files[0].relativePath).toBe("src/app.ts");
  });

  it("should exclude matching files when exclude patterns specified", async () => {
    const config = {
      include: [],
      exclude: ["scripts/**"],
      plugins: [],
      options: {},
    };
    const ir = await analyzeRepository(tempDir, "test-repo", false, undefined, config);
    const paths = ir.files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(["lib/utils.ts", "src/app.ts"]);
  });

  it("should apply both include and exclude", async () => {
    const config = {
      include: ["src/**", "lib/**"],
      exclude: ["lib/**"],
      plugins: [],
      options: {},
    };
    const ir = await analyzeRepository(tempDir, "test-repo", false, undefined, config);
    expect(ir.files).toHaveLength(1);
    expect(ir.files[0].relativePath).toBe("src/app.ts");
  });
});
