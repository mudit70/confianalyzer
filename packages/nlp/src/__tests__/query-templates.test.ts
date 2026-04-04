import { describe, it, expect } from "vitest";
import { QUERY_TEMPLATES, matchTemplate } from "../query-templates.js";
import { validateCypher } from "../cypher-validator.js";

describe("matchTemplate", () => {
  it("should match 'What functions call fetchUsers?'", () => {
    const result = matchTemplate("What functions call fetchUsers?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("fetchUsers");
    expect(result!.cypher).toContain("CALLS");
  });

  it("should match 'Who calls handleSubmit?'", () => {
    const result = matchTemplate("Who calls handleSubmit?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("handleSubmit");
  });

  it("should match 'Show me all API endpoints'", () => {
    const result = matchTemplate("Show me all API endpoints");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("APIEndpoint");
  });

  it("should match 'List all api endpoints'", () => {
    const result = matchTemplate("List all api endpoints");
    expect(result).not.toBeNull();
  });

  it("should match 'What files import utils'", () => {
    const result = matchTemplate("What files import utils");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("utils");
    expect(result!.cypher).toContain("IMPORTS");
  });

  it("should match 'Trace the flow from UsersPage to the database'", () => {
    const result = matchTemplate("Trace the flow from UsersPage to the database");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("UsersPage");
    expect(result!.cypher).toContain("READS|WRITES");
  });

  it("should match 'What functions are in file routes.ts?'", () => {
    const result = matchTemplate("What functions are in file routes.ts?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("routes.ts");
  });

  it("should match 'Which endpoints does the frontend call?'", () => {
    const result = matchTemplate("Which endpoints does the frontend call?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("UI_INTERACTION");
  });

  it("should match 'What tables does function getUser read?'", () => {
    const result = matchTemplate("What tables does function getUser read?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("getUser");
    expect(result!.cypher).toContain("READS|WRITES");
  });

  it("should match 'Show me all functions in repository backend'", () => {
    const result = matchTemplate("Show me all functions in repository backend");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("backend");
  });

  it("should match 'What does fetchData call?'", () => {
    const result = matchTemplate("What does fetchData call?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("fetchData");
  });

  it("should match 'How many functions are in each category?'", () => {
    const result = matchTemplate("How many functions are in each category?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("count");
    expect(result!.cypher).toContain("category");
  });

  it("should match 'Show me all GET endpoints'", () => {
    const result = matchTemplate("Show me all GET endpoints");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain('"GET"');
  });

  it("should match 'What repositories are in project myapp?'", () => {
    const result = matchTemplate("What repositories are in project myapp?");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("myapp");
  });

  it("should match 'find dead code'", () => {
    const result = matchTemplate("find dead code");
    expect(result).not.toBeNull();
    expect(result!.cypher).toContain("NOT exists");
  });

  it("should return null for unmatched questions", () => {
    const result = matchTemplate("How is the weather today?");
    expect(result).toBeNull();
  });

  it("should return null for vague questions", () => {
    const result = matchTemplate("Tell me about the architecture");
    expect(result).toBeNull();
  });
});

describe("all templates generate valid Cypher", () => {
  const testInputs: Record<number, string> = {
    0: "What functions call fetchUsers",
    1: "Show me all API endpoints",
    2: "What files import utils",
    3: "Trace the flow from UsersPage to the database",
    4: "What functions are in file routes.ts",
    5: "Which endpoints does the frontend call",
    6: "What tables does function getUser read",
    7: "Show me all functions in repository backend",
    8: "What does fetchData call",
    9: "How many functions are in each category",
    10: "Show me all GET endpoints",
    11: "What repositories are in project myapp",
    12: "find dead code",
  };

  for (const [index, question] of Object.entries(testInputs)) {
    it(`template ${index}: "${question}" generates valid Cypher`, () => {
      const result = matchTemplate(question);
      expect(result).not.toBeNull();
      const validation = validateCypher(result!.cypher);
      expect(validation.valid).toBe(true);
      expect(validation.isReadOnly).toBe(true);
    });
  }
});
