import express from "express";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import projectRoutes from "./routes/projects.js";
import graphRoutes from "./routes/graph.js";
import nlpRoutes from "./routes/nlp.js";
import analysisRoutes from "./routes/analysis.js";

export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(corsMiddleware);
  app.use(express.json());

  // Routes
  app.use("/api/projects", projectRoutes);
  app.use("/api/analysis", analysisRoutes);
  app.use("/api/query/nlp", nlpRoutes);

  // Graph routes are mounted at /api since they handle multiple top-level paths
  app.use("/api", graphRoutes);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
