import { Router } from "express";
import { z } from "zod";
import { agentDebugLog } from "../../debug-agent-session.js";
import { AtsDetectionService } from "../../services/ats-detection-service.js";
import { ApplicationService } from "../../services/application-service.js";
import { JobSourceImportService } from "../../services/job-source-import-service.js";

export function createApplicationRouter(
  detectionService: AtsDetectionService,
  applicationService: ApplicationService,
  jobSourceImportService: JobSourceImportService,
) {
  const router = Router();

  router.post("/detect", (req, res) => {
    const body = z.object({ jobUrl: z.string().url() }).parse(req.body);
    res.json(detectionService.detect(body.jobUrl));
  });

  router.get("/", (_req, res) => {
    res.json({
      items: applicationService.listApplications(),
      stats: applicationService.getStats(),
    });
  });

  router.get("/targets", (req, res) => {
    const query = z.object({
      relevantOnly: z.union([z.literal("true"), z.literal("false")]).optional(),
    }).parse(req.query);
    res.json({
      targets: jobSourceImportService.listJobTargets({
        relevantOnly: query.relevantOnly !== "false",
      }),
    });
  });

  router.post("/import-job-list", (req, res) => {
    const body = z.object({
      relevantOnly: z.boolean().optional(),
    }).parse(req.body ?? {});
    res.json(jobSourceImportService.importLatestJobMarkdown({
      relevantOnly: body.relevantOnly,
    }));
  });

  router.get("/batch/active", (_req, res) => {
    res.json({ batch: applicationService.getActiveBatch() });
  });

  router.get("/batch/:batchId", (req, res) => {
    res.json({ batch: applicationService.getBatch(req.params.batchId) });
  });

  router.post("/start", (req, res) => {
    const body = z
      .object({
        jobUrls: z.array(z.string().url()).min(1),
        submitMode: z.enum(["review", "auto"]).optional(),
      })
      .parse(req.body);
    res.json({
      batch: applicationService.startBatch(body.jobUrls, body.submitMode),
    });
  });

  router.post("/automate", async (req, res, next) => {
    try {
      const body = z
        .object({
          jobUrl: z.string().url(),
          submitMode: z.enum(["review", "auto"]).optional(),
          allowDuplicate: z.boolean().optional(),
        })
        .parse(req.body);
      // #region agent log
      agentDebugLog({
        location: "application-routes.ts:POST /automate",
        message: "automate request received",
        data: {
          hypothesisId: "H5",
          submitMode: body.submitMode ?? null,
          allowDuplicate: Boolean(body.allowDuplicate),
          jobUrlLength: body.jobUrl.length,
        },
      });
      // #endregion
      res.json(
        await applicationService.automate(body.jobUrl, body.submitMode, {
          allowDuplicate: body.allowDuplicate,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
