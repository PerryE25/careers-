import { clickFirst, collectTextErrors, extractBasicFormFields, fillSelectLikeField, fillTextLikeField, } from "./form-utils.js";
import { uploadAndVerifyFile } from "./document-upload-utils.js";
import { capturePageState, waitForAnyVisible, waitForAsyncValidation, waitForPageReady } from "./playwright-utils.js";
export class BaseAtsAdapter {
    async openJobPage(page, url, context) {
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await page.goto(url, { waitUntil: "commit", timeout: 45000 });
                lastError = undefined;
                break;
            }
            catch (error) {
                lastError = error;
                context.logger?.warn("Job page navigation attempt failed.", {
                    provider: this.provider,
                    url,
                    attempt,
                    message: error instanceof Error ? error.message : String(error),
                });
                if (attempt < 3) {
                    await page.waitForTimeout(1000).catch(() => undefined);
                }
            }
        }
        if (lastError) {
            throw lastError;
        }
        await waitForPageReady(page);
        context.logger?.info("Navigated to job page.", { provider: this.provider, url });
    }
    async extractJobMetadata(page, _url, _context) {
        const title = await this.firstText(page, this.selectors.jobPage.metadataTitle);
        const company = await this.firstText(page, this.selectors.jobPage.metadataCompany);
        const location = await this.firstText(page, this.selectors.jobPage.metadataLocation);
        const salary = await this.extractSalary(page);
        return { title, company, location, salary };
    }
    async clickApply(page, context) {
        const clicked = await clickFirst(page, this.selectors.applyButtons.primary);
        context.logger?.info("Attempted apply click.", { provider: this.provider, clicked });
        if (clicked) {
            await waitForAnyVisible(page, ["form", ...this.selectors.uploads.resumeInputs, ...this.selectors.jobPage.stepIndicators], 4000);
            await waitForAsyncValidation(page);
            return;
        }
        context.logger?.warn("Apply control was not found or was not clickable.", {
            category: "selector-not-found",
            code: "apply_selector_not_found",
            provider: this.provider,
            selector: this.selectors.applyButtons.primary.join(" | "),
            currentStep: "job-details",
            resumeFromStep: "job-details",
            url: page.url(),
        });
    }
    async extractFormFields(page, _context) {
        return extractBasicFormFields(page);
    }
    async fillField(page, field, value, _context) {
        if (field.type === "text" ||
            field.type === "email" ||
            field.type === "phone" ||
            field.type === "textarea" ||
            field.type === "unknown") {
            return fillTextLikeField(page, field, value);
        }
        if (field.type === "select" || field.type === "radio" || field.type === "checkbox") {
            return fillSelectLikeField(page, field, value);
        }
        return false;
    }
    async uploadResume(page, filePath, context) {
        return this.uploadFile(page, this.selectors.uploads.resumeInputs, filePath, "resume", context);
    }
    async uploadCoverLetter(page, filePath, context) {
        return this.uploadFile(page, this.selectors.uploads.coverLetterInputs, filePath, "cover-letter", context);
    }
    async answerScreeningQuestions(_page, _context) { }
    async reviewBeforeSubmit(page, context) {
        const step = await this.getCurrentStep(page, context);
        const pageState = await capturePageState(page);
        context.logger?.info("Review checkpoint reached.", {
            provider: this.provider,
            step: step.step,
            detail: step.detail,
            pageState,
        });
    }
    async submitApplication(page, context) {
        const clicked = await clickFirst(page, this.selectors.submit.buttons);
        context.logger?.info("Attempted final submit click.", {
            provider: this.provider,
            clicked,
            selectors: this.selectors.submit.buttons,
            url: page.url(),
        });
        if (!clicked) {
            context.logger?.warn("Final submit control was not found or was not clickable.", {
                category: "selector-not-found",
                code: "submit_selector_not_found",
                provider: this.provider,
                selector: this.selectors.submit.buttons.join(" | "),
                currentStep: "review-before-submit",
                resumeFromStep: "review-before-submit",
                url: page.url(),
            });
            return false;
        }
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await waitForAsyncValidation(page);
        return true;
    }
    async getCurrentStep(page, _context) {
        const detail = await this.firstText(page, this.selectors.jobPage.stepIndicators);
        return {
            step: detail ?? "application-form",
            detail,
        };
    }
    async collectErrors(page, _context) {
        return collectTextErrors(page, this.selectors.formFields.errorTexts);
    }
    async extractMetadata(page, _url) {
        return this.extractJobMetadata(page, page.url(), {});
    }
    async uploadFile(page, selectors, filePath, kind, context) {
        for (const selector of selectors) {
            const locator = page.locator(selector).first();
            if ((await locator.count().catch(() => 0)) === 0) {
                continue;
            }
            const result = await uploadAndVerifyFile(page, selector, filePath);
            if (result.ok) {
                context.logger?.info("Uploaded file.", {
                    provider: this.provider,
                    kind,
                    selector,
                    inputName: result.inputName,
                    inputId: result.inputId,
                });
                return true;
            }
            context.logger?.warn("File upload attempt failed.", {
                category: "upload-failed",
                code: "file_upload_failed",
                provider: this.provider,
                kind,
                selector,
                reason: result.reason,
                currentStep: "upload-documents",
                resumeFromStep: "upload-documents",
                url: page.url(),
            });
        }
        context.logger?.warn("No file input found.", {
            category: "selector-not-found",
            code: "file_input_not_found",
            provider: this.provider,
            kind,
            selector: selectors.join(" | "),
            currentStep: "upload-documents",
            resumeFromStep: "upload-documents",
            url: page.url(),
        });
        return false;
    }
    async firstText(page, selectors) {
        for (const selector of selectors) {
            const locator = page.locator(selector).first();
            if ((await locator.count().catch(() => 0)) === 0) {
                continue;
            }
            const text = (await locator.textContent().catch(() => null))?.trim();
            if (text) {
                return text;
            }
        }
        return undefined;
    }
    async extractSalary(page) {
        const bodyText = (await page.locator("body").textContent().catch(() => "")) ?? "";
        const normalized = bodyText.replace(/\s+/g, " ").trim();
        const rangeMatch = normalized.match(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:-|to)\s*\$\s?\d[\d,]*(?:\.\d+)?(?:\s*\/\s*(?:year|yr|hour|hr))?/i);
        if (rangeMatch) {
            return rangeMatch[0].replace(/\s+/g, " ").trim();
        }
        const singleMatch = normalized.match(/\$\s?\d[\d,]*(?:\.\d+)?(?:\s*\/\s*(?:year|yr|hour|hr))?/i);
        return singleMatch?.[0].replace(/\s+/g, " ").trim();
    }
}
