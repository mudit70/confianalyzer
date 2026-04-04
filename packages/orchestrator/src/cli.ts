#!/usr/bin/env node

import * as fs from "node:fs";
import type { ProjectConfig } from "./types.js";
import { runFederatedPipeline } from "./pipeline.js";

function parseArgs(argv: string[]): {
  config: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  projectName?: string;
  dryRun: boolean;
} {
  const args = argv.slice(2);
  const result: ReturnType<typeof parseArgs> = {
    config: "",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "orchestrate":
        // subcommand, skip
        break;
      case "--config":
        result.config = args[++i];
        break;
      case "--neo4j-uri":
        result.neo4jUri = args[++i];
        break;
      case "--neo4j-user":
        result.neo4jUser = args[++i];
        break;
      case "--neo4j-password":
        result.neo4jPassword = args[++i];
        break;
      case "--project-name":
        result.projectName = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      default:
        if (args[i].startsWith("--")) {
          console.warn(`Unknown option: ${args[i]}`);
        }
        break;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed.config) {
    console.error("Usage: confianalyzer orchestrate --config <path> [options]");
    console.error("");
    console.error("Options:");
    console.error("  --config <path>         Path to confianalyzer.json (required)");
    console.error("  --neo4j-uri <uri>       Neo4j bolt URI");
    console.error("  --neo4j-user <user>     Neo4j username");
    console.error("  --neo4j-password <pw>   Neo4j password");
    console.error("  --project-name <name>   Override project name");
    console.error("  --dry-run               Generate Cypher but don't execute");
    process.exit(1);
  }

  const configRaw = fs.readFileSync(parsed.config, "utf-8");
  const config: ProjectConfig = JSON.parse(configRaw);

  const result = await runFederatedPipeline(config, {
    dryRun: parsed.dryRun,
    neo4jUri: parsed.neo4jUri,
    neo4jUser: parsed.neo4jUser,
    neo4jPassword: parsed.neo4jPassword,
    projectName: parsed.projectName,
  });

  console.log(`\nPipeline complete.`);
  console.log(`  Projects: ${result.projects.length}`);
  console.log(`  Repositories: ${result.repositories.length}`);
  console.log(`  Files: ${result.files.length}`);
  console.log(`  Functions: ${result.functions.length}`);
  console.log(`  API Endpoints: ${result.apiEndpoints.length}`);
  console.log(`  DB Tables: ${result.dbTables.length}`);
  console.log(`  Relationships: ${result.relationships.length}`);
  console.log(`  Cypher Statements: ${result.cypherStatements.length}`);

  if (parsed.dryRun) {
    console.log("\n--- Cypher Statements (dry run) ---");
    for (const stmt of result.cypherStatements) {
      console.log(stmt);
    }
  }
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
