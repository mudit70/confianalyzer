#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { analyzeRepository } from "./analyzer.js";
import { loadConfig } from "./config.js";

interface CliArgs {
  repo: string;
  repoName: string;
  output: string;
  verbose: boolean;
  incremental?: string;
  config?: string;
}

function parseArgs(argv: string[]): CliArgs | null {
  const args: Partial<CliArgs> = { verbose: false };
  let i = 2; // skip node and script

  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "--repo":
        args.repo = argv[++i];
        break;
      case "--repo-name":
        args.repoName = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--incremental":
        args.incremental = argv[++i];
        break;
      case "--config":
        args.config = argv[++i];
        break;
      default:
        console.error(`[error] Unknown argument: ${arg}`);
        return null;
    }
    i++;
  }

  if (!args.repo || !args.repoName || !args.output) {
    return null;
  }

  return args as CliArgs;
}

function printUsage(): void {
  console.error(`Usage: confianalyzer-analyze-ts \\
  --repo /path/to/repo \\
  --repo-name my-repo \\
  --output /path/to/output/ir.json \\
  [--verbose] \\
  [--incremental /path/to/previous-ir.json] \\
  [--config /path/to/.confianalyzer.yaml]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (!args) {
    printUsage();
    process.exit(3);
  }

  // Validate repo path
  if (!fs.existsSync(args.repo)) {
    console.error(`[error] Repository path does not exist: ${args.repo}`);
    process.exit(3);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(args.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const config = loadConfig(args.repo, args.config);
    const ir = await analyzeRepository(args.repo, args.repoName, args.verbose, args.incremental, config);

    fs.writeFileSync(args.output, JSON.stringify(ir, null, 2), "utf-8");

    if (args.verbose) {
      console.error(`[info] Output written to ${args.output}`);
      console.error(`[info] Analyzed ${ir.files.length} files`);
    }

    // Exit with partial success if some files failed
    const totalDiscovered = ir.files.length;
    if (totalDiscovered === 0) {
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error(`[error] Analysis failed: ${err}`);
    process.exit(2);
  }
}

main();
