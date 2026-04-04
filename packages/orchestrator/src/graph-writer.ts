import type {
  PipelineResult,
  ProjectNode,
  RepositoryNode,
  FileNode,
  FunctionNode,
  ApiEndpointNode,
  DbTableNode,
  Relationship,
} from "./types.js";

/**
 * A Cypher statement with its parameters, safe from injection.
 */
export interface CypherStatement {
  query: string;
  params: Record<string, unknown>;
}

/**
 * Escape a string value for use in Cypher (only used for generateCypherStatements legacy output).
 */
function cypherEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

// ─── Parameterized statement generators ───

function projectStatements(node: ProjectNode): CypherStatement[] {
  return [
    {
      query: "MERGE (p:Project {name: $name}) ON CREATE SET p.id = $id, p.createdAt = $createdAt ON MATCH SET p.id = $id",
      params: { id: node.id, name: node.name, createdAt: node.createdAt },
    },
  ];
}

function repositoryStatements(node: RepositoryNode, projectId: string): CypherStatement[] {
  return [
    {
      query: "MERGE (r:Repository {id: $id}) ON CREATE SET r.url = $url, r.name = $name, r.language = $language, r.lastAnalyzedAt = $lastAnalyzedAt",
      params: { id: node.id, url: node.url, name: node.name, language: node.language, lastAnalyzedAt: node.lastAnalyzedAt },
    },
    {
      query: "MATCH (r:Repository {id: $repoId}), (p:Project {id: $projectId}) MERGE (r)-[:BELONGS_TO]->(p)",
      params: { repoId: node.id, projectId },
    },
  ];
}

function fileStatements(node: FileNode, repoId: string): CypherStatement[] {
  return [
    {
      query: "MERGE (f:File {id: $id}) ON CREATE SET f.path = $path, f.language = $language, f.hash = $hash",
      params: { id: node.id, path: node.path, language: node.language, hash: node.hash },
    },
    {
      query: "MATCH (f:File {id: $fileId}), (r:Repository {id: $repoId}) MERGE (f)-[:IN_REPO]->(r)",
      params: { fileId: node.id, repoId },
    },
  ];
}

function functionStatements(node: FunctionNode, fileId: string): CypherStatement[] {
  return [
    {
      query: "MERGE (fn:Function {id: $id}) ON CREATE SET fn.name = $name, fn.signature = $signature, fn.category = $category, fn.startLine = $startLine, fn.endLine = $endLine",
      params: { id: node.id, name: node.name, signature: node.signature, category: node.category, startLine: node.startLine, endLine: node.endLine },
    },
    {
      query: "MATCH (fn:Function {id: $fnId}), (f:File {id: $fileId}) MERGE (fn)-[:DEFINED_IN]->(f)",
      params: { fnId: node.id, fileId },
    },
  ];
}

function apiEndpointStatements(node: ApiEndpointNode): CypherStatement[] {
  return [
    {
      query: "MERGE (ep:APIEndpoint {id: $id}) ON CREATE SET ep.method = $method, ep.path = $path, ep.fullRoute = $fullRoute",
      params: { id: node.id, method: node.method, path: node.path, fullRoute: node.fullRoute },
    },
  ];
}

function dbTableStatements(node: DbTableNode): CypherStatement[] {
  const params: Record<string, unknown> = { id: node.id, name: node.name };
  let schemaSet = "";
  if (node.schema) {
    schemaSet = ", t.schema = $schema";
    params.schema = node.schema;
  }
  return [
    {
      query: `MERGE (t:DBTable {id: $id}) ON CREATE SET t.name = $name${schemaSet}`,
      params,
    },
  ];
}

