/**
 * Basic Cypher syntax validation.
 * Not a full parser -- just sanity checks for common issues.
 */

export interface CypherValidation {
  valid: boolean;
  errors: string[];
  isReadOnly: boolean;
}

const CYPHER_READ_KEYWORDS = [
  "MATCH",
  "RETURN",
  "WITH",
  "WHERE",
  "ORDER",
  "LIMIT",
  "SKIP",
  "OPTIONAL",
  "UNWIND",
  "CALL",
  "UNION",
  "CASE",
];

const CYPHER_WRITE_KEYWORDS = [
  "CREATE",
  "MERGE",
  "DELETE",
  "DETACH",
  "REMOVE",
  "SET",
  "DROP",
];

/**
 * Check whether brackets and parentheses are balanced.
 */
function checkBrackets(query: string): string[] {
  const errors: string[] = [];
  const stack: string[] = [];
  const pairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
  };
  const closers = new Set(Object.values(pairs));

  // Strip string literals to avoid false positives
  const stripped = query.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");

  for (const ch of stripped) {
    if (ch in pairs) {
      stack.push(ch);
    } else if (closers.has(ch)) {
      const last = stack.pop();
      if (last === undefined) {
        errors.push(`Unmatched closing '${ch}'`);
      } else if (pairs[last] !== ch) {
        errors.push(`Mismatched brackets: expected '${pairs[last]}' but found '${ch}'`);
      }
    }
  }
  if (stack.length > 0) {
    for (const open of stack) {
      errors.push(`Unmatched opening '${open}'`);
    }
  }
  return errors;
}

/**
 * Validate a Cypher query for basic correctness and read-only safety.
 */
export function validateCypher(query: string): CypherValidation {
  const errors: string[] = [];

  if (!query || !query.trim()) {
    return { valid: false, errors: ["Query is empty"], isReadOnly: true };
  }

  const trimmed = query.trim();

  // Check for at least one Cypher keyword
  const upperQuery = trimmed.toUpperCase();
  const hasReadKeyword = CYPHER_READ_KEYWORDS.some((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`);
    return regex.test(upperQuery);
  });
  if (!hasReadKeyword) {
    errors.push(
      `Query does not contain any recognized Cypher keyword (${CYPHER_READ_KEYWORDS.join(", ")})`,
    );
  }

  // Check for write operations
  const writeOps: string[] = [];
  for (const kw of CYPHER_WRITE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(trimmed)) {
      writeOps.push(kw);
    }
  }
  const isReadOnly = writeOps.length === 0;
  if (!isReadOnly) {
    errors.push(`Query contains write operations: ${writeOps.join(", ")}. Only read-only queries are allowed.`);
  }

  // Check balanced brackets
  const bracketErrors = checkBrackets(trimmed);
  errors.push(...bracketErrors);

  // Warn if no RETURN (not necessarily an error for subqueries, but worth flagging)
  if (!/\bRETURN\b/i.test(trimmed)) {
    errors.push("Query does not contain a RETURN clause");
  }

  return {
    valid: errors.length === 0,
    errors,
    isReadOnly,
  };
}
