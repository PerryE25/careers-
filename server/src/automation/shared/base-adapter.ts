import type { Page } from "playwright";
import { agentDebugLog } from "../../debug-agent-session.js";
import type {
  AdapterCollectedError,
  AdapterMetadata,
  AdapterStepState,
  AtsAdapter,
  AutomationContext,
  DetectedFormField,
} from "../adapter.js";
import type { ProviderSelectorConfig } from "../adapters/configs/provider-selector-config.js";
import {
  clickFirst,
  collectTextErrors,
  extractBasicFormFields,
  fillSelectLikeField,
  fillTextLikeField,
} from "./form-utils.js";
import { uploadAndVerifyFile } from "./document-upload-utils.js";
import { capturePageState, waitForAnyVisible, waitForAsyncValidation, waitForPageReady } from "./playwright-utils.js";

export abstract class BaseAtsAdapter implements AtsAdapter {
  abstract provider: AtsAdapter["provider"];

  protected abstract selectors: ProviderSelectorConfig;

  abstract canHandle(url: string, html?: string): boolean;

  async openJobPage(page: Page, url: string, context: AutomationContext) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: "commit", timeout: 45000 });
        lastError = undefined;
        break;
      } catch (error) {
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

  async extractJobMetadata(page: Page, _url: string, _context: AutomationContext): Promise<AdapterMetadata> {
    const title = await this.firstText(page, this.selectors.jobPage.metadataTitle);
    const company = await this.firstText(page, this.selectors.jobPage.metadataCompany);
    const location = await this.firstText(page, this.selectors.jobPage.metadataLocation);
    const salary = await this.extractSalary(page);
    return { title, company, location, salary };
  }

  async clickApply(page: Page, context: AutomationContext) {
    const clicked = await clickFirst(page, this.selectors.applyButtons.primary);
    context.logger?.info("Attempted apply click.", { provider: this.provider, clicked });
    if (clicked) {
      await waitForAnyVisible(
        page,
        ["form", ...this.selectors.uploads.resumeInputs, ...this.selectors.jobPage.stepIndicators],
        4000,
      );
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

  async extractFormFields(page: Page, _context: AutomationContext): Promise<DetectedFormField[]> {
    return extractBasicFormFields(page);
  }

  async fillField(page: Page, field: DetectedFormField, value: string, _context: AutomationContext) {
    if (
      field.type === "text" ||
      field.type === "email" ||
      field.type === "phone" ||
      field.type === "textarea" ||
      field.type === "unknown"
    ) {
      return fillTextLikeField(page, field, value);
    }
    if (field.type === "select" || field.type === "radio" || field.type === "checkbox") {
      return fillSelectLikeField(page, field, value);
    }
    return false;
  }

  async uploadResume(page: Page, filePath: string, context: AutomationContext) {
    return this.uploadFile(page, this.selectors.uploads.resumeInputs, filePath, "resume", context);
  }

  async uploadCoverLetter(page: Page, filePath: string, context: AutomationContext) {
    return this.uploadFile(page, this.selectors.uploads.coverLetterInputs, filePath, "cover-letter", context);
  }

  async answerScreeningQuestions(_page: Page, _context: AutomationContext) {}

  async reviewBeforeSubmit(page: Page, context: AutomationContext) {
    const step = await this.getCurrentStep(page, context);
    const pageState = await capturePageState(page);
    context.logger?.info("Review checkpoint reached.", {
      provider: this.provider,
      step: step.step,
      detail: step.detail,
      pageState,
    });
  }

  async submitApplication(page: Page, context: AutomationContext) {
    const urlBefore = page.url();
    const clicked = await clickFirst(page, this.selectors.submit.buttons);
    context.logger?.info("Attempted final submit click.", {
      provider: this.provider,
      clicked,
      selectors: this.selectors.submit.buttons,
      url: page.url(),
    });
    // #region agent log
    agentDebugLog({
      location: "base-adapter.ts:submitApplication:click",
      message: "submit click attempt",
      data: {
        hypothesisId: "H4",
        provider: this.provider,
        clicked,
      },
    });
    // #endregion

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
    await page.waitForLoadState("load").catch(() => undefined);
    await waitForAsyncValidation(page);
    await page
      .getByText(
        /thank you for applying|thank you for your interest|we received your application|thanks for applying|your application (?:has been )?submitted|application received|application was submitted|you(?:'ve| have) applied/i,
      )
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => undefined);

    let postSubmitErrors = await this.collectErrors(page, context);
    if (postSubmitErrors.length === 0) {
      postSubmitErrors = await this.collectErrors(page, context);
    }
    if (postSubmitErrors.length > 0) {
      context.logger?.warn("Submit was clicked but the page still reports application errors.", {
        provider: this.provider,
        errorCount: postSubmitErrors.length,
        samples: postSubmitErrors.slice(0, 4).map((entry) => entry.message),
      });
      // #region agent log
      agentDebugLog({
        location: "base-adapter.ts:submitApplication:postSubmitErrors",
        message: "errors persist after submit click",
        data: {
          hypothesisId: "H4",
          provider: this.provider,
          errorCount: postSubmitErrors.length,
        },
      });
      // #endregion
      return false;
    }

    const urlAfter = page.url();
    const bodyText = (await page.locator("body").innerText().catch(() => "")) ?? "";
    const looksSuccessful =
      /\b(thank you for applying|thank you for your application|thanks for applying|application received|we(?:'ve| have) received your application|your application (?:has been )?submitted|successfully submitted|submission complete|applied successfully|application was submitted|you(?:'ve| have) applied)\b/i.test(
        bodyText,
      );
    const submitStillVisible = await page
      .locator(this.selectors.submit.buttons.join(", "))
      .first()
      .isVisible()
      .catch(() => false);
    const urlHints =
      /(?:confirmation|confirmed|thank|success|complete|submitted)(?:[/?#]|$)/i.test(urlAfter) ||
      /(?:gh_|greenhouse).*?(?:success|confirm)/i.test(urlAfter);
    const positiveSignal = looksSuccessful || urlAfter !== urlBefore || urlHints || !submitStillVisible;

    if (!positiveSignal) {
      context.logger?.warn(
        "Submit was clicked and no errors were detected, but there was no confirmation signal (thank-you text, URL change, or disappearing submit control).",
        { provider: this.provider, urlBefore, urlAfter },
      );
      // #region agent log
      agentDebugLog({
        location: "base-adapter.ts:submitApplication:noConfirmationSignal",
        message: "submit click without positive completion signal",
        data: {
          hypothesisId: "H6",
          provider: this.provider,
          looksSuccessful,
          urlChanged: urlAfter !== urlBefore,
          submitStillVisible,
        },
      });
      // #endregion
      return false;
    }

    // #region agent log
    agentDebugLog({
      location: "base-adapter.ts:submitApplication:accepted",
      message: "submit click with confirmation signal and no surfaced errors",
      data: {
        hypothesisId: "H4",
        provider: this.provider,
        looksSuccessful,
        urlChanged: urlAfter !== urlBefore,
        submitStillVisible,
      },
    });
    // #endregion
    return true;
  }

  async getCurrentStep(page: Page, _context: AutomationContext): Promise<AdapterStepState> {
    const detail = await this.firstText(page, this.selectors.jobPage.stepIndicators);
    return {
      step: detail ?? "application-form",
      detail,
    };
  }

  async collectErrors(page: Page, _context: AutomationContext): Promise<AdapterCollectedError[]> {
    return collectTextErrors(page, this.selectors.formFields.errorTexts);
  }

  async extractMetadata(page: Page, _url: string) {
    return this.extractJobMetadata(page, page.url(), {} as AutomationContext);
  }

  private async uploadFile(
    page: Page,
    selectors: string[],
    filePath: string,
    kind: string,
    context: AutomationContext,
  ) {
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

  protected async firstText(page: Page, selectors: string[]) {
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

  protected async extractSalary(page: Page) {
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
