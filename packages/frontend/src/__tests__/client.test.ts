import { describe, it, expect } from "vitest";
import { ApiError } from "../api/client";

describe("ApiError", () => {
  it("has correct name and status", () => {
    const err = new ApiError(404, "Not found");
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err instanceof Error).toBe(true);
  });
});
