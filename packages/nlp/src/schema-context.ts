/**
 * Structured description of the Neo4j schema for injection into LLM prompts.
 */
export const SCHEMA_CONTEXT = `
## Neo4j Graph Schema

### Node Types
- Project: { id, name, createdAt }
- Repository: { id, url, name, language, lastAnalyzedAt }
- File: { id, path, language, hash }
- Function: { id, name, signature, category, startLine, endLine }
  - category is one of: UI_INTERACTION, HANDLER, API_CALLER, API_ENDPOINT, DB_CALL, UTILITY
- APIEndpoint: { id, method, path, fullRoute }
  - method is one of: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
- DBTable: { id, name, schema }

### Relationship Types
- (Repository)-[:BELONGS_TO]->(Project)
- (File)-[:IN_REPO]->(Repository)
- (Function)-[:DEFINED_IN]->(File)
- (Function)-[:CALLS { callSite: int }]->(Function)
- (File)-[:IMPORTS { symbols: [string] }]->(File)
- (Function)-[:EXPOSES]->(APIEndpoint)
- (Function)-[:CALLS_API { httpMethod: string, urlPattern: string }]->(APIEndpoint)
- (Function)-[:READS { query?: string }]->(DBTable)
- (Function)-[:WRITES { query?: string }]->(DBTable)

### Indexes
- Function.name, Function.category
- APIEndpoint.method, APIEndpoint.path
- File.path, File.hash
- Full-text: Function.name, APIEndpoint.fullRoute
`;
