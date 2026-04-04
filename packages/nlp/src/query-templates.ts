/**
 * Pre-built Cypher query templates for common codebase exploration questions.
 * When a question matches a template pattern, the template is used directly
 * instead of calling the LLM -- faster and more reliable.
 */

export interface QueryTemplate {
  patterns: RegExp[];
  description: string;
  buildCypher: (match: RegExpMatchArray) => string;
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  // 1. "What functions call X?"
  {
    patterns: [
      /what\s+functions?\s+calls?\s+(\w+)/i,
      /which\s+functions?\s+calls?\s+(\w+)/i,
      /who\s+calls?\s+(\w+)/i,
    ],
    description: "Find all functions that call a given function",
    buildCypher: (match) => {
      const name = match[1];
      return `MATCH (caller:Function)-[:CALLS]->(callee:Function {name: "${name}"})
RETURN caller.name AS caller, caller.signature AS signature, caller.category AS category
ORDER BY caller.name`;
    },
  },

  // 2. "Show me all API endpoints" / "List all endpoints"
  {
    patterns: [
      /show\s+(?:me\s+)?all\s+api\s*endpoints/i,
      /list\s+(?:all\s+)?api\s*endpoints/i,
      /what\s+(?:are\s+)?(?:the\s+)?api\s*endpoints/i,
    ],
    description: "List all API endpoints",
    buildCypher: () => {
      return `MATCH (e:APIEndpoint)
RETURN e.method AS method, e.path AS path, e.fullRoute AS fullRoute
ORDER BY e.method, e.path`;
    },
  },

  // 3. "What files import X?"
  {
    patterns: [
      /what\s+files?\s+imports?\s+(\S+)/i,
      /which\s+files?\s+imports?\s+(\S+)/i,
    ],
    description: "Find all files that import a given file or module",
    buildCypher: (match) => {
      const target = match[1];
      return `MATCH (f:File)-[i:IMPORTS]->(t:File)
WHERE t.path CONTAINS "${target}"
RETURN f.path AS importer, i.symbols AS symbols, t.path AS imported
ORDER BY f.path`;
    },
  },

  // 4. "Trace the flow from X to the database" / "Trace from X to database"
  {
    patterns: [
      /trace\s+(?:the\s+)?(?:flow\s+)?from\s+(\w+)\s+to\s+(?:the\s+)?database/i,
      /trace\s+(?:the\s+)?(?:flow\s+)?from\s+(\w+)\s+to\s+(?:the\s+)?db/i,
    ],
    description: "Trace the call path from a function to any database operation",
    buildCypher: (match) => {
      const name = match[1];
      return `MATCH path = (start:Function {name: "${name}"})-[:CALLS*1..10]->(dbFunc:Function)-[:READS|WRITES]->(t:DBTable)
RETURN [n IN nodes(path) WHERE n:Function | n.name] AS callChain, t.name AS table
LIMIT 25`;
    },
  },

  // 5. "What functions are in file X?"
  {
    patterns: [
      /what\s+functions?\s+(?:are\s+)?in\s+(?:file\s+)?(\S+)/i,
      /which\s+functions?\s+(?:are\s+)?in\s+(?:file\s+)?(\S+)/i,
      /list\s+functions?\s+in\s+(?:file\s+)?(\S+)/i,
    ],
    description: "List all functions defined in a given file",
    buildCypher: (match) => {
      const filePath = match[1];
      return `MATCH (fn:Function)-[:DEFINED_IN]->(f:File)
WHERE f.path CONTAINS "${filePath}"
RETURN fn.name AS name, fn.signature AS signature, fn.category AS category, fn.startLine AS startLine
ORDER BY fn.startLine`;
    },
  },

  // 6. "Which endpoints does the frontend call?"
  {
    patterns: [
      /which\s+endpoints?\s+does\s+(?:the\s+)?frontend\s+call/i,
      /what\s+endpoints?\s+does\s+(?:the\s+)?frontend\s+call/i,
      /what\s+apis?\s+does\s+(?:the\s+)?frontend\s+call/i,
    ],
    description: "Find all API endpoints called by frontend (UI_INTERACTION) functions",
    buildCypher: () => {
      return `MATCH (fn:Function)-[:CALLS_API]->(e:APIEndpoint)
WHERE fn.category = "UI_INTERACTION" OR fn.category = "API_CALLER"
RETURN fn.name AS caller, e.method AS method, e.fullRoute AS endpoint
ORDER BY e.method, e.fullRoute`;
    },
  },

  // 7. "What tables does function X read/write?"
  {
    patterns: [
      /what\s+tables?\s+does\s+(?:function\s+)?(\w+)\s+(?:read|write|access|touch)/i,
      /which\s+tables?\s+does\s+(?:function\s+)?(\w+)\s+(?:read|write|access|touch)/i,
    ],
    description: "Find all database tables that a function reads from or writes to",
    buildCypher: (match) => {
      const name = match[1];
      return `MATCH (fn:Function {name: "${name}"})-[rel:READS|WRITES]->(t:DBTable)
RETURN fn.name AS function, type(rel) AS operation, t.name AS table, rel.query AS query
ORDER BY t.name`;
    },
  },

