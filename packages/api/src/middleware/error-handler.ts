import type { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[API Error]", err.message);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Neo4j connection errors
  if (err.message?.includes("Could not perform discovery") ||
      err.message?.includes("connect ECONNREFUSED") ||
      err.message?.includes("ServiceUnavailable")) {
    res.status(503).json({
      error: "Neo4j database is not available. Please ensure it is running.",
    });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
