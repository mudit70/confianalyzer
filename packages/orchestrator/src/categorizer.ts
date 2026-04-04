import type { FunctionIR, FunctionCategory } from "./types.js";

/**
 * Step 4: Categorize a function based on its enrichments and endpoint info.
 *
 * Priority order:
 * 1. enrichments[].suggestedCategory (if set)
 * 2. endpointInfo -> API_ENDPOINT
 * 3. enrichments[].httpCall -> API_CALLER
 * 4. enrichments[].dbOperation -> DB_CALL
 * 5. enrichments[].renders -> UI_INTERACTION
 * 6. Fallback -> UTILITY
 */
export function categorizeFunction(func: FunctionIR): FunctionCategory {
  // Check enrichments for suggestedCategory first
  if (func.enrichments) {
    for (const enrichment of func.enrichments) {
      if (enrichment.suggestedCategory) {
        return enrichment.suggestedCategory as FunctionCategory;
      }
    }
  }

  // Check endpointInfo
  if (func.endpointInfo) {
    return "API_ENDPOINT";
  }

  // Check enrichments for httpCall
  if (func.enrichments) {
    for (const enrichment of func.enrichments) {
      if (enrichment.httpCall) {
        return "API_CALLER";
      }
    }
  }

  // Check enrichments for dbOperation
  if (func.enrichments) {
    for (const enrichment of func.enrichments) {
      if (enrichment.dbOperation) {
        return "DB_CALL";
      }
    }
  }

  // Check enrichments for renders
  if (func.enrichments) {
    for (const enrichment of func.enrichments) {
      if (enrichment.renders && enrichment.renders.length > 0) {
        return "UI_INTERACTION";
      }
    }
  }

  return "UTILITY";
}
