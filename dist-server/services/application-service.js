import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runAdapterFlow } from "../automation/adapter.js";
import { capturePageState } from "../automation/shared/playwright-utils.js";
import { env } from "../config/env.js";
import { buildAutomationError, classifyReviewSummaryErrors, classifyThrownAutomationError, duplicateDetectedError, } from "./automation-error-utils.js";
import { parseProfileText } from "./profile-parser.js";
import { evaluateProfileReadiness } from "./profile-readiness.js";
export class ApplicationService {
    store;
    detector;
    registry;
    documents;
    batches = new Map();
    constructor(store, detector, registry, documents) {
        this.store = store;
        this.detector = detector;
        this.registry = registry;
        this.documents = documents;
    }
    listApplications() {
        return this.store.listApplications();
    }
    getStats() {
        return this.store.getTrackerStats();
    }
    syncDerivedProfileFields() {
        const profile = this.store.getProfile();
        if (!profile) {
            return null;
        }
        const parsed = parseProfileText(profile.resumeText ?? "", profile.autofillText ?? "");
        const shouldRefresh = JSON.stringify(profile.autofillFields ?? {}) !== JSON.stringify(parsed.autofillFields) ||
            JSON.stringify(profile.canonicalProfile ?? {}) !== JSON.stringify(parsed.canonicalProfile) ||
            JSON.stringify(profile.validation ?? {}) !== JSON.stringify(parsed.validation);
        if (!shouldRefresh) {
            return profile;
        }
        return this.store.upsertProfile({
            resumeText: profile.resumeText ?? "",
            autofillText: profile.autofillText ?? "",
            autofillFields: parsed.autofillFields,
            canonicalProfile: parsed.canonicalProfile,
            validation: parsed.validation,
            submitMode: profile.submitMode ?? "review",
            autoSubmitConfidenceThreshold: profile.autoSubmitConfidenceThreshold ?? 0.85,
        });
    }
    getSavedProfileSources() {
        const profile = this.syncDerivedProfileFields();
        const resume = profile ? this.documents.selectResume({ profileId: profile.id }) : undefined;
        const readiness = evaluateProfileReadiness(profile);
        return {
            profile,
            resume,
            readiness,
            hasResumeText: readiness.hasResumeText,
            hasAutofillText: readiness.hasAutofillText,
            hasResumeFile: Boolean(resume),
        };
    }
    assertSavedProfileSourcesReady() {
        const sources = this.getSavedProfileSources();
        if (!sources.profile || !sources.readiness.ready) {
            throw new Error(sources.readiness.issues[0]?.actionableMessage ??
                "Saved profile text is incomplete. Add your resume text and autofill text before starting.");
        }
        if (!sources.hasResumeFile) {
            throw new Error("Saved resume file is missing. Upload your resume file before starting. Automation uses saved autofill text for answers and saved resume text for projects, skills, education, and technical background.");
        }
        return {
            ...sources,
            profile: sources.profile,
            resume: sources.resume,
        };
    }
    snapshotBatch(batch) {
        return {
            id: batch.id,
            status: batch.status,
            total: batch.total,
            queued: batch.queued,
            started: batch.started,
            completed: batch.completed,
            failedToStart: batch.failedToStart,
            currentJobUrl: batch.currentJobUrl,
            lastError: batch.lastError,
            createdAt: batch.createdAt,
            updatedAt: batch.updatedAt,
            finishedAt: batch.finishedAt,
            stats: this.getStats(),
        };
    }
    touchBatch(batchId, patch) {
        const existing = this.batches.get(batchId);
        if (!existing) {
            return undefined;
        }
        const updated = {
            ...existing,
            ...patch,
            updatedAt: new Date().toISOString(),
        };
        this.batches.set(batchId, updated);
        return updated;
    }
    getActiveBatchState() {
        return [...this.batches.values()]
            .filter((batch) => batch.status === "running")
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    }
    getActiveBatch() {
        const batch = this.getActiveBatchState();
        return batch ? this.snapshotBatch(batch) : null;
    }
    getBatch(batchId) {
        const batch = this.batches.get(batchId);
        return batch ? this.snapshotBatch(batch) : null;
    }
    startBatch(jobUrls, submitMode) {
        const active = this.getActiveBatchState();
        if (active) {
            return this.snapshotBatch(active);
        }
        const sources = this.assertSavedProfileSourcesReady();
        const profile = sources.profile;
        if (!profile) {
            throw new Error("Saved profile text is incomplete. Add your resume text and autofill text before starting.");
        }
        const resolvedSubmitMode = submitMode ?? profile.submitMode;
        const uniqueJobUrls = [...new Set(jobUrls.map((value) => value.trim()).filter(Boolean))];
        if (uniqueJobUrls.length === 0) {
            throw new Error("No saved job targets were available to start.");
        }
        const now = new Date().toISOString();
        const batch = {
            id: randomUUID(),
            submitMode: resolvedSubmitMode,
            total: uniqueJobUrls.length,
            queued: uniqueJobUrls.length,
            started: 0,
            completed: 0,
            failedToStart: 0,
            status: "running",
            createdAt: now,
            updatedAt: now,
            jobUrls: uniqueJobUrls,
        };
        this.batches.set(batch.id, batch);
        void this.runBatch(batch.id);
        return this.snapshotBatch(batch);
    }
    async runBatch(batchId) {
        const initial = this.batches.get(batchId);
        if (!initial) {
            return;
        }
        for (const jobUrl of initial.jobUrls) {
            this.touchBatch(batchId, {
                queued: Math.max(0, (this.batches.get(batchId)?.queued ?? 0) - 1),
                started: (this.batches.get(batchId)?.started ?? 0) + 1,
                currentJobUrl: jobUrl,
            });
            try {
                await this.automate(jobUrl, initial.submitMode);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Failed to start automation.";
                this.touchBatch(batchId, {
                    failedToStart: (this.batches.get(batchId)?.failedToStart ?? 0) + 1,
                    lastError: message,
                });
            }
            finally {
                this.touchBatch(batchId, {
                    completed: (this.batches.get(batchId)?.completed ?? 0) + 1,
                });
            }
        }
        const finalState = this.batches.get(batchId);
        if (!finalState) {
            return;
        }
        this.touchBatch(batchId, {
            status: finalState.failedToStart === finalState.total ? "failed" : "completed",
            currentJobUrl: undefined,
            finishedAt: new Date().toISOString(),
        });
    }
    createDuplicateApplication(params) {
        return this.store.createApplication({
            jobId: params.jobId,
            profileId: params.profileId,
            companyName: params.companyName,
            roleTitle: params.roleTitle,
            atsProvider: params.atsProvider,
            sourceJobUrl: params.sourceJobUrl,
            canonicalJobUrl: params.canonicalJobUrl,
            location: params.location,
            salary: params.salary,
            applicationDate: new Date().toISOString(),
            status: "Duplicate",
            submitMode: params.submitMode,
            confidenceScore: params.confidenceScore,
            unresolvedRequiredFields: [],
            screenshotPaths: [],
            failureScreenshotPaths: [],
            failureLogIds: [],
            notes: "Blocked duplicate automation run.",
            duplicate: true,
            duplicateOfApplicationId: params.duplicateOfApplicationId,
            duplicateReasons: params.duplicateReasons,
            errorDetails: params.errorDetails,
            lastError: params.errorDetails[0],
        });
    }
    blockDuplicate(params) {
        const errorDetails = [
            duplicateDetectedError({
                provider: params.atsProvider,
                url: params.canonicalJobUrl ?? params.sourceJobUrl,
                currentStep: "duplicate-check",
                details: {
                    duplicateOfApplicationId: params.duplicateOfApplicationId,
                    reasons: params.duplicateReasons,
                },
            }),
        ];
        const application = this.createDuplicateApplication({
            ...params,
            errorDetails,
        });
        return {
            duplicate: true,
            blocked: true,
            application,
            errorDetails,
            duplicateMatch: {
                duplicateOfApplicationId: params.duplicateOfApplicationId,
                reasons: params.duplicateReasons,
            },
        };
    }
    buildApplicationSnapshot(params) {
        return {
            companyName: params.companyName,
            roleTitle: params.roleTitle,
            atsProvider: params.atsProvider,
            sourceJobUrl: params.sourceJobUrl,
            canonicalJobUrl: params.canonicalJobUrl,
            location: params.location,
            salary: params.salary,
        };
    }
    toAutomationDocument(document) {
        return {
            id: document.id,
            kind: document.kind,
            fileName: document.fileName,
            storagePath: document.filePath,
            mimeType: document.mimeType,
            source: document.source,
            profileId: document.profileId,
            applicationId: document.applicationId,
            createdAt: new Date().toISOString(),
        };
    }
    createRunLogger(runId, structuredIssues, provider) {
        const record = (level, message, data) => {
            const category = (typeof data?.category === "string" ? data.category : undefined);
            const details = data ? { ...data } : undefined;
            if (details && "category" in details) {
                delete details.category;
            }
            this.store.addEvent({
                runId,
                level,
                message,
                category,
                details,
            });
            if ((level === "warn" || level === "error") && category) {
                structuredIssues.push(buildAutomationError({
                    category: category,
                    code: String(details?.code ?? category),
                    message,
                    provider: provider ?? undefined,
                    url: typeof details?.url === "string" ? details.url : undefined,
                    currentStep: typeof details?.currentStep === "string" ? details.currentStep : undefined,
                    selector: typeof details?.selector === "string" ? details.selector : undefined,
                    fieldLabel: typeof details?.fieldLabel === "string" ? details.fieldLabel : undefined,
                    resumeFromStep: typeof details?.resumeFromStep === "string" ? details.resumeFromStep : undefined,
                    details,
                }));
            }
        };
        return {
            info: (message, data) => record("info", message, data),
            warn: (message, data) => record("warn", message, data),
            error: (message, data) => record("error", message, data),
        };
    }
    deriveLastSafeStep(result) {
        const lastUpdate = result.statusUpdates?.at(-1);
        return lastUpdate?.step ?? lastUpdate?.stage ?? result.step;
    }
    async automate(jobUrl, submitMode, options = {}) {
        const { profile } = this.assertSavedProfileSourcesReady();
        const resolvedSubmitMode = submitMode ?? profile.submitMode;
        const detection = this.detector.detect(jobUrl);
        if (detection.provider === "unknown") {
            throw new Error("Unsupported ATS provider. Currently supported: Lever, Greenhouse, Workday-style.");
        }
        const adapter = this.registry.resolve(jobUrl);
        if (!adapter) {
            throw new Error(`No adapter registered for ${detection.provider}.`);
        }
        const job = this.store.upsertJob({ normalizedUrl: detection.canonicalUrl }, {
            provider: detection.provider,
            sourceUrl: jobUrl,
            company: undefined,
            title: undefined,
            location: undefined,
            externalJobId: undefined,
        });
        const initialDuplicate = this.store.findDuplicateApplication({
            provider: detection.provider,
            normalizedUrl: detection.canonicalUrl,
        });
        if (initialDuplicate && !options.allowDuplicate) {
            return this.blockDuplicate({
                profileId: profile.id,
                companyName: job.company,
                roleTitle: job.title,
                atsProvider: detection.provider,
                sourceJobUrl: jobUrl,
                canonicalJobUrl: detection.canonicalUrl,
                location: job.location,
                jobId: job.id,
                submitMode: resolvedSubmitMode,
                confidenceScore: detection.confidence,
                duplicateOfApplicationId: initialDuplicate.application.id,
                duplicateReasons: initialDuplicate.reasons,
            });
        }
        fs.mkdirSync(env.screenshotsDir, { recursive: true });
        const browser = await chromium.launch({ headless: env.browserHeadless });
        let run;
        let application;
        const screenshotPaths = [];
        const structuredIssues = [];
        try {
            const page = await browser.newPage();
            const metadataLogger = {
                info() { },
                warn() { },
                error() { },
            };
            const metadataScreenshotHook = async () => { };
            await adapter.openJobPage(page, jobUrl, {
                profile,
                submitMode: resolvedSubmitMode,
                logger: metadataLogger,
                screenshotHook: metadataScreenshotHook,
            });
            const metadata = await adapter.extractJobMetadata(page, jobUrl, {
                profile,
                submitMode: resolvedSubmitMode,
                logger: metadataLogger,
                screenshotHook: metadataScreenshotHook,
            });
            const hydratedJob = this.store.upsertJob({ normalizedUrl: detection.canonicalUrl }, {
                provider: detection.provider,
                sourceUrl: jobUrl,
                company: metadata.company,
                title: metadata.title,
                location: metadata.location,
                externalJobId: metadata.externalJobId,
            });
            const metadataDuplicate = this.store.findDuplicateApplication({
                provider: detection.provider,
                normalizedUrl: detection.canonicalUrl,
                company: hydratedJob.company,
                title: hydratedJob.title,
                externalJobId: hydratedJob.externalJobId,
            });
            if (metadataDuplicate && !options.allowDuplicate) {
                return this.blockDuplicate({
                    profileId: profile.id,
                    companyName: hydratedJob.company,
                    roleTitle: hydratedJob.title,
                    atsProvider: detection.provider,
                    sourceJobUrl: jobUrl,
                    canonicalJobUrl: detection.canonicalUrl,
                    location: hydratedJob.location,
                    salary: metadata.salary,
                    jobId: hydratedJob.id,
                    submitMode: resolvedSubmitMode,
                    confidenceScore: detection.confidence,
                    duplicateOfApplicationId: metadataDuplicate.application.id,
                    duplicateReasons: metadataDuplicate.reasons,
                });
            }
            application = this.store.createApplication({
                jobId: hydratedJob.id,
                profileId: profile.id,
                ...this.buildApplicationSnapshot({
                    companyName: hydratedJob.company,
                    roleTitle: hydratedJob.title,
                    atsProvider: detection.provider,
                    sourceJobUrl: jobUrl,
                    canonicalJobUrl: detection.canonicalUrl,
                    location: hydratedJob.location,
                    salary: metadata.salary,
                }),
                applicationDate: new Date().toISOString(),
                status: "Not Started",
                submitMode: resolvedSubmitMode,
                confidenceScore: detection.confidence,
                unresolvedRequiredFields: [],
                screenshotPaths: [],
                failureScreenshotPaths: [],
                failureLogIds: [],
                notes: options.allowDuplicate
                    ? "Application created with duplicate override enabled."
                    : "Application created and queued for automation.",
                duplicate: false,
            });
            const resume = this.documents.selectResume({ profileId: profile.id });
            const coverLetter = this.documents.generateCoverLetter({
                applicationId: application.id,
                profile,
                job: hydratedJob,
            });
            application = this.store.updateApplication(application.id, {
                resumeDocumentId: resume?.id,
                coverLetterDocumentId: coverLetter.id,
                resumePath: resume?.filePath,
                coverLetterPath: coverLetter.filePath,
            });
            run = this.store.createRun({
                applicationId: application.id,
                provider: detection.provider,
                status: "In Progress",
                startedAt: new Date().toISOString(),
                confidenceScore: detection.confidence,
                submitAttempted: false,
                submitCompleted: false,
                lastSafeStep: "job-details",
                unresolvedRequiredFields: [],
                screenshotPaths: [],
            });
            application = this.store.updateApplication(application.id, {
                status: "In Progress",
                lastRunId: run.id,
            });
            this.store.addEvent({ runId: run.id, level: "info", message: `Detected provider ${detection.provider}.` });
            if (options.allowDuplicate) {
                this.store.addEvent({
                    runId: run.id,
                    level: "warn",
                    message: "Duplicate override enabled for this automation run.",
                });
            }
            const runId = run.id;
            const logger = this.createRunLogger(runId, structuredIssues, detection.provider);
            const screenshotHook = async (name, currentPage = page) => {
                const safeName = name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
                const filePath = path.join(env.screenshotsDir, `${runId}-${safeName}.png`);
                await currentPage.screenshot({ path: filePath, fullPage: true }).catch(() => undefined);
                screenshotPaths.push(filePath);
                this.store.updateRun(runId, { screenshotPaths: [...new Set(screenshotPaths)] });
                logger.info(`Screenshot checkpoint: ${name}.`, { filePath });
            };
            const result = adapter.fillApplication
                ? await adapter.fillApplication(page, {
                    profile,
                    resume: resume ? this.toAutomationDocument(resume) : undefined,
                    coverLetter: this.toAutomationDocument(coverLetter),
                    submitMode: resolvedSubmitMode,
                    logger,
                    screenshotHook,
                })
                : await runAdapterFlow(adapter, page, jobUrl, {
                    profile,
                    resume: resume ? this.toAutomationDocument(resume) : undefined,
                    coverLetter: this.toAutomationDocument(coverLetter),
                    submitMode: resolvedSubmitMode,
                    logger,
                    screenshotHook,
                });
            for (const update of result.statusUpdates ?? []) {
                this.store.addEvent({
                    runId: run.id,
                    level: "info",
                    message: "Automation status update.",
                    details: update,
                });
            }
            const reviewErrors = result.status !== "Applied" && result.reviewSummary
                ? classifyReviewSummaryErrors({
                    summary: result.reviewSummary,
                    provider: detection.provider,
                    url: page.url(),
                    currentStep: result.step,
                    domSnapshot: result.statusUpdates?.at(-1)?.pageState,
                })
                : [];
            const errorDetails = [...reviewErrors, ...structuredIssues];
            const lastSafeStep = this.deriveLastSafeStep(result);
            this.store.updateRun(run.id, {
                status: result.status,
                finishedAt: new Date().toISOString(),
                confidenceScore: result.confidenceScore,
                submitAttempted: result.submitAttempted,
                submitCompleted: result.submitCompleted,
                lastCompletedStep: result.step,
                lastSafeStep,
                unresolvedRequiredFields: result.unresolvedFields ?? [],
                screenshotPaths: [...new Set(screenshotPaths)],
                errorDetails,
                lastError: errorDetails[0],
            });
            const updatedApplication = this.store.updateApplication(application.id, {
                ...this.buildApplicationSnapshot({
                    companyName: hydratedJob.company,
                    roleTitle: hydratedJob.title,
                    atsProvider: detection.provider,
                    sourceJobUrl: jobUrl,
                    canonicalJobUrl: detection.canonicalUrl,
                    location: hydratedJob.location,
                    salary: metadata.salary,
                }),
                status: result.status,
                confidenceScore: result.confidenceScore,
                lastCompletedStep: result.step,
                lastSafeStep,
                unresolvedRequiredFields: result.unresolvedFields ?? [],
                screenshotPaths: [...new Set(screenshotPaths)],
                reviewSummary: result.reviewSummary,
                errorDetails,
                lastError: errorDetails[0],
                notes: result.status === "Applied"
                    ? "Application automation reached the final submit stage."
                    : `Application automation stopped before a successful submission${result.step ? ` at step ${result.step}` : ""}.`,
            });
            this.store.addEvent({
                runId: run.id,
                level: "info",
                message: `Automation finished with status ${updatedApplication.status}.`,
            });
            return {
                duplicate: false,
                blocked: false,
                application: updatedApplication,
                duplicateMatch: undefined,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown automation error";
            let errorState;
            let failureScreenshotPath;
            let domSnapshot;
            try {
                const page = browser.contexts()[0]?.pages?.()[0];
                if (page) {
                    const screenshotPrefix = run?.id ?? "pre-run";
                    failureScreenshotPath = path.join(env.screenshotsDir, `${screenshotPrefix}-failure-${Date.now()}.png`);
                    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => undefined);
                    domSnapshot = await capturePageState(page).catch(() => undefined);
                    errorState = {
                        url: page.url(),
                        title: await page.title().catch(() => undefined),
                        headings: await page.locator("h1, h2, h3").allTextContents().catch(() => []),
                    };
                }
            }
            catch {
                errorState = undefined;
            }
            if (run && application) {
                const classifiedError = classifyThrownAutomationError({
                    error,
                    provider: application.atsProvider,
                    url: domSnapshot?.url ?? application.sourceJobUrl,
                    currentStep: application.lastCompletedStep,
                    resumeFromStep: application.lastSafeStep ?? application.lastCompletedStep,
                    domSnapshot,
                });
                this.store.updateRun(run.id, {
                    status: "Failed",
                    finishedAt: new Date().toISOString(),
                    lastCompletedStep: application.lastCompletedStep,
                    lastSafeStep: application.lastSafeStep ?? application.lastCompletedStep,
                    unresolvedRequiredFields: application.unresolvedRequiredFields,
                    screenshotPaths: [...new Set(failureScreenshotPath ? [...screenshotPaths, failureScreenshotPath] : screenshotPaths)],
                    errorMessage: message,
                    errorDetails: [classifiedError, ...structuredIssues],
                    lastError: classifiedError,
                });
                const errorEvent = this.store.addEvent({
                    runId: run.id,
                    level: "error",
                    message,
                    category: classifiedError.category,
                    details: {
                        ...errorState,
                        provider: application.atsProvider,
                        currentStep: application.lastCompletedStep,
                        resumeFromStep: application.lastSafeStep ?? application.lastCompletedStep,
                        readableMessage: classifiedError.readableMessage,
                    },
                });
                const failed = this.store.updateApplication(application.id, {
                    status: "Failed",
                    screenshotPaths: [...new Set(failureScreenshotPath ? [...screenshotPaths, failureScreenshotPath] : screenshotPaths)],
                    failureScreenshotPaths: failureScreenshotPath ? [failureScreenshotPath] : [],
                    failureLogIds: [errorEvent.id],
                    reviewSummary: application.reviewSummary,
                    errorDetails: [classifiedError, ...structuredIssues],
                    lastError: classifiedError,
                    notes: classifiedError.readableMessage,
                });
                return {
                    duplicate: false,
                    blocked: false,
                    application: failed,
                    duplicateMatch: undefined,
                };
            }
            throw error;
        }
        finally {
            await browser.close();
        }
    }
}
