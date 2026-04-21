import type {
  AdapterCollectedError,
  AdapterMetadata,
  AdapterStepState,
  AutomationContext,
  DetectedFormField,
} from "../adapter.js";
import { GREENHOUSE_SELECTORS } from "./configs/greenhouse-selectors.js";
import { BaseAtsAdapter } from "../shared/base-adapter.js";
import { uploadAndVerifyFile } from "../shared/document-upload-utils.js";
import { clickFirst, extractBasicFormFields } from "../shared/form-utils.js";
import { handleLoginFirstApplyLayout } from "../shared/login-first-apply.js";
import {
  autofillScreeningTextareas,
  resolveScreeningAnswerContextFromPage,
} from "../shared/screening-textarea-filler.js";
import { waitForAnyVisible, waitForAsyncValidation, waitForPageReady } from "../shared/playwright-utils.js";

const GREENHOUSE_LOGIN_FIRST_CONFIG = {
  provider: "greenhouse" as const,
  supportedUrlShape:
    "https://boards.greenhouse.io/<company>/jobs/<job-id> or a custom job URL containing ?gh_jid=<job-id>",
  formRootSelectors: GREENHOUSE_SELECTORS.jobPage.formRoots ?? ["form"],
  postingSurfaceSelectors: ["#app_body .opening", ".opening", "#app_body h1.app-title"],
};

export class GreenhouseAdapter extends BaseAtsAdapter {
  provider = "greenhouse" as const;

  protected selectors = GREENHOUSE_SELECTORS;

  canHandle(url: string, html?: string) {
    const lowerHtml = html?.toLowerCase() ?? "";
    return (
      url.includes("greenhouse.io") ||
      url.includes("gh_jid=") ||
      lowerHtml.includes('id="app_body"') ||
      lowerHtml.includes("greenhouse.io/embed/job_board") ||
      lowerHtml.includes("application[resume]")
    );
  }

  async openJobPage(page: import("playwright").Page, url: string, context: AutomationContext) {
    await super.openJobPage(page, url, context);
    await waitForPageReady(page);
    await handleLoginFirstApplyLayout(page, context, GREENHOUSE_LOGIN_FIRST_CONFIG);
  }

  async extractJobMetadata(page: import("playwright").Page, url: string, context: AutomationContext): Promise<AdapterMetadata> {
    const metadata = await super.extractJobMetadata(page, url, context);
    const externalJobId = this.extractGreenhouseJobId(page.url()) ?? this.extractGreenhouseJobId(url);
    return {
      ...metadata,
      company: metadata.company ?? this.deriveCompanyFromHost(url),
      externalJobId,
    };
  }

  async clickApply(page: import("playwright").Page, context: AutomationContext) {
    const formVisible = await page
      .locator(
        [
          "#application:visible",
          ".application_container:visible",
          "form#application_form:visible",
          "form:has(input[type='file']):visible",
          "form:has(button:has-text('Submit application')):visible",
        ].join(", "),
      )
      .count()
      .catch(() => 0);
    if (formVisible > 0) {
      context.logger?.info("Greenhouse application form already visible.");
      return;
    }

    const clicked = await clickFirst(page, this.selectors.applyButtons.primary);
    context.logger?.info("Attempted Greenhouse apply click.", { clicked });
    if (clicked) {
      await waitForPageReady(page);
      const handledLoginFirst = await handleLoginFirstApplyLayout(page, context, GREENHOUSE_LOGIN_FIRST_CONFIG);
      if (!handledLoginFirst) {
        await waitForAnyVisible(page, this.selectors.jobPage.formRoots ?? ["form"], 4000);
      }
      await waitForAsyncValidation(page);
      return;
    }
    context.logger?.warn("Greenhouse apply control was not found or was not clickable.", {
      category: "selector-not-found",
      code: "greenhouse_apply_selector_not_found",
      provider: this.provider,
      selector: this.selectors.applyButtons.primary.join(" | "),
      currentStep: "job-details",
      resumeFromStep: "job-details",
      url: page.url(),
    });
  }

  async extractFormFields(page: import("playwright").Page, context: AutomationContext): Promise<DetectedFormField[]> {
    const fields = await extractBasicFormFields(page);
    const relevant = fields.filter((field) => {
      const section = field.section?.toLowerCase() ?? "";
      const label = field.label.toLowerCase();
      const selector = field.domLocator.selector ?? "";
      return (
        section.includes("application") ||
        section.includes("candidate") ||
        section.includes("questions") ||
        label !== "unknown" ||
        selector.includes("application[")
      );
    });

    context.logger?.info("Greenhouse form fields extracted.", {
      totalFields: relevant.length,
      requiredFields: relevant.filter((field) => field.required).length,
      groupedSections: Array.from(new Set(relevant.map((field) => field.section).filter(Boolean))),
    });

    return relevant;
  }

  async fillField(
    page: import("playwright").Page,
    field: DetectedFormField,
    value: string,
    context: AutomationContext,
  ) {
    if (field.type === "checkbox") {
      const selector = field.domLocator.selector;
      const lower = `${field.label} ${field.section ?? ""}`.toLowerCase();
      if (
        selector &&
        /(consent|privacy|terms|data processing|acknowledg)/i.test(lower) &&
        !/(marketing|newsletter|sms)/i.test(lower)
      ) {
        const locator = page.locator(selector).first();
        await locator.check().catch(() => undefined);
        context.logger?.info("Checked Greenhouse consent checkbox.", { label: field.label });
        return true;
      }
    }

    return super.fillField(page, field, value, context);
  }

