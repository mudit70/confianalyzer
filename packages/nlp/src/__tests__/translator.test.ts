import { describe, it, expect, vi, beforeEach } from "vitest";
import { translateToCypher } from "../translator.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

import Anthropic from "@anthropic-ai/sdk";

describe("translateToCypher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("template matching", () => {
    it("should match 'What functions call fetchUsers?' via template", async () => {
      const result = await translateToCypher("What functions call fetchUsers?");
      expect(result.source).toBe("template");
      expect(result.cypher).toContain("fetchUsers");
      expect(result.cypher).toContain("CALLS");
      expect(result.validation.valid).toBe(true);
      expect(result.validation.isReadOnly).toBe(true);
    });

    it("should match 'Show me all API endpoints' via template", async () => {
      const result = await translateToCypher("Show me all API endpoints");
      expect(result.source).toBe("template");
      expect(result.cypher).toContain("APIEndpoint");
      expect(result.validation.valid).toBe(true);
    });

    it("should match 'Trace from UsersPage to database' via template", async () => {
      const result = await translateToCypher(
        "Trace from UsersPage to database",
      );
      expect(result.source).toBe("template");
      expect(result.cypher).toContain("UsersPage");
      expect(result.cypher).toContain("READS|WRITES");
      expect(result.validation.valid).toBe(true);
    });
  });

  describe("LLM path", () => {
    it("should throw when no template matches and no API key provided", async () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await expect(
        translateToCypher("What is the most complex function?"),
      ).rejects.toThrow("No template matched and no Anthropic API key");

      process.env.ANTHROPIC_API_KEY = originalEnv;
    });

    it("should use LLM and return source='llm' for unmatched questions", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '```cypher\nMATCH (f:Function) RETURN f.name, f.signature ORDER BY size(f.signature) DESC LIMIT 1\n```\nThis finds the function with the longest signature.',
          },
        ],
      });
      vi.mocked(Anthropic).mockImplementation(
        () =>
          ({
            messages: { create: mockCreate },
          }) as unknown as Anthropic,
      );

      const result = await translateToCypher(
        "What is the most complex function?",
        { apiKey: "test-key" },
      );

      expect(result.source).toBe("llm");
      expect(result.cypher).toContain("MATCH");
      expect(result.cypher).toContain("RETURN");
      expect(result.validation.valid).toBe(true);
      expect(result.validation.isReadOnly).toBe(true);
    });

    it("should flag invalid Cypher from LLM", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '```cypher\nMATCH (f:Function) DELETE f\n```\nThis deletes all functions.',
          },
        ],
      });
      vi.mocked(Anthropic).mockImplementation(
        () =>
          ({
            messages: { create: mockCreate },
          }) as unknown as Anthropic,
      );

      const result = await translateToCypher("Delete everything", {
        apiKey: "test-key",
      });

      expect(result.source).toBe("llm");
      expect(result.validation.valid).toBe(false);
      expect(result.validation.isReadOnly).toBe(false);
    });

    it("should extract Cypher from code block without language tag", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '```\nMATCH (f:Function) RETURN f.name LIMIT 5\n```\nReturns 5 function names.',
          },
        ],
      });
      vi.mocked(Anthropic).mockImplementation(
        () =>
          ({
            messages: { create: mockCreate },
          }) as unknown as Anthropic,
      );

      const result = await translateToCypher("Give me some functions", {
        apiKey: "test-key",
      });

      expect(result.source).toBe("llm");
      expect(result.cypher).toBe("MATCH (f:Function) RETURN f.name LIMIT 5");
      expect(result.validation.valid).toBe(true);
    });
  });
});
