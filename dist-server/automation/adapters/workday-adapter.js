import { buildReviewSummary } from "../adapter.js";
import { WORKDAY_NEXT_BUTTON_SELECTORS, WORKDAY_SELECTORS, WORKDAY_STEP_NAME_SELECTORS, WORKDAY_SUBMIT_BUTTON_SELECTORS, } from "./configs/workday-selectors.js";
import { BaseAtsAdapter } from "../shared/base-adapter.js";
import { uploadAndVerifyFile } from "../shared/document-upload-utils.js";
import { mapFieldToProfile } from "../shared/field-mapping-engine.js";
import { clickFirst, extractBasicFormFields } from "../shared/form-utils.js";
import { capturePageState, waitForAnyVisible, waitForAsyncValidation, waitForPageReady, waitForPageStateChange } from "../shared/playwright-utils.js";
import { captureStepSnapshot, clickFirstVisible } from "../shared/step-flow-utils.js";
export class WorkdayAdapter extends BaseAtsAdapter {
    provider = "workday";
    selectors = WORKDAY_SELECTORS;
    canHandle(url, html) {
        const lowerHtml = html?.toLowerCase() ?? "";
        return (url.includes("workday") ||
            lowerHtml.includes("data-automation-id=\"applymanually\"") ||
            lowerHtml.includes("data-automation-id=\"pagefooternextbutton\""));
    }
    async openJobPage(page, url, context) {
        await super.openJobPage(page, url, context);
        await waitForPageReady(page);
    }
    async clickApply(page, context) {
        const formVisible = await page
            .locator("[data-automation-id='stepName']:visible, form:visible")
            .count()
            .catch(() => 0);
        if (formVisible > 0) {
            context.logger?.info("Workday application flow already visible.");
            return;
        }
        const clicked = await clickFirst(page, this.selectors.applyButtons.primary);
        context.logger?.info("Attempted Workday apply click.", { clicked });
        if (clicked) {
            await waitForAnyVisible(page, this.selectors.jobPage.formRoots ?? ["form"], 5000);
            await waitForAsyncValidation(page);
            return;
        }
        context.logger?.warn("Workday apply control was not found or was not clickable.", {
            category: "selector-not-found",
            code: "workday_apply_selector_not_found",
            provider: this.provider,
            selector: this.selectors.applyButtons.primary.join(" | "),
            currentStep: "job-details",
            resumeFromStep: "job-details",
            url: page.url(),
        });
    }
    async extractFormFields(page, context) {
        const fields = await extractBasicFormFields(page);
        const relevant = fields.filter((field) => {
            const section = field.section?.toLowerCase() ?? "";
            const label = field.label.toLowerCase();
            const selector = field.domLocator.selector ?? "";
            return (field.visible !== false &&
                (section.includes("my information") ||
                    section.includes("questions") ||
                    section.includes("application") ||
                    section.includes("resume") ||
                    label !== "unknown" ||
                    selector.includes("data-automation")));
        });
        context.logger?.info("Workday fields extracted.", {
            totalFields: relevant.length,
            requiredFields: relevant.filter((field) => field.required).length,
        });
        return relevant;
    }
    async fillField(page, field, value, context) {
        if (field.type === "checkbox" &&
            /(consent|privacy|terms|data processing|acknowledg)/i.test(`${field.label} ${field.section ?? ""}`) &&
            !/(marketing|newsletter|sms)/i.test(`${field.label} ${field.section ?? ""}`)) {
            const selector = field.domLocator.selector;
            if (!selector) {
                return false;
            }
            const locator = page.locator(selector).first();
            await locator.check().catch(() => undefined);
            context.logger?.info("Checked Workday consent checkbox.", { label: field.label });
            return true;
        }
        return super.fillField(page, field, value, context);
    }
    async uploadResume(page, filePath, context) {
        for (const selector of this.selectors.uploads.resumeInputs) {
            const locator = page.locator(selector).first();
            if ((await locator.count().catch(() => 0)) === 0) {
                continue;
            }
            const dataId = (await locator.getAttribute("data-automation-id").catch(() => null))?.toLowerCase() ?? "";
            if (dataId.includes("resume") || selector.includes("resume") || selector === "input[type='file']") {
                const result = await uploadAndVerifyFile(page, selector, filePath);
                if (result.ok) {
                    context.logger?.info("Uploaded Workday resume.", { selector, dataId });
                    return true;
                }
                context.logger?.warn("Workday resume upload failed.", { selector, dataId, reason: result.reason });
            }
        }
        return super.uploadResume(page, filePath, context);
    }
    async uploadCoverLetter(page, filePath, context) {
        const fileInputs = await page.locator("input[type='file']").all().catch(() => []);
        for (const locator of fileInputs) {
            const rawDataId = (await locator.getAttribute("data-automation-id").catch(() => null)) ?? "";
            const rawAriaLabel = (await locator.getAttribute("aria-label").catch(() => null)) ?? "";
            const dataId = rawDataId.toLowerCase();
            const ariaLabel = rawAriaLabel.toLowerCase();
            if (dataId.includes("cover") || ariaLabel.includes("cover")) {
                const selector = rawDataId
                    ? `input[type='file'][data-automation-id='${rawDataId}']`
                    : "input[type='file']";
                const result = await uploadAndVerifyFile(page, selector, filePath);
                if (result.ok) {
                    context.logger?.info("Uploaded Workday cover letter.", { dataId: rawDataId, ariaLabel: rawAriaLabel });
                    return true;
                }
                context.logger?.warn("Workday cover letter upload failed.", {
                    dataId: rawDataId,
                    ariaLabel: rawAriaLabel,
                    reason: result.reason,
                });
            }
        }
        context.logger?.info("Workday cover letter upload not available on this step.");
        return false;
    }
    async answerScreeningQuestions(page, context) {
        const snapshot = await captureStepSnapshot(page, {
            stepSelectors: WORKDAY_STEP_NAME_SELECTORS,
            nextSelectors: WORKDAY_NEXT_BUTTON_SELECTORS,
            submitSelectors: WORKDAY_SUBMIT_BUTTON_SELECTORS,
        });
        context.logger?.info("Workday screening scan.", snapshot);
    }
    async reviewBeforeSubmit(page, context) {
        const snapshot = await captureStepSnapshot(page, {
            stepSelectors: WORKDAY_STEP_NAME_SELECTORS,
            nextSelectors: WORKDAY_NEXT_BUTTON_SELECTORS,
            submitSelectors: WORKDAY_SUBMIT_BUTTON_SELECTORS,
        });
        context.logger?.info("Workday review checkpoint reached.", snapshot);
        await context.screenshotHook?.("workday-review-before-submit", page);
    }
    async submitApplication(page, context) {
        return super.submitApplication(page, context);
    }
    async getCurrentStep(page, _context) {
        const snapshot = await captureStepSnapshot(page, {
            stepSelectors: WORKDAY_STEP_NAME_SELECTORS,
            nextSelectors: WORKDAY_NEXT_BUTTON_SELECTORS,
            submitSelectors: WORKDAY_SUBMIT_BUTTON_SELECTORS,
        });
        return {
            step: snapshot.hasSubmit ? "review-before-submit" : snapshot.stepName ?? "workday-form",
            detail: JSON.stringify(snapshot),
        };
    }
    async collectErrors(page, context) {
        const messages = await super.collectErrors(page, context);
        const fields = (await this.extractFormFields(page, context)).filter((field) => field.required);
        const missingRequired = [];
        for (const field of fields) {
            const selector = field.domLocator.selector;
            let isEmpty = false;
            if (field.type === "radio" || field.type === "checkbox") {
                const checkedSelector = field.groupName ? `input[name="${field.groupName}"]:checked` : selector;
                const checkedCount = checkedSelector
                    ? await page.locator(checkedSelector).count().catch(() => 0)
                    : 0;
                isEmpty = checkedCount === 0;
            }
            else if (field.type === "file") {
                isEmpty = selector
                    ? await page.locator(selector).evaluate((element) => {
                        const input = element;
                        return !input.files || input.files.length === 0;
                    }).catch(() => true)
                    : true;
            }
            else {
                isEmpty = selector
                    ? await page.locator(selector).evaluate((element) => {
                        const input = element;
                        return !input.value || !input.value.trim();
                    }).catch(() => true)
                    : true;
            }
            if (isEmpty) {
                missingRequired.push({
                    message: "Required field is still empty.",
                    fieldLabel: field.label,
                });
            }
        }
        return [...messages, ...missingRequired];
    }
    async fillApplication(page, context) {
        const statusUpdates = [];
        const pushStatus = async (stage, detail, step) => {
            const pageState = await capturePageState(page);
            statusUpdates.push({
                stage,
                detail,
                step,
                url: page.url(),
                pageState,
            });
        };
        await this.clickApply(page, context);
        await pushStatus("open-application", "Workday apply interaction completed.");
        await context.screenshotHook?.("workday-after-click-apply", page);
        const unresolvedRequired = new Set();
        const allErrors = [];
        const decisionScores = [];
        let currentStepName = "workday-form";
        for (let iteration = 0; iteration < 8; iteration += 1) {
            const snapshotBefore = await captureStepSnapshot(page, {
                stepSelectors: WORKDAY_STEP_NAME_SELECTORS,
                nextSelectors: WORKDAY_NEXT_BUTTON_SELECTORS,
                submitSelectors: WORKDAY_SUBMIT_BUTTON_SELECTORS,
            });
            currentStepName = snapshotBefore.stepName ?? currentStepName;
            context.logger?.info("Workday step snapshot.", {
                iteration,
                ...snapshotBefore,
            });
            await pushStatus("step-snapshot", "Captured Workday step snapshot.", currentStepName);
            await context.screenshotHook?.(`workday-step-${iteration + 1}-${sanitizeStepName(currentStepName)}`, page);
            const fields = await this.extractFormFields(page, context);
            const decisions = fields.map((field) => mapFieldToProfile(context.profile, field));
            for (const decision of decisions) {
                decisionScores.push(decision.confidence);
                context.logger?.info("Workday field mapping decision.", {
                    step: currentStepName,
                    label: decision.field.label,
                    type: decision.field.type,
                    status: decision.status,
                    confidence: decision.confidence,
                    reason: decision.reason,
                });
                if (decision.status === "unresolved" || !decision.answer) {
                    if (decision.field.required && decision.field.type !== "file") {
                        unresolvedRequired.add(`${currentStepName}: ${decision.field.label}`);
                    }
                    continue;
                }
                const filled = await this.fillField(page, decision.field, decision.answer, context);
                if (filled) {
                    context.logger?.info("Workday field filled.", {
                        step: currentStepName,
                        label: decision.field.label,
                    });
                }
            }
            if (context.resume) {
                await this.uploadResume(page, context.resume.storagePath, context);
            }
            if (context.coverLetter) {
                await this.uploadCoverLetter(page, context.coverLetter.storagePath, context);
            }
            await this.answerScreeningQuestions(page, context);
            await pushStatus("answer-screening", "Completed Workday screening pass.", currentStepName);
            const stepErrors = await this.collectErrors(page, context);
            allErrors.push(...stepErrors);
            if (stepErrors.length > 0) {
                context.logger?.warn("Workday validation messages detected.", {
                    step: currentStepName,
                    errors: stepErrors.map((error) => error.fieldLabel ? `${error.fieldLabel}: ${error.message}` : error.message),
                });
            }
            const snapshotAfter = await captureStepSnapshot(page, {
                stepSelectors: WORKDAY_STEP_NAME_SELECTORS,
                nextSelectors: WORKDAY_NEXT_BUTTON_SELECTORS,
                submitSelectors: WORKDAY_SUBMIT_BUTTON_SELECTORS,
            });
            if (snapshotAfter.hasSubmit || currentStepName.toLowerCase().includes("review")) {
                await this.reviewBeforeSubmit(page, context);
                break;
            }
            if (stepErrors.length > 0 && unresolvedRequired.size > 0) {
                context.logger?.warn("Stopping Workday flow due to unresolved required fields.", {
                    step: currentStepName,
                    unresolvedRequired: Array.from(unresolvedRequired),
                });
                break;
            }
            const moved = await clickFirstVisible(page, WORKDAY_NEXT_BUTTON_SELECTORS);
            if (!moved) {
                context.logger?.warn("No Workday next-step control found; stopping safely.", {
                    step: currentStepName,
                    snapshot: snapshotAfter,
                });
                break;
            }
            await waitForPageReady(page);
            await waitForAsyncValidation(page);
            await waitForPageStateChange(page, {
                url: snapshotBefore.url,
                title: snapshotBefore.title,
            }, 2500);
            const snapshotNext = await captureStepSnapshot(page, {
                stepSelectors: WORKDAY_STEP_NAME_SELECTORS,
                nextSelectors: WORKDAY_NEXT_BUTTON_SELECTORS,
                submitSelectors: WORKDAY_SUBMIT_BUTTON_SELECTORS,
            });
            context.logger?.info("Workday step transition.", {
                from: snapshotBefore.stepName,
                to: snapshotNext.stepName,
                url: snapshotNext.url,
                hasSubmit: snapshotNext.hasSubmit,
            });
            await pushStatus("step-transition", "Moved to next Workday step.", snapshotNext.stepName);
            if (snapshotBefore.stepName === snapshotNext.stepName &&
                snapshotBefore.url === snapshotNext.url &&
                snapshotBefore.hasNext === snapshotNext.hasNext &&
                !snapshotNext.hasSubmit) {
                context.logger?.warn("Workday step transition did not change page state; stopping safely.", {
                    step: snapshotNext.stepName,
                });
                break;
            }
        }
        const uniqueErrors = dedupeErrors(allErrors);
        const averageConfidence = decisionScores.length > 0
            ? decisionScores.reduce((sum, value) => sum + value, 0) / decisionScores.length
            : 0.55;
        const confidencePenalty = Math.min(uniqueErrors.length * 0.08, 0.24) + Math.min(unresolvedRequired.size * 0.07, 0.28);
        const confidenceScore = Math.max(0.35, Math.min(0.9, averageConfidence) - confidencePenalty);
        const reviewSummary = buildReviewSummary({
            submitMode: context.submitMode,
            confidenceScore,
            confidenceThreshold: context.profile.autoSubmitConfidenceThreshold,
            unresolvedFields: Array.from(unresolvedRequired),
            validationErrors: uniqueErrors.map((error) => error.fieldLabel ? `${error.fieldLabel}: ${error.message}` : error.message),
            lastCompletedStep: currentStepName,
        });
        const submitted = reviewSummary.shouldAttemptSubmit
            ? await this.submitApplication(page, context)
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
            step: currentStepName,
            errors: uniqueErrors,
            unresolvedFields: Array.from(unresolvedRequired),
            statusUpdates,
            reviewSummary: {
                ...reviewSummary,
                submitAttempted: reviewSummary.shouldAttemptSubmit,
                submitCompleted: submitted,
                recommendedStatus: finalStatus,
            },
        };
    }
}
function sanitizeStepName(step) {
    return step.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
}
function dedupeErrors(errors) {
    const seen = new Set();
    return errors.filter((error) => {
        const key = `${error.fieldLabel ?? ""}:${error.message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