  async uploadResume(page: import("playwright").Page, filePath: string, context: AutomationContext) {
    for (const selector of this.selectors.uploads.resumeInputs) {
      const locator = page.locator(selector).first();
      if ((await locator.count().catch(() => 0)) === 0) {
        continue;
      }
      const nameAttr = (await locator.getAttribute("name").catch(() => null))?.toLowerCase() ?? "";
      if (nameAttr.includes("resume") || selector.includes("resume")) {
        const result = await uploadAndVerifyFile(page, selector, filePath);
        if (result.ok) {
          context.logger?.info("Uploaded Greenhouse resume.", { selector });
          return true;
        }
        context.logger?.warn("Greenhouse resume upload failed.", { selector, reason: result.reason });
      }
    }
    return super.uploadResume(page, filePath, context);
  }

  async uploadCoverLetter(page: import("playwright").Page, filePath: string, context: AutomationContext) {
    for (const selector of this.selectors.uploads.coverLetterInputs) {
      const locator = page.locator(selector).first();
      if ((await locator.count().catch(() => 0)) === 0) {
        continue;
      }
      const nameAttr = (await locator.getAttribute("name").catch(() => null))?.toLowerCase() ?? "";
      const idAttr = (await locator.getAttribute("id").catch(() => null))?.toLowerCase() ?? "";
      if (nameAttr.includes("cover") || idAttr.includes("cover") || selector.includes("cover")) {
        const result = await uploadAndVerifyFile(page, selector, filePath);
        if (result.ok) {
          context.logger?.info("Uploaded Greenhouse cover letter.", { selector });
          return true;
        }
        context.logger?.warn("Greenhouse cover letter upload failed.", { selector, reason: result.reason });
      }
    }
    context.logger?.info("Greenhouse cover letter upload not available on this posting.");
    return false;
  }

  async answerScreeningQuestions(page: import("playwright").Page, context: AutomationContext) {
    const questionGroups = await page
      .locator(".question, .application_question, .eeoc-question, #main_fields .field")
      .count()
      .catch(() => 0);
    const answerContext = await resolveScreeningAnswerContextFromPage(page, "greenhouse");
    const screening = await autofillScreeningTextareas(page, context, answerContext);
    context.logger?.info("Greenhouse screening question scan complete.", { questionGroups, ...screening });
  }

  async reviewBeforeSubmit(page: import("playwright").Page, context: AutomationContext) {
    const submitButton = page
      .locator("button[type='submit'], input[type='submit']")
      .filter({ hasText: /submit|application|apply/i })
      .first();
    if ((await submitButton.count().catch(() => 0)) > 0) {
      await submitButton.scrollIntoViewIfNeeded().catch(() => undefined);
      context.logger?.info("Greenhouse review-before-submit checkpoint reached.");
    } else {
      context.logger?.warn("Greenhouse submit button was not found during review checkpoint.");
    }
    await context.screenshotHook?.("greenhouse-review-before-submit", page);
  }

  async submitApplication(page: import("playwright").Page, context: AutomationContext) {
    return super.submitApplication(page, context);
  }

  async getCurrentStep(page: import("playwright").Page, _context: AutomationContext): Promise<AdapterStepState> {
    const formVisible = await page
      .locator(
        [
          "#application:visible",
          ".application_container:visible",
          "form#application_form:visible",
          "form:has(input[type='file']):visible",
          "form:has(button:has-text('Submit application')):visible",
        ].join(", "),
      )
      .count()
      .catch(() => 0);
    const submitVisible = await page
      .locator("button:has-text('Submit application'), button[type='submit'], input[type='submit']")
      .count()
      .catch(() => 0);

    if (formVisible > 0 && submitVisible > 0) {
      return { step: "review-before-submit", detail: "Application form loaded and submit control is present." };
    }
    if (formVisible > 0) {
      return { step: "application-form", detail: "Greenhouse application form is open." };
    }
    return { step: "job-details", detail: "Still on Greenhouse job details page." };
  }

  async collectErrors(page: import("playwright").Page, context: AutomationContext): Promise<AdapterCollectedError[]> {
    const messages = await super.collectErrors(page, context);
    const fields = (await this.extractFormFields(page, context)).filter((field) => field.required);
    const missingRequired: AdapterCollectedError[] = [];

    for (const field of fields) {
      const selector = field.domLocator.selector;
      let isEmpty = false;

      if (field.type === "radio" || field.type === "checkbox") {
        const checkedSelector = field.groupName ? `input[name="${field.groupName}"]:checked` : selector;
        const checkedCount = checkedSelector
          ? await page.locator(checkedSelector).count().catch(() => 0)
          : 0;
        isEmpty = checkedCount === 0;
      } else if (field.type === "file") {
        isEmpty = selector
          ? await page.locator(selector).evaluate((element) => {
              const input = element as HTMLInputElement;
              return !input.files || input.files.length === 0;
            }).catch(() => true)
          : true;
      } else {
        isEmpty = selector
          ? await page.locator(selector).evaluate((element) => {
              const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
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

  private deriveCompanyFromHost(url: string) {
    const host = new URL(url).hostname;
    return host.split(".")[0];
  }

  private extractGreenhouseJobId(url: string) {
    const parsedUrl = new URL(url);
    const queryJobId = parsedUrl.searchParams.get("gh_jid");
    if (queryJobId) {
      return queryJobId;
    }
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const jobIndex = segments.findIndex((segment) => segment === "jobs" || segment === "job");
    return jobIndex >= 0 ? segments[jobIndex + 1] : undefined;
  }
}
