import type { Page } from "playwright";
import type { AutomationContext } from "../adapter.js";
import { GREENHOUSE_SELECTORS } from "../adapters/configs/greenhouse-selectors.js";
import { LEVER_SELECTORS } from "../adapters/configs/lever-selectors.js";
import {
  ScreeningAnswerService,
  type ScreeningAnswerContext,
} from "../../services/screening-answer-service.js";
import { extractBasicFormFields } from "./form-utils.js";
import { fillWhenReady, waitForAsyncValidation } from "./playwright-utils.js";

/** Matches field-mapping-engine gating for long-form answers. */
const SCREENING_TEXTAREA_AUTOFILL_MIN_CONFIDENCE = 0.74;

const DEMOGRAPHIC_LABEL_SKIP =
  /\b(demographic|eeo|gender|sex|race|ethnicity|hispanic|latino|veteran|disability|self identify|self-identify|sexual orientation|lgbtq|pronoun)\b/i;

export interface ScreeningTextareaAutofillResult {
  filled: number;
  unresolvedPrompts: string[];
  skippedDemographic: number;
}

function pickAnswerLength(label: string): "short" | "long" {
  if (/\b\d{1,3}\s*(word|character)/i.test(label)) {
    return "short";
  }
  return "long";
}

async function readFirstMetadataLine(page: Page, selectors: string[]): Promise<string | undefined> {
  for (const selector of selectors) {
    if (selector.startsWith("meta[")) {
      const content = await page.locator(selector).first().getAttribute("content").catch(() => null);
      const trimmed = content?.replace(/\s+/g, " ").trim();
      if (trimmed) {
        return trimmed;
      }
      continue;
    }
    const text = await page.locator(selector).first().textContent().catch(() => null);
    const trimmed = text?.replace(/\s+/g, " ").trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export async function resolveScreeningAnswerContextFromPage(
  page: Page,
  provider: "lever" | "greenhouse",
): Promise<ScreeningAnswerContext> {
  const selectors = provider === "lever" ? LEVER_SELECTORS.jobPage : GREENHOUSE_SELECTORS.jobPage;
  const [roleTitle, companyName] = await Promise.all([
    readFirstMetadataLine(page, selectors.metadataTitle),
    readFirstMetadataLine(page, selectors.metadataCompany),
  ]);
  return { roleTitle, companyName };
}

export async function autofillScreeningTextareas(
  page: Page,
  context: AutomationContext,
  answerContext: ScreeningAnswerContext,
): Promise<ScreeningTextareaAutofillResult> {
  const service = new ScreeningAnswerService(context.profile);
  const fields = await extractBasicFormFields(page);
  const textareas = fields.filter(
    (field) => field.type === "textarea" && field.required && field.domLocator.selector,
  );

  const unresolvedPrompts: string[] = [];
  const unresolvedSet = new Set<string>();
  let filled = 0;
  let skippedDemographic = 0;

  for (const field of textareas) {
    const selector = field.domLocator.selector!;
    const locator = page.locator(selector).first();
    const empty = await locator.evaluate((el: HTMLTextAreaElement) => !el.value?.trim()).catch(() => true);
    if (!empty) {
      continue;
    }

    const prompt = (field.label || field.locatorHint || "").trim();
    if (DEMOGRAPHIC_LABEL_SKIP.test(prompt)) {
      skippedDemographic += 1;
      context.logger?.info("Skipped demographic or EEO textarea for screening autofill.", {
        label: prompt.slice(0, 240),
      });
      continue;
    }

    const length = pickAnswerLength(prompt);
    const result = service.answerQuestion(prompt, length, answerContext);

    if (result.answer && result.confidence >= SCREENING_TEXTAREA_AUTOFILL_MIN_CONFIDENCE) {
      const ok = await fillWhenReady(locator, result.answer);
      if (ok) {
        filled += 1;
        context.logger?.info("Filled required screening textarea via ScreeningAnswerService.", {
          label: prompt.slice(0, 240),
          category: result.category,
          confidence: result.confidence,
          source: result.source,
        });
      } else {
        context.logger?.warn("Required screening textarea could not be filled (control not ready).", {
          label: prompt.slice(0, 240),
          selector,
        });
        if (!unresolvedSet.has(prompt)) {
          unresolvedSet.add(prompt);
          unresolvedPrompts.push(prompt || "(required textarea)");
        }
      }
    } else {
      context.logger?.warn("Required screening textarea left blank — unsupported category or low confidence.", {
        label: prompt.slice(0, 240),
        category: result.category,
        confidence: result.confidence,
        serviceReason: result.reason,
      });
      const key = prompt || "(required textarea)";
      if (!unresolvedSet.has(key)) {
        unresolvedSet.add(key);
        unresolvedPrompts.push(key);
      }
    }
  }

  if (unresolvedPrompts.length > 0) {
    context.logger?.warn("Unresolved required screening textareas (prompts).", {
      count: unresolvedPrompts.length,
      prompts: unresolvedPrompts,
    });
  } else {
    context.logger?.info("Screening textarea pass complete.", {
      textareaCandidates: textareas.length,
      filled,
      skippedDemographic,
    });
  }

  await waitForAsyncValidation(page);
  return { filled, unresolvedPrompts, skippedDemographic };
}
