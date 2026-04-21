import { Router } from "express";
import multer from "multer";
import { z } from "zod";
const upload = multer({ storage: multer.memoryStorage() });
export function createProfileRouter(profileService) {
    const router = Router();
    router.get("/", (_req, res) => {
        res.json(profileService.getProfileStatus());
    });
    router.post("/import", (req, res) => {
        const body = z
            .object({
            resumeText: z.string().default(""),
            autofillText: z.string().default(""),
        })
            .parse(req.body);
        res.json({ profile: profileService.importText(body.resumeText, body.autofillText) });
    });
    router.post("/submit-mode", (req, res) => {
        const body = z.object({
            submitMode: z.enum(["review", "auto"]),
            autoSubmitConfidenceThreshold: z.number().min(0).max(1).optional(),
        }).parse(req.body);
        res.json({
            profile: profileService.updateSubmitMode(body.submitMode, body.autoSubmitConfidenceThreshold),
        });
    });
    router.post("/resume-file", upload.single("resume"), (req, res) => {
        if (!req.file) {
            res.status(400).json({ error: "Resume file is required." });
            return;
        }
        res.json(profileService.saveResumeUpload(req.file));
    });
    return router;
}
