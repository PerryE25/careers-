import { mapFieldToProfile, summarizeMappingConfidence } from "./shared/field-mapping-engine.js";
import { capturePageState } from "./shared/playwright-utils.js";
export async function runAdapterFlow(adapter, page, jobUrl, context) {
    const statusUpdates = [];
    const fillMappedFields = async (fields, passLabel) => {
        const requiredUnresolved = new Set();
        const decisions = fields.map((field) => mapFieldToProfile(context.profile, field));
        for (const decision of decisions) {
            context.logger?.info("Field mapping decision.", {
                label: decision.field.label,
                normalizedLabel: decision.normalizedLabel,
                type: decision.field.type,
                status: decision.status,
                confidence: decision.confidence,
                reason: decision.reason,
                section: decision.field.section,
                options: decision.field.options,
                domLocator: decision.field.domLocator,
                pass: passLabel,
            });
        }
        const fillQueue = [...decisions].sort((left, right) => {
            const priority = (type) => {
                if (type === "radio" || type === "checkbox") {
                    return 2;
                }
                if (type === "select") {
                    return 1;
                }
                return 0;
            };
            return priority(left.field.type) - priority(right.field.type);
        });
        for (const decision of fillQueue) {
            if (decision.status === "unresolved" || !decision.answer) {
                if (decision.field.required) {
                    requiredUnresolved.add(decision.field.label);
                }
                continue;
            }
            const filled = await adapter.fillField(page, decision.field, decision.answer, context);
            if (filled) {
                context.logger?.info("Filled field.", {
                    label: decision.field.label,
                    type: decision.field.type,
                    confidence: decision.confidence,
                    pass: passLabel,
                });
            }
        }
        const criticalChoiceFields = decisions.filter((decision) => decision.status === "resolved" &&
            Boolean(decision.answer) &&
            decision.field.required &&
            (decision.field.type === "radio" || decision.field.type === "checkbox"));
        for (const decision of criticalChoiceFields) {
            const filled = await adapter.fillField(page, decision.field, decision.answer, context);
            if (filled) {
                context.logger?.info("Reapplied required choice field.", {
                    label: decision.field.label,
                    type: decision.field.type,
                    pass: passLabel,
                });
            }
        }
        return {
            decisions,
            requiredUnresolvedFields: [...requiredUnresolved],
        };
    };
    const reportStatus = async (update) => {
        const targetPage = update.page ?? page;
        const pageState = await capturePageState(targetPage);
        const fullUpdate = {
            stage: update.stage,
            detail: update.detail,
            step: update.step,
            url: targetPage.url(),
            pageState,
        };
        statusUpdates.push(fullUpdate);
        context.logger?.info("Automation status update.", fullUpdate);
    };
    await adapter.openJobPage(page, jobUrl, context);
    await reportStatus({ stage: "open-job-page", detail: "Opened job page." });
    await adapter.clickApply(page, context);
    await reportStatus({ stage: "open-application", detail: "Apply interaction completed." });
    await context.screenshotHook?.("after-click-apply", page);
    const fields = await adapter.extractFormFields(page, context);
    context.logger?.info("Extracted form fields.", {
        provider: adapter.provider,
        fieldCount: fields.length,
    });
    const initialPass = await fillMappedFields(fields, "initial");
    if (context.resume) {
        await adapter.uploadResume(page, context.resume.storagePath, context);
    }
    if (context.coverLetter) {
        await adapter.uploadCoverLetter(page, context.coverLetter.storagePath, context);
    }
    await reportStatus({ stage: "upload-documents", detail: "Document upload stage completed." });
    await adapter.answerScreeningQuestions(page, context);
    await reportStatus({ stage: "answer-screening", detail: "Screening question pass completed." });
    await context.screenshotHook?.("after-screening-questions", page);
    const refreshedFields = await adapter.extractFormFields(page, context);
    context.logger?.info("Re-extracted form fields after initial answers.", {
        provider: adapter.provider,
        fieldCount: refreshedFields.length,
    });
    const finalPass = await fillMappedFields(refreshedFields, "follow-up");
    const step = await adapter.getCurrentStep(page, context);
    await adapter.reviewBeforeSubmit(page, context);
    await reportStatus({ stage: "review-before-submit", detail: "Reached review checkpoint.", step: step.step });
    const collectedErrors = await adapter.collectErrors(page, context);
    await context.screenshotHook?.("final-review", page);
    const mappingDecisions = finalPass.decisions.length > 0 ? finalPass.decisions : initialPass.decisions;
    const unresolvedFields = finalPass.requiredUnresolvedFields.length > 0
        ? finalPass.requiredUnresolvedFields
        : initialPass.requiredUnresolvedFields;
    const confidencePenalty = Math.min(collectedErrors.length * 0.1, 0.3) + Math.min(unresolvedFields.length * 0.06, 0.24);
    const confidenceScore = Math.max(0.4, Math.min(summarizeMappingConfidence(mappingDecisions), 0.92) - confidencePenalty);
    const reviewSummary = buildReviewSummary({
        submitMode: context.submitMode,
        confidenceScore,
        confidenceThreshold: context.profile.autoSubmitConfidenceThreshold,
        unresolvedFields,
        validationErrors: collectedErrors.map((error) => error.fieldLabel ? `${error.fieldLabel}: ${error.message}` : error.message),
        lastCompletedStep: step.step,
    });
    const submitted = reviewSummary.shouldAttemptSubmit
        ? await adapter.submitApplication(page, context)
        : false;
    const finalStatus = submitted
        ? "Applied"
        : reviewSummary.shouldAttemptSubmit
            ? "Failed"
            : reviewSummary.recommendedStatus;
    return {
        status: finalStatus,
        confidenceScore,
        submitAttempted: reviewSummary.shouldAttemptSubmit,
        submitCompleted: submitted,
        step: step.step,
        errors: collectedErrors,
        unresolvedFields,
        statusUpdates,
        reviewSummary: {
            ...reviewSummary,
            submitAttempted: reviewSummary.shouldAttemptSubmit,
            submitCompleted: submitted,
            recommendedStatus: finalStatus,
        },
    };
}
export function buildReviewSummary(params) {
    const blockingReasons = [];
    const roundedConfidence = Number(params.confidenceScore.toFixed(2));
    const roundedThreshold = Number(params.confidenceThreshold.toFixed(2));
    if (params.unresolvedFields.length > 0) {
        blockingReasons.push("Required fields are still unresolved.");
    }
    if (params.validationErrors.length > 0) {
        blockingReasons.push("Validation errors are still present.");
    }
    if (roundedConfidence < roundedThreshold) {
        blockingReasons.push(`Confidence ${roundedConfidence.toFixed(2)} is below the auto-submit threshold ${roundedThreshold.toFixed(2)}.`);
    }
    const eligibleForAutoSubmit = params.unresolvedFields.length === 0 &&
        params.validationErrors.length === 0 &&
        roundedConfidence >= roundedThreshold;
    const shouldAttemptSubmit = eligibleForAutoSubmit;
    const recommendedStatus = shouldAttemptSubmit ? "Applied" : "Failed";
    return {
        mode: params.submitMode,
        confidenceScore: params.confidenceScore,
        confidenceThreshold: params.confidenceThreshold,
        eligibleForAutoSubmit,
        shouldAttemptSubmit,
        submitAttempted: false,
        submitCompleted: false,
        unresolvedRequiredFields: params.unresolvedFields,
        validationErrors: params.validationErrors,
        blockingReasons,
        recommendedStatus,
        lastCompletedStep: params.lastCompletedStep,
    };
}
export async function safelyCount(locator) {
    return locator.count().catch(() => 0);
}
