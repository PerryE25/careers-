import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { AdapterRegistry } from "../automation/adapter-registry.js";
import { env } from "../config/env.js";
import { JsonStore } from "../persistence/json-store.js";
import { ApplicationService } from "../services/application-service.js";
import { AtsDetectionService } from "../services/ats-detection-service.js";
import { DocumentService } from "../services/document-service.js";
import { ProfileService } from "../services/profile-service.js";
import { JobSourceImportService } from "../services/job-source-import-service.js";
import { createApplicationRouter } from "./routes/application-routes.js";
import { createProfileRouter } from "./routes/profile-routes.js";
export function createApp() {
    const store = new JsonStore(env.dataFile);
    const profileService = new ProfileService(store, env.uploadsDir);
    const detectionService = new AtsDetectionService();
    const registry = new AdapterRegistry();
    const documentService = new DocumentService(store, env.uploadsDir);
    const jobSourceImportService = new JobSourceImportService(store, detectionService, env.uploadsDir);
    const applicationService = new ApplicationService(store, detectionService, registry, documentService);
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "2mb" }));
    app.get("/api/health", (_req, res) => {
        res.json({ ok: true });
    });
    app.use("/api/profile", createProfileRouter(profileService));
    app.use("/api/applications", createApplicationRouter(detectionService, applicationService, jobSourceImportService));
    const distDir = path.join(process.cwd(), "dist");
    const indexHtmlPath = path.join(distDir, "index.html");
    if (fs.existsSync(indexHtmlPath)) {
        app.use(express.static(distDir));
        app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
            res.sendFile(indexHtmlPath);
        });
    }
    app.use((error, _req, res, _next) => {
        const message = error instanceof Error ? error.message : "Unexpected server error";
        res.status(400).json({ error: message });
    });
    return app;
}
