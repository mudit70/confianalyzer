import neo4j, { type Driver, type Record as Neo4jRecord } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
    const user = process.env.NEO4J_USER ?? "neo4j";
    const password = process.env.NEO4J_PASSWORD ?? "password";
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

/**
 * Convert JS numbers that are whole integers to Neo4j Integer type.
 * Neo4j requires integer types for LIMIT, SKIP, and similar clauses.
 */
function toNeo4jParams(params: Record<string, unknown>): Record<string, unknown> {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isInteger(value)) {
      converted[key] = neo4j.int(value);
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

export async function runQuery(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const session = getDriver().session();
  try {
    const result = await session.run(cypher, toNeo4jParams(params));
    return result.records.map((record: Neo4jRecord) => {
      const obj: Record<string, unknown> = {};
      for (const key of record.keys) {
        obj[key as string] = toPlainValue(record.get(key as string));
      }
      return obj;
    });
  } finally {
    await session.close();
  }
}

/**
 * Convert Neo4j values (nodes, integers, etc.) to plain JS objects.
 */
function toPlainValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Neo4j Integer
  if (neo4j.isInt(value)) {
    return (value as neo4j.Integer).toNumber();
  }

  // Neo4j Node
  if (typeof value === "object" && value !== null && "properties" in value && "labels" in value) {
    const node = value as { properties: Record<string, unknown>; labels: string[] };
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.properties)) {
      props[k] = toPlainValue(v);
    }
    props._labels = node.labels;
    return props;
  }

  // Neo4j Relationship
  if (typeof value === "object" && value !== null && "properties" in value && "type" in value && "start" in value) {
    const rel = value as { properties: Record<string, unknown>; type: string };
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rel.properties)) {
      props[k] = toPlainValue(v);
    }
    props._type = rel.type;
    return props;
  }

  // Neo4j Path
  if (typeof value === "object" && value !== null && "segments" in value) {
    const path = value as { segments: Array<{ start: unknown; relationship: unknown; end: unknown }> };
    return path.segments.map((seg) => ({
      start: toPlainValue(seg.start),
      relationship: toPlainValue(seg.relationship),
      end: toPlainValue(seg.end),
    }));
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.map(toPlainValue);
  }

  return value;
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// Graceful shutdown
process.on("SIGINT", () => void closeDriver());
process.on("SIGTERM", () => void closeDriver());
