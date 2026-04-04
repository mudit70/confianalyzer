import { Router, type Request, type Response, type NextFunction } from "express";
import { triggerAnalysis, getRunStatus } from "../services/analysis.js";
import { ApiError } from "../middleware/error-handler.js";

const router = Router();

/**
 * POST /api/analysis/run — trigger a new analysis run
 */
router.post("/run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectName } = req.body as { projectName?: string };
    if (!projectName) {
      throw new ApiError(400, "'projectName' is required");
    }

    const run = await triggerAnalysis(projectName);
    res.status(202).json({ runId: run.runId });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      next(new ApiError(404, err.message));
    } else if (err instanceof Error && err.message.includes("no repositories")) {
      next(new ApiError(400, err.message));
    } else {
      next(err);
    }
  }
});

/**
 * GET /api/analysis/status/:runId — get analysis run status
 */
router.get("/status/:runId", (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
    const run = getRunStatus(runId);
    if (!run) {
      throw new ApiError(404, `Run '${req.params.runId}' not found`);
    }

    // Shape the response based on status
    if (run.status === "completed" && run.result) {
      res.json({
        runId: run.runId,
        status: run.status,
        projectName: run.projectName,
        result: run.result,
      });
    } else if (run.status === "failed") {
      res.json({
        runId: run.runId,
        status: run.status,
        projectName: run.projectName,
        error: run.error,
        progress: run.progress,
      });
    } else {
      res.json({
        runId: run.runId,
        status: run.status,
        projectName: run.projectName,
        progress: run.progress,
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
