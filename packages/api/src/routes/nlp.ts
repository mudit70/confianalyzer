import { Router, type Request, type Response, type NextFunction } from "express";
import { runQuery } from "../services/neo4j.js";
import { ApiError } from "../middleware/error-handler.js";

const router = Router();

/**
 * POST /api/query/nlp — translate natural language to Cypher and execute
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, filters } = req.body;
    if (!question || typeof question !== "string") {
      throw new ApiError(400, "A 'question' string is required in the request body");
    }

    // Append structured filter hints to the question
    let enrichedQuestion = question;
    if (filters && typeof filters === "object") {
      const hints: string[] = [];
      if (filters.frontendOnly) hints.push("[Filter: only in frontend repositories]");
      if (filters.backendOnly) hints.push("[Filter: only in backend repositories]");
      if (filters.excludeTests) hints.push("[Filter: exclude files whose path contains 'test', 'spec', '__tests__', or 'mock']");
      if (filters.dbLayerOnly) hints.push("[Filter: only functions with DB_CALL category]");
      if (hints.length > 0) {
        enrichedQuestion = `${question}\n${hints.join("\n")}`;
      }
    }

    // Dynamic import of the NLP translator
    let translateToCypher: (question: string) => Promise<{
      cypher: string;
      explanation: string;
      validation: { isValid: boolean; isReadOnly: boolean; errors: string[] };
    }>;

    try {
      // @ts-expect-error Dynamic import of sibling package that may not be built yet
      const nlpModule = await import("../../nlp/dist/translator.js");
      translateToCypher = nlpModule.translateToCypher;
    } catch {
      throw new ApiError(
        503,
        "NLP translator is not available. Ensure the @confianalyzer/nlp package is built.",
      );
    }

    const translation = await translateToCypher(enrichedQuestion);

    if (!translation.validation.isValid) {
      throw new ApiError(400, `Invalid Cypher generated: ${translation.validation.errors.join(", ")}`);
    }

    if (!translation.validation.isReadOnly) {
      throw new ApiError(400, "Only read-only queries are allowed");
    }

    // Execute the Cypher against Neo4j
    let results: Record<string, unknown>[];
    try {
      results = await runQuery(translation.cypher);
    } catch (err) {
      throw new ApiError(
        422,
        `Cypher execution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    res.json({
      question,
      cypher: translation.cypher,
      explanation: translation.explanation,
      results,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/query/nlp/summarize — summarize a subgraph into natural language
 */
router.post("/summarize", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nodes, relationships, context } = req.body;

    if (!nodes || !Array.isArray(nodes)) {
      throw new ApiError(400, "nodes array is required");
    }
    if (!relationships || !Array.isArray(relationships)) {
      throw new ApiError(400, "relationships array is required");
    }

    // Dynamic import of the NLP summarizer
    let summarizeSubgraph: (
      request: { nodes: unknown[]; relationships: unknown[]; context?: string },
    ) => Promise<{ summary: string; keyEntities: string[]; concerns: string[] }>;

    try {
      // @ts-expect-error Dynamic import of sibling package that may not be built yet
      const nlpModule = await import("../../nlp/dist/summarizer.js");
      summarizeSubgraph = nlpModule.summarizeSubgraph;
    } catch {
      throw new ApiError(
        503,
        "NLP summarizer is not available. Ensure the @confianalyzer/nlp package is built.",
      );
    }

    const result = await summarizeSubgraph({ nodes, relationships, context });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