function relationshipStatement(rel: Relationship): CypherStatement {
  const labelMap: Record<string, [string, string]> = {
    BELONGS_TO: ["Repository", "Project"],
    IN_REPO: ["File", "Repository"],
    DEFINED_IN: ["Function", "File"],
    CALLS: ["Function", "Function"],
    IMPORTS: ["File", "File"],
    EXPOSES: ["Function", "APIEndpoint"],
    CALLS_API: ["Function", "APIEndpoint"],
    READS: ["Function", "DBTable"],
    WRITES: ["Function", "DBTable"],
  };

  const [fromLabel, toLabel] = labelMap[rel.type] ?? ["Node", "Node"];
  const params: Record<string, unknown> = { fromId: rel.fromId, toId: rel.toId };

  const propsEntries = Object.entries(rel.properties);
  let propsStr = "";
  if (propsEntries.length > 0) {
    const parts = propsEntries.map(([key, value], i) => {
      const paramName = `prop_${i}`;
      params[paramName] = value;
      return `${key}: $${paramName}`;
    });
    propsStr = ` {${parts.join(", ")}}`;
  }

  return {
    query: `MATCH (a:${fromLabel} {id: $fromId}), (b:${toLabel} {id: $toId}) MERGE (a)-[:${rel.type}${propsStr}]->(b)`,
    params,
  };
}

/**
 * Generate parameterized Cypher statements for all nodes and relationships.
 */
export function generateParameterizedStatements(result: PipelineResult): CypherStatement[] {
  const statements: CypherStatement[] = [];

  const repoIdByName = new Map<string, string>();
  for (const repo of result.repositories) {
    repoIdByName.set(repo.name, repo.id);
  }

  const fileIdByPath = new Map<string, string>();
  for (const file of result.files) {
    fileIdByPath.set(`${file.repoName}::${file.path}`, file.id);
  }

  const projectId = result.projects[0]?.id ?? "";

  for (const project of result.projects) {
    statements.push(...projectStatements(project));
  }
  for (const repo of result.repositories) {
    statements.push(...repositoryStatements(repo, projectId));
  }
  for (const file of result.files) {
    const repoId = repoIdByName.get(file.repoName) ?? "";
    statements.push(...fileStatements(file, repoId));
  }
  for (const func of result.functions) {
    const fileId = fileIdByPath.get(`${func.repoName}::${func.filePath}`) ?? "";
    statements.push(...functionStatements(func, fileId));
  }
  for (const ep of result.apiEndpoints) {
    statements.push(...apiEndpointStatements(ep));
  }
  for (const table of result.dbTables) {
    statements.push(...dbTableStatements(table));
  }
  for (const rel of result.relationships) {
    statements.push(relationshipStatement(rel));
  }

  return statements;
}

/**
 * Legacy: Generate Cypher as raw strings (for dry-run / display purposes).
 * WARNING: Use generateParameterizedStatements + writeToNeo4j for actual execution.
 */
