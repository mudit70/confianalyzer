/**
 * Subgraph summarization — generates human-readable summaries of code subgraphs.
 *
 * 1. If an Anthropic API key is available, uses the LLM for rich summaries.
 * 2. Otherwise, falls back to a deterministic rule-based summary that analyses
 *    node types, categories, and relationship patterns.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Public types ───

export interface SummarizeRequest {
  nodes: Array<{
    id: string;
    label: string;
    name: string;
    type: string;
    category?: string;
  }>;
  relationships: Array<{
    type: string;
    sourceId: string;
    targetId: string;
  }>;
  context?: string; // e.g., "This is a flow trace starting from handleCheckout"
}

export interface SummarizeResponse {
  summary: string;
  keyEntities: string[];
  concerns: string[];
}

export interface SummarizerOptions {
  apiKey?: string;
  model?: string;
}

// ─── Constants ───

const SYSTEM_PROMPT = `You are a code architecture analyst. Given a subgraph from a codebase dependency graph,
produce a concise summary that explains:
1. What this code flow does in business terms
2. Which layers it crosses (UI -> API -> DB)
3. Any notable patterns (cross-repo calls, high fan-out, etc.)

Respond ONLY with valid JSON (no markdown fences):
{ "summary": "...", "keyEntities": ["entity1", "entity2"], "concerns": ["concern1"] }`;

// Categories that represent architectural layers, ordered from UI to DB
const LAYER_ORDER: Record<string, number> = {
  UI_INTERACTION: 0,
  HANDLER: 1,
  API_CALLER: 2,
  API_ENDPOINT: 3,
  DB_CALL: 4,
};

const LAYER_LABELS: Record<string, string> = {
  UI_INTERACTION: "UI",
  HANDLER: "Handler",
  API_CALLER: "API Caller",
  API_ENDPOINT: "API Endpoint",
  DB_CALL: "Database",
};

// ─── Main entry point ───

export async function summarizeSubgraph(
  request: SummarizeRequest,
  options?: SummarizerOptions,
): Promise<SummarizeResponse> {
  if (request.nodes.length === 0) {
    return {
      summary: "Empty subgraph — no nodes to summarize.",
      keyEntities: [],
      concerns: [],
    };
  }

  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      return await summarizeWithLLM(request, apiKey, options?.model);
    } catch {
      // Fall through to rule-based if LLM fails
    }
  }

  return summarizeRuleBased(request);
}

// ─── LLM-based summarization ───

async function summarizeWithLLM(
  request: SummarizeRequest,
  apiKey: string,
  model?: string,
): Promise<SummarizeResponse> {
  const description = formatSubgraphDescription(request);
  const userMessage = request.context
    ? `Context: ${request.context}\n\n${description}`
    : description;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: model ?? "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }

  // Strip markdown fences if the LLM wraps them anyway
  let raw = textBlock.text.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    raw = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(raw) as SummarizeResponse;
  return {
    summary: parsed.summary ?? "",
    keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
  };
}

// ─── Rule-based summarization ───

export function summarizeRuleBased(request: SummarizeRequest): SummarizeResponse {
  const { nodes, relationships } = request;
  const keyEntities: string[] = [];
  const concerns: string[] = [];

  // Group nodes by category
  const byCategory: Record<string, typeof nodes> = {};
  for (const node of nodes) {
    const cat = node.category ?? "UNKNOWN";
    (byCategory[cat] ??= []).push(node);
  }

  // Detect layers present
  const layersPresent = Object.keys(LAYER_ORDER)
    .filter((cat) => byCategory[cat]?.length)
    .sort((a, b) => LAYER_ORDER[a] - LAYER_ORDER[b]);

  // Collect key entities: endpoints, DB calls, UI interactions
  const entityCategories = ["API_ENDPOINT", "DB_CALL", "UI_INTERACTION", "API_CALLER"];
  for (const cat of entityCategories) {
    for (const node of byCategory[cat] ?? []) {
      keyEntities.push(node.name || node.label);
    }
  }

  // Detect cross-repo edges by looking at node metadata patterns
  // Build a map of nodeId -> node for quick lookup
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Detect cross-repo: nodes whose IDs have different repo prefixes
  const repoNames = new Set<string>();
  for (const node of nodes) {
    // Attempt to extract repo name from the id (commonly formatted as "repo:path:name")
    const parts = node.id.split(":");
    if (parts.length > 1) {
      repoNames.add(parts[0]);
    } else {
      // Fall back to name as a unique identifier
      repoNames.add("default");
    }
  }

  const crossRepoEdges = relationships.filter((rel) => {
    const src = nodeMap.get(rel.sourceId);
    const tgt = nodeMap.get(rel.targetId);
    if (!src || !tgt) return false;
    const srcRepo = src.id.split(":")[0];
    const tgtRepo = tgt.id.split(":")[0];
    return srcRepo !== tgtRepo && src.id.includes(":") && tgt.id.includes(":");
  });

  if (crossRepoEdges.length > 0) {
    concerns.push(
      `This flow crosses ${repoNames.size} repositories (${[...repoNames].join(" -> ")}).`,
    );
  }

  // Detect high fan-out (a single node calling many others)
  const outDegree = new Map<string, number>();
  for (const rel of relationships) {
    outDegree.set(rel.sourceId, (outDegree.get(rel.sourceId) ?? 0) + 1);
  }
  for (const [nodeId, degree] of outDegree) {
    if (degree >= 5) {
      const node = nodeMap.get(nodeId);
      const name = node ? (node.name || node.label) : nodeId;
      concerns.push(`High fan-out: ${name} has ${degree} outgoing connections.`);
    }
  }

  // Build flow description
  const flowParts: string[] = [];

  if (byCategory["UI_INTERACTION"]?.length) {
    const names = byCategory["UI_INTERACTION"].map((n) => n.name || n.label);
    flowParts.push(`UI component${names.length > 1 ? "s" : ""} ${names.join(", ")}`);
  }

  if (byCategory["API_CALLER"]?.length) {
    const names = byCategory["API_CALLER"].map((n) => n.name || n.label);
    flowParts.push(`API caller${names.length > 1 ? "s" : ""} ${names.join(", ")}`);
  }

  if (byCategory["API_ENDPOINT"]?.length) {
    const names = byCategory["API_ENDPOINT"].map((n) => n.name || n.label);
    flowParts.push(`API endpoint${names.length > 1 ? "s" : ""} ${names.join(", ")}`);
  }

  if (byCategory["HANDLER"]?.length) {
    const names = byCategory["HANDLER"].map((n) => n.name || n.label);
    flowParts.push(`handler${names.length > 1 ? "s" : ""} ${names.join(", ")}`);
  }

  if (byCategory["DB_CALL"]?.length) {
    const names = byCategory["DB_CALL"].map((n) => n.name || n.label);
    flowParts.push(`database operation${names.length > 1 ? "s" : ""} ${names.join(", ")}`);
  }

  // Build the layer crossing description
  const layerStr =
    layersPresent.length > 1
      ? ` It crosses ${layersPresent.length} architectural layers (${layersPresent.map((l) => LAYER_LABELS[l]).join(" -> ")}).`
      : "";

  let summary: string;
  if (flowParts.length === 0) {
    summary = `This subgraph contains ${nodes.length} node${nodes.length !== 1 ? "s" : ""} and ${relationships.length} relationship${relationships.length !== 1 ? "s" : ""}.`;
  } else {
    summary = `This flow traces through ${flowParts.join(" through ")}.${layerStr}`;
  }

  if (request.context) {
    summary = `${request.context}. ${summary}`;
  }

  return { summary, keyEntities, concerns };
}

// ─── Helpers ───

function formatSubgraphDescription(request: SummarizeRequest): string {
  const nodeLines = request.nodes.map(
    (n) => `  - ${n.name || n.label} (type=${n.type}, category=${n.category ?? "unknown"})`,
  );
  const relLines = request.relationships.map((r) => {
    const src = request.nodes.find((n) => n.id === r.sourceId);
    const tgt = request.nodes.find((n) => n.id === r.targetId);
    return `  - ${src?.name ?? r.sourceId} --${r.type}--> ${tgt?.name ?? r.targetId}`;
  });

  return [
    `Subgraph with ${request.nodes.length} nodes and ${request.relationships.length} relationships:`,
    "",
    "Nodes:",
    ...nodeLines,
    "",
    "Relationships:",
    ...relLines,
  ].join("\n");
}