  // 8. "Show me all functions in repository X"
  {
    patterns: [
      /(?:show\s+(?:me\s+)?)?(?:all\s+)?functions?\s+in\s+(?:repo(?:sitory)?\s+)(\S+)/i,
      /list\s+(?:all\s+)?functions?\s+in\s+(?:repo(?:sitory)?\s+)(\S+)/i,
    ],
    description: "List all functions in a given repository",
    buildCypher: (match) => {
      const repo = match[1];
      return `MATCH (fn:Function)-[:DEFINED_IN]->(f:File)-[:IN_REPO]->(r:Repository)
WHERE r.name CONTAINS "${repo}"
RETURN fn.name AS name, fn.category AS category, f.path AS file
ORDER BY f.path, fn.startLine`;
    },
  },

  // 9. "What calls function X?" / "What is called by X?"
  {
    patterns: [
      /what\s+(?:does|is)\s+(?:function\s+)?(\w+)\s+call/i,
      /what\s+does\s+(\w+)\s+invoke/i,
    ],
    description: "Find all functions called by a given function",
    buildCypher: (match) => {
      const name = match[1];
      return `MATCH (caller:Function {name: "${name}"})-[c:CALLS]->(callee:Function)
RETURN callee.name AS calledFunction, callee.category AS category, c.callSite AS callSite
ORDER BY c.callSite`;
    },
  },

  // 10. "How many functions are in each category?"
  {
    patterns: [
      /how\s+many\s+functions?\s+(?:are\s+)?in\s+each\s+category/i,
      /function\s+count\s+by\s+category/i,
      /functions?\s+per\s+category/i,
      /breakdown\s+(?:of\s+)?functions?\s+by\s+category/i,
    ],
    description: "Count functions grouped by category",
    buildCypher: () => {
      return `MATCH (fn:Function)
RETURN fn.category AS category, count(fn) AS count
ORDER BY count DESC`;
    },
  },

  // 11. "Show me all GET/POST/... endpoints"
  {
    patterns: [
      /(?:show\s+(?:me\s+)?)?(?:all\s+)?(GET|POST|PUT|PATCH|DELETE)\s+endpoints?/i,
      /(?:list\s+)?(?:all\s+)?(GET|POST|PUT|PATCH|DELETE)\s+(?:api\s+)?endpoints?/i,
    ],
    description: "List API endpoints filtered by HTTP method",
    buildCypher: (match) => {
      const method = match[1].toUpperCase();
      return `MATCH (e:APIEndpoint {method: "${method}"})
RETURN e.path AS path, e.fullRoute AS fullRoute
ORDER BY e.path`;
    },
  },

  // 12. "What repositories are in project X?"
  {
    patterns: [
      /what\s+repo(?:sitorie)?s?\s+(?:are\s+)?in\s+(?:project\s+)?(\S+)/i,
      /which\s+repo(?:sitorie)?s?\s+(?:are\s+)?in\s+(?:project\s+)?(\S+)/i,
      /list\s+repo(?:sitorie)?s?\s+in\s+(?:project\s+)?(\S+)/i,
    ],
    description: "List all repositories in a given project",
    buildCypher: (match) => {
      const project = match[1];
      return `MATCH (r:Repository)-[:BELONGS_TO]->(p:Project)
WHERE p.name CONTAINS "${project}"
RETURN r.name AS repository, r.language AS language, r.url AS url
ORDER BY r.name`;
    },
  },

  // 13. "Find dead code" / "unused functions"
  {
    patterns: [
      /find\s+dead\s+code/i,
      /unused\s+functions?/i,
      /functions?\s+(?:that\s+are\s+)?never\s+called/i,
    ],
    description: "Find functions that are never called by any other function",
    buildCypher: () => {
      return `MATCH (fn:Function)
WHERE NOT exists { (caller:Function)-[:CALLS]->(fn) }
  AND fn.category <> "API_ENDPOINT"
  AND fn.category <> "UI_INTERACTION"
RETURN fn.name AS name, fn.category AS category, fn.signature AS signature
ORDER BY fn.name`;
    },
  },
];

/**
 * Try to match a question against the pre-built templates.
 * Returns the first matching template result or null.
 */
export function matchTemplate(
  question: string,
): { cypher: string; description: string; match: RegExpMatchArray } | null {
  for (const template of QUERY_TEMPLATES) {
    for (const pattern of template.patterns) {
      const match = question.match(pattern);
      if (match) {
        return {
          cypher: template.buildCypher(match),
          description: template.description,
          match,
        };
      }
    }
  }
  return null;
}
