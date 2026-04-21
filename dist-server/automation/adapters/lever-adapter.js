import { LEVER_SELECTORS } from "./configs/lever-selectors.js";
import { BaseAtsAdapter } from "../shared/base-adapter.js";
import { uploadAndVerifyFile } from "../shared/document-upload-utils.js";
import { clickFirst, extractBasicFormFields } from "../shared/form-utils.js";
import { waitForAnyVisible, waitForAsyncValidation, waitForPageReady } from "../shared/playwright-utils.js";
export class LeverAdapter extends BaseAtsAdapter {
    provider = "lever";
    selectors = LEVER_SELECTORS;
    canHandle(url, html) {
        const lowerHtml = html?.toLowerCase() ?? "";
        return (url.includes("lever.co") ||
            lowerHtml.includes("jobs.lever.co") ||
            lowerHtml.includes("lever-analytics") ||
            lowerHtml.includes("application-page"));
    }
    async openJobPage(page, url, context) {
        await super.openJobPage(page, url, context);
        await waitForPageReady(page);
    }
    async extractJobMetadata(page, url, context) {
        const metadata = await super.extractJobMetadata(page, url, context);
        const externalJobId = this.extractLeverJobId(page.url());
        return {
            ...metadata,
            externalJobId,
        };
    }
    async clickApply(page, context) {
        const alreadyOpen = await page
            .locator(".application-page:visible, form.application-form:visible")
            .count()
            .catch(() => 0);
        if (alreadyOpen > 0) {
            context.logger?.info("Lever application form already open.");
            return;
        }
        const clicked = await clickFirst(page, this.selectors.applyButtons.primary);
        context.logger?.info("Attempted Lever apply click.", { clicked });
        if (clicked) {
            await waitForAnyVisible(page, this.selectors.jobPage.formRoots ?? ["form"], 4000);
            await waitForAsyncValidation(page);
            return;
        }
        context.logger?.warn("Lever apply control was not found or was not clickable.", {
            category: "selector-not-found",
            code: "lever_apply_selector_not_found",
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
            const selector = field.domLocator.selector ?? "";
            const hint = field.locatorHint ?? "";
            const label = field.label.toLowerCase();
            const section = field.section?.toLowerCase() ?? "";
            return (label !== "unknown" ||
                selector.includes("resume") ||
                hint.includes("resume") ||
                section.includes("application") ||
                field.type === "file");
        });
        context.logger?.info("Lever form fields extracted.", {
            totalFields: relevant.length,
            requiredFields: relevant.filter((field) => field.required).length,
        });
        return relevant;
    }
    async uploadResume(page, filePath, context) {
        const selector = this.selectors.uploads.resumeInputs[0];
        const specific = page.locator(selector).first();
        if ((await specific.count().catch(() => 0)) > 0) {
            const result = await uploadAndVerifyFile(page, selector, filePath);
            if (result.ok) {
                context.logger?.info("Uploaded Lever resume.", { selector });
                return true;
            }
            context.logger?.warn("Lever resume upload failed.", { selector, reason: result.reason });
        }
        return super.uploadResume(page, filePath, context);
    }
    async uploadCoverLetter(page, filePath, context) {
        const fileInputs = await page.locator(this.selectors.uploads.coverLetterInputs.at(-1) ?? "input[type='file']").all().catch(() => []);
        for (const locator of fileInputs) {
            const rawNameAttr = (await locator.getAttribute("name").catch(() => null)) ?? "";
            const rawIdAttr = (await locator.getAttribute("id").catch(() => null)) ?? "";
            const rawAriaLabel = (await locator.getAttribute("aria-label").catch(() => null)) ?? "";
            const nameAttr = rawNameAttr.toLowerCase();
            const idAttr = rawIdAttr.toLowerCase();
            const ariaLabel = rawAriaLabel.toLowerCase();
            if (nameAttr.includes("cover") || idAttr.includes("cover") || ariaLabel.includes("cover")) {
                const selector = rawIdAttr ? `#${rawIdAttr}` : rawNameAttr ? `input[name='${rawNameAttr}']` : "input[type='file']";
                const result = await uploadAndVerifyFile(page, selector, filePath);
                if (result.ok) {
                    context.logger?.info("Uploaded Lever cover letter.", { nameAttr: rawNameAttr, idAttr: rawIdAttr });
                    return true;
                }
                context.logger?.warn("Lever cover letter upload failed.", { nameAttr: rawNameAttr, idAttr: rawIdAttr, reason: result.reason });
            }
        }
        context.logger?.info("Lever cover letter upload not available on this posting.");
        return false;
    }
    async answerScreeningQuestions(page, context) {
        const sections = await page
            .locator(".application-question, .application-page fieldset, .application-page .application-field")
            .count()
            .catch(() => 0);
        context.logger?.info("Lever screening question scan complete.", { sections });
    }
    async reviewBeforeSubmit(page, context) {
        const submitButton = page
            .locator("button[type='submit'], input[type='submit'], .application-page button")
            .filter({ hasText: /submit|application|apply/i })
            .first();
        if ((await submitButton.count().catch(() => 0)) > 0) {
            await submitButton.scrollIntoViewIfNeeded().catch(() => undefined);
            context.logger?.info("Lever review-before-submit checkpoint reached.");
        }
        else {
            context.logger?.warn("Lever submit button was not found during review checkpoint.");
        }
        await context.screenshotHook?.("lever-review-before-submit", page);
    }
    async submitApplication(page, context) {
        return super.submitApplication(page, context);
    }
    async getCurrentStep(page, _context) {
        const hasForm = await page.locator(".application-page, form.application-form").count().catch(() => 0);
        const submitVisible = await page
            .locator("button[type='submit'], input[type='submit']")
            .count()
            .catch(() => 0);
        if (hasForm > 0 && submitVisible > 0) {
            return { step: "review-before-submit", detail: "Application form loaded and submit control is present." };
        }
        if (hasForm > 0) {
            return { step: "application-form", detail: "Application form is open." };
        }
        return { step: "job-details", detail: "Still on posting page." };
    }
    async collectErrors(page, _context) {
        const messages = await super.collectErrors(page, _context);
        const fields = (await this.extractFormFields(page, _context)).filter((field) => field.required);
        const missingRequired = [];
        for (const field of fields) {
            const selector = field.domLocator.selector;
            let isEmpty = false;
            if (field.type === "radio" || field.type === "checkbox") {
                const radioSelector = field.groupName ? `input[name="${field.groupName}"]:checked` : selector;
                const checkedCount = radioSelector
                    ? await page.locator(radioSelector).count().catch(() => 0)
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
    extractLeverJobId(url) {
        const parts = new URL(url).pathname.split("/").filter(Boolean);
        return parts.length >= 2 ? parts[1] : undefined;
    }
}
export const leverUnsupportedNotes = [
    "Lever postings that require SSO/login or anti-bot verification are not supported.",
    "Highly customized embedded Lever forms with non-standard controls may require manual review.",
    "Multi-file upload flows beyond resume and cover letter are not automatically mapped yet.",
];