export function generateCypherStatements(result: PipelineResult): string[] {
  const statements: string[] = [];

  const repoIdByName = new Map<string, string>();
  for (const repo of result.repositories) {
    repoIdByName.set(repo.name, repo.id);
  }

  const fileIdByPath = new Map<string, string>();
  for (const file of result.files) {
    fileIdByPath.set(`${file.repoName}::${file.path}`, file.id);
  }

  const projectId = result.projects[0]?.id ?? "";

  for (const project of result.projects) {
    statements.push(`MERGE (p:Project {id: '${cypherEscape(project.id)}'}) ON CREATE SET p.name = '${cypherEscape(project.name)}', p.createdAt = '${cypherEscape(project.createdAt)}'`);
  }
  for (const repo of result.repositories) {
    statements.push(`MERGE (r:Repository {id: '${cypherEscape(repo.id)}'}) ON CREATE SET r.url = '${cypherEscape(repo.url)}', r.name = '${cypherEscape(repo.name)}', r.language = '${cypherEscape(repo.language)}', r.lastAnalyzedAt = '${cypherEscape(repo.lastAnalyzedAt)}'`);
    statements.push(`MATCH (r:Repository {id: '${cypherEscape(repo.id)}'}), (p:Project {id: '${cypherEscape(projectId)}'}) MERGE (r)-[:BELONGS_TO]->(p)`);
  }
  for (const file of result.files) {
    const repoId = repoIdByName.get(file.repoName) ?? "";
    statements.push(`MERGE (f:File {id: '${cypherEscape(file.id)}'}) ON CREATE SET f.path = '${cypherEscape(file.path)}', f.language = '${cypherEscape(file.language)}', f.hash = '${cypherEscape(file.hash)}'`);
    statements.push(`MATCH (f:File {id: '${cypherEscape(file.id)}'}), (r:Repository {id: '${cypherEscape(repoId)}'}) MERGE (f)-[:IN_REPO]->(r)`);
  }
  for (const func of result.functions) {
    const fileId = fileIdByPath.get(`${func.repoName}::${func.filePath}`) ?? "";
    statements.push(`MERGE (fn:Function {id: '${cypherEscape(func.id)}'}) ON CREATE SET fn.name = '${cypherEscape(func.name)}', fn.signature = '${cypherEscape(func.signature)}', fn.category = '${cypherEscape(func.category)}', fn.startLine = ${func.startLine}, fn.endLine = ${func.endLine}`);
    statements.push(`MATCH (fn:Function {id: '${cypherEscape(func.id)}'}), (f:File {id: '${cypherEscape(fileId)}'}) MERGE (fn)-[:DEFINED_IN]->(f)`);
  }
  for (const ep of result.apiEndpoints) {
    statements.push(`MERGE (ep:APIEndpoint {id: '${cypherEscape(ep.id)}'}) ON CREATE SET ep.method = '${cypherEscape(ep.method)}', ep.path = '${cypherEscape(ep.path)}', ep.fullRoute = '${cypherEscape(ep.fullRoute)}'`);
  }
  for (const table of result.dbTables) {
    const schemaSet = table.schema ? `, t.schema = '${cypherEscape(table.schema)}'` : "";
    statements.push(`MERGE (t:DBTable {id: '${cypherEscape(table.id)}'}) ON CREATE SET t.name = '${cypherEscape(table.name)}'${schemaSet}`);
  }
  for (const rel of result.relationships) {
    const [fromLabel, toLabel] = ({ BELONGS_TO: ["Repository", "Project"], IN_REPO: ["File", "Repository"], DEFINED_IN: ["Function", "File"], CALLS: ["Function", "Function"], IMPORTS: ["File", "File"], EXPOSES: ["Function", "APIEndpoint"], CALLS_API: ["Function", "APIEndpoint"], READS: ["Function", "DBTable"], WRITES: ["Function", "DBTable"] } as Record<string, [string, string]>)[rel.type] ?? ["Node", "Node"];
    const propsEntries = Object.entries(rel.properties);
    let propsStr = "";
    if (propsEntries.length > 0) {
      const parts = propsEntries.map(([key, value]) => {
        if (typeof value === "number") return `${key}: ${value}`;
        if (Array.isArray(value)) return `${key}: [${value.map((v) => `'${cypherEscape(String(v))}'`).join(", ")}]`;
        return `${key}: '${cypherEscape(String(value))}'`;
      });
      propsStr = ` {${parts.join(", ")}}`;
    }
    statements.push(`MATCH (a:${fromLabel} {id: '${cypherEscape(rel.fromId)}'}), (b:${toLabel} {id: '${cypherEscape(rel.toId)}'}) MERGE (a)-[:${rel.type}${propsStr}]->(b)`);
  }

  return statements;
}

/**
 * Execute parameterized Cypher statements against Neo4j.
 */
export async function writeToNeo4j(
  statementsOrStrings: CypherStatement[] | string[],
  neo4jUri: string,
  neo4jUser: string,
  neo4jPassword: string,
): Promise<void> {
  const neo4j = await import("neo4j-driver");
  const driver = neo4j.default.driver(neo4jUri, neo4j.default.auth.basic(neo4jUser, neo4jPassword));
  const session = driver.session();

  try {
    // Handle both parameterized statements and legacy raw strings
    if (statementsOrStrings.length === 0) return;

    if (typeof statementsOrStrings[0] === "string") {
      // Legacy: raw string statements
      for (const block of statementsOrStrings as string[]) {
        const singleStatements = block
          .split(/;\s*\n/)
          .map((s) => s.replace(/;$/, "").trim())
          .filter((s) => s.length > 0);
        for (const stmt of singleStatements) {
          await session.run(stmt);
        }
      }
    } else {
      // Parameterized statements (safe from injection)
      for (const stmt of statementsOrStrings as CypherStatement[]) {
        await session.run(stmt.query, stmt.params);
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }
}
