import { describe, it, expect } from "vitest";
import { validateCypher } from "../cypher-validator.js";

describe("validateCypher", () => {
  it("should pass valid read-only Cypher", () => {
    const result = validateCypher(
      'MATCH (f:Function) RETURN f.name ORDER BY f.name LIMIT 10',
    );
    expect(result.valid).toBe(true);
    expect(result.isReadOnly).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should pass Cypher with WHERE clause", () => {
    const result = validateCypher(
      'MATCH (f:Function) WHERE f.category = "UTILITY" RETURN f.name',
    );
    expect(result.valid).toBe(true);
    expect(result.isReadOnly).toBe(true);
  });

  it("should pass Cypher with relationship patterns", () => {
    const result = validateCypher(
      'MATCH (a:Function)-[:CALLS]->(b:Function) RETURN a.name, b.name',
    );
    expect(result.valid).toBe(true);
    expect(result.isReadOnly).toBe(true);
  });

  it("should reject CREATE operations", () => {
    const result = validateCypher(
      'CREATE (n:Function {name: "test"}) RETURN n',
    );
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(false);
    expect(result.errors.some((e) => e.includes("CREATE"))).toBe(true);
  });

  it("should reject DELETE operations", () => {
    const result = validateCypher(
      'MATCH (n:Function) DELETE n',
    );
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(false);
    expect(result.errors.some((e) => e.includes("DELETE"))).toBe(true);
  });

  it("should reject SET operations", () => {
    const result = validateCypher(
      'MATCH (n:Function) SET n.name = "hacked" RETURN n',
    );
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(false);
  });

  it("should reject MERGE operations", () => {
    const result = validateCypher(
      'MERGE (n:Function {name: "test"}) RETURN n',
    );
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(false);
  });

  it("should reject DROP operations", () => {
    const result = validateCypher("DROP INDEX idx_function_name");
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(false);
  });

  it("should reject REMOVE operations", () => {
    const result = validateCypher(
      "MATCH (n:Function) REMOVE n.category RETURN n",
    );
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(false);
  });

  it("should detect unbalanced parentheses", () => {
    const result = validateCypher(
      "MATCH (f:Function RETURN f.name",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unmatched"))).toBe(true);
  });

  it("should detect unbalanced brackets", () => {
    const result = validateCypher(
      "MATCH (a)-[:CALLS->(b) RETURN a",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unmatched"))).toBe(true);
  });

  it("should detect unbalanced curly braces", () => {
    const result = validateCypher(
      'MATCH (f:Function {name: "test") RETURN f',
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /[Uu]nmatched|[Mm]ismatched/.test(e))).toBe(true);
  });

  it("should flag missing RETURN clause", () => {
    const result = validateCypher(
      "MATCH (f:Function) WITH f LIMIT 10",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("RETURN"))).toBe(true);
  });

  it("should fail on empty input", () => {
    const result = validateCypher("");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
  });

  it("should fail on gibberish input", () => {
    const result = validateCypher("hello world this is not cypher");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("keyword"))).toBe(true);
  });

  it("should not trip on strings containing bracket characters", () => {
    const result = validateCypher(
      'MATCH (f:Function) WHERE f.name = "test()" RETURN f.name',
    );
    expect(result.valid).toBe(true);
  });
});
