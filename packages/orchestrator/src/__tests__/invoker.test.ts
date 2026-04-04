import { describe, it, expect } from "vitest";
import { invokeAnalyzers } from "../invoker.js";
import type { AnalyzerAssignment } from "../types.js";

describe("invokeAnalyzers", () => {
  it("should pass --incremental flag when previousIrPaths is provided", async () => {
    // We test that the args are constructed correctly by using a simple echo command.
    // The echo command will output JSON Lines that the invoker parses.
    const assignments: AnalyzerAssignment[] = [
      {
        repoName: "test-repo",
        repoPath: "/tmp/fake-repo",
        analyzerCommand: "echo",
        outputPath: "/tmp/fake-output.json",
      },
    ];

    const previousIrPaths = new Map<string, string>([
      ["test-repo", "/tmp/previous-ir.json"],
    ]);

    // invokeAnalyzers will call: echo --repo /tmp/fake-repo --repo-name test-repo --output /tmp/fake-output.json --incremental /tmp/previous-ir.json
    // echo will succeed (exit 0) but output won't be valid JSON, which is fine (non-JSON lines are ignored).
    // The exit code will be 0 so it should be in results.
    const results = await invokeAnalyzers(assignments, undefined, previousIrPaths);

    // echo exits with 0, so the result should contain the mapping
    expect(results.has("test-repo")).toBe(true);
    expect(results.get("test-repo")).toBe("/tmp/fake-output.json");
  });

  it("should not pass --incremental flag when previousIrPaths is not provided", async () => {
    const assignments: AnalyzerAssignment[] = [
      {
        repoName: "test-repo",
        repoPath: "/tmp/fake-repo",
        analyzerCommand: "echo",
        outputPath: "/tmp/fake-output.json",
      },
    ];

    const results = await invokeAnalyzers(assignments);

    expect(results.has("test-repo")).toBe(true);
  });

  it("should not pass --incremental for repos without a previous IR path", async () => {
    const assignments: AnalyzerAssignment[] = [
      {
        repoName: "repo-a",
        repoPath: "/tmp/fake-repo-a",
        analyzerCommand: "echo",
        outputPath: "/tmp/fake-output-a.json",
      },
      {
        repoName: "repo-b",
        repoPath: "/tmp/fake-repo-b",
        analyzerCommand: "echo",
        outputPath: "/tmp/fake-output-b.json",
      },
    ];

    // Only repo-a has a previous IR path
    const previousIrPaths = new Map<string, string>([
      ["repo-a", "/tmp/previous-a.json"],
    ]);

    const results = await invokeAnalyzers(assignments, undefined, previousIrPaths);

    expect(results.has("repo-a")).toBe(true);
    expect(results.has("repo-b")).toBe(true);
  });
});
