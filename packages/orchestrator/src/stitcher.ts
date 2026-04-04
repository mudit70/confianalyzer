import type { ApiCaller, ApiEndpoint, CrossRepoLink } from "./types.js";

interface NormalizedPath {
  normalized: string;
  segments: string[];
}

/**
 * Normalize a URL/route path to a canonical form for matching.
 * Converts all parameter syntaxes (Express :id, FastAPI {id}, Flask <id>, Next.js [id])
 * to a common {param} form.
 */
export function normalizePath(pathStr: string): NormalizedPath {
  let normalized = pathStr
    // Remove leading/trailing slashes
    .replace(/^\/+|\/+$/g, "")
    // Lowercase
    .toLowerCase()
    // Remove protocol and host prefix (e.g. http://localhost:8000/)
    .replace(/^https?:\/\/[^/]+\/?/, "")
    // Normalize path parameters (order matters: Flask before Express to avoid partial matches)
    .replace(/<([a-zA-Z_]\w*(?::[^>]+)?)>/g, "{param}") // Flask <id> or <int:id>
    .replace(/:([a-zA-Z_]\w*)/g, "{param}")       // Express :id
    .replace(/\{([a-zA-Z_]\w*)\}/g, "{param}")     // FastAPI {id}
    .replace(/\[([a-zA-Z_]\w*)\]/g, "{param}");    // Next.js [id]

  const segments = normalized.split("/").filter(Boolean);
  return { normalized, segments };
}

/**
 * Strip API version prefix (v1, v2, etc.) from path segments.
 */
function stripVersionPrefix(segments: string[]): { version: string | null; rest: string[] } {
  if (segments.length > 0 && /^v\d+$/.test(segments[0])) {
    return { version: segments[0], rest: segments.slice(1) };
  }
  return { version: null, rest: segments };
}

/**
 * Compare two segment arrays for equality.
 */
function segmentsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i]);
}

/**
 * Step 5: Cross-repo API stitching.
 * Matches API callers to API endpoints across repositories/languages.
 *
 * Matching rules (in order of specificity):
 * 1. Exact match (normalized paths equal + same HTTP method)
 * 2. Suffix match (one path ends with the other + same HTTP method)
 * 3. Parameterized match (segment-by-segment after param normalization)
 * 4. Version-stripped match (strip v1/v2 prefixes, then compare)
 */
export function stitchCrossLanguageApis(
  callers: ApiCaller[],
  endpoints: ApiEndpoint[],
): CrossRepoLink[] {
  const links: CrossRepoLink[] = [];

  // Pre-normalize all endpoints
  const normalizedEndpoints = endpoints.map((ep) => ({
    ...ep,
    norm: normalizePath(ep.routePath),
    stripped: stripVersionPrefix(normalizePath(ep.routePath).segments),
  }));

  for (const caller of callers) {
    const callerNorm = normalizePath(caller.urlPattern);
    const callerStripped = stripVersionPrefix(callerNorm.segments);

    for (const ep of normalizedEndpoints) {
      // Skip self-matches
      if (caller.functionId === ep.functionId) continue;

      // Must match HTTP method
      if (caller.httpMethod.toUpperCase() !== ep.httpMethod.toUpperCase()) continue;

      let confidence: CrossRepoLink["matchConfidence"] | null = null;

      // Rule 1: Exact match
      if (callerNorm.normalized === ep.norm.normalized) {
        confidence = "exact";
      }
      // Rule 2: Suffix match
      else if (
        callerNorm.normalized.endsWith(ep.norm.normalized) ||
        ep.norm.normalized.endsWith(callerNorm.normalized)
      ) {
        confidence = "suffix";
      }
      // Rule 3: Parameterized match (segment-by-segment)
      else if (segmentsMatch(callerNorm.segments, ep.norm.segments)) {
        confidence = "parameterized";
      }
      // Rule 4: Version-stripped match
      else if (segmentsMatch(callerStripped.rest, ep.stripped.rest)) {
        confidence = "version-stripped";
      }

      if (confidence) {
        links.push({
          callerId: caller.functionId,
          endpointId: ep.functionId,
          httpMethod: caller.httpMethod,
          urlPattern: ep.routePath,
          matchConfidence: confidence,
        });
      }
    }
  }

  return links;
}
