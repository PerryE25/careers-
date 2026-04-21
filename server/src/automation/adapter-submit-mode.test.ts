import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { Page } from "playwright";
import type { AtsAdapter, AutomationContext, DetectedFormField } from "./adapter.js";
import { buildReviewSummary, runAdapterFlow } from "./adapter.js";
import type { Profile } from "../domain/models.js";

function createProfile(
  submitMode: "review" | "auto",
  autoSubmitConfidenceThreshold: number,
): Profile {
  return {
    id: "profile-1",
    resumeText: "",
    autofillText: "",
    autofillFields: {},
    canonicalProfile: {
      personalInfo: { firstName: "Perry", lastName: "Jones", fullName: "Perry Jones" },
      contactInfo: { email: "perry@example.com" },
      locationPreferences: { preferredLocations: [] },
      workAuthorization: { authorizedCountries: ["US"] },
      education: [],
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
      prewrittenAnswers: [],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: ["Engineer"], employmentTypes: [], workplaceTypes: [], industries: [] },
      salaryPreferences: {},
      relocationPreferences: { preferredLocations: [] },
      availability: {},
      technicalBackground: [],
      hasExplicitNoWorkExperience: false,
      sourceNotes: [],
    },
    validation: { isValid: true, issues: [] },
    submitMode,
    autoSubmitConfidenceThreshold,
    createdAt: "",
    updatedAt: "",
  };
}

function createContext(submitMode: "review" | "auto", threshold: number): AutomationContext {
  return {
    profile: createProfile(submitMode, threshold),
    submitMode,
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    screenshotHook: async () => {},
  };
}

class MockAdapter implements AtsAdapter {
  provider = "lever" as const;

  constructor(
    private readonly options: {
      fields: DetectedFormField[];
      errors: { message: string; fieldLabel?: string }[];
      step?: string;
      onSubmit?: () => void;
    },
  ) {}

  canHandle() {
    return true;
  }

  async openJobPage(page: Page) {
    await page.setContent("<html><body><form><input id='name' value='' /></form></body></html>");
  }

  async extractJobMetadata() {
    return {};
  }

  async clickApply() {}

  async extractFormFields() {
    return this.options.fields;
  }

  async fillField() {
    return true;
  }

  async uploadResume() {
    return false;
  }

  async uploadCoverLetter() {
    return false;
  }

  async answerScreeningQuestions() {}

  async reviewBeforeSubmit() {}

  async submitApplication() {
    this.options.onSubmit?.();
    return true;
  }

  async getCurrentStep() {
    return { step: this.options.step ?? "review-before-submit" };
  }

  async collectErrors() {
    return this.options.errors;
  }
}

function makeField(label: string, required = true): DetectedFormField {
  return {
    label,
    type: "text",
    required,
    options: [],
    visible: true,
    domLocator: {
      selector: "#name",
    },
  };
}

test("Valid runs submit successfully even when the saved mode was review", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let submitCount = 0;

  try {
    const adapter = new MockAdapter({
      fields: [makeField("Full Name")],
      errors: [],
      onSubmit: () => {
        submitCount += 1;
      },
    });

    const result = await runAdapterFlow(
      adapter,
      page,
      "https://jobs.lever.co/acme/123",
      createContext("review", 0.75),
    );

    assert.equal(submitCount, 1);
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.equal(result.status, "Applied");
    assert.equal(result.reviewSummary?.mode, "review");
  } finally {
    await browser.close();
  }
});

test("Low-confidence runs end as Needs Review without submitting", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let submitCount = 0;

  try {
    const adapter = new MockAdapter({
      fields: [makeField("Describe your dream team culture in 500 words")],
      errors: [],
      onSubmit: () => {
        submitCount += 1;
      },
    });

    const result = await runAdapterFlow(
      adapter,
      page,
      "https://jobs.lever.co/acme/123",
      createContext("auto", 0.9),
    );

    assert.equal(submitCount, 0);
    assert.equal(result.submitAttempted, false);
    assert.equal(result.submitCompleted, false);
    assert.equal(result.status, "Needs Review");
    assert.ok(
      result.reviewSummary?.blockingReasons.some((reason) => /below the auto-submit threshold/i.test(reason)),
    );
  } finally {
    await browser.close();
  }
});

test("Required field blockers end as Needs Review without submitting", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let submitCount = 0;

  try {
    const adapter = new MockAdapter({
      fields: [makeField("Portfolio URL")],
      errors: [{ message: "Required field is still empty.", fieldLabel: "Portfolio URL" }],
      onSubmit: () => {
        submitCount += 1;
      },
    });

    const result = await runAdapterFlow(
      adapter,
      page,
      "https://jobs.lever.co/acme/123",
      createContext("auto", 0.4),
    );

    assert.equal(submitCount, 0);
    assert.equal(result.submitAttempted, false);
    assert.equal(result.status, "Needs Review");
    assert.deepEqual(result.reviewSummary?.unresolvedRequiredFields, ["Portfolio URL"]);
  } finally {
    await browser.close();
  }
});

test("Auto Submit attempts final submit only when all safety conditions are satisfied", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let submitCount = 0;

  try {
    const adapter = new MockAdapter({
      fields: [makeField("Full Name")],
      errors: [],
      onSubmit: () => {
        submitCount += 1;
      },
    });

    const result = await runAdapterFlow(
      adapter,
      page,
      "https://jobs.lever.co/acme/123",
      createContext("auto", 0.4),
    );

    assert.equal(submitCount, 1);
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.equal(result.status, "Applied");
    assert.equal(result.reviewSummary?.eligibleForAutoSubmit, true);
  } finally {
    await browser.close();
  }
});

test("confidence gating uses the same two-decimal threshold shown in the UI", () => {
  const summary = buildReviewSummary({
    submitMode: "auto",
    confidenceScore: 0.8479666666666668,
    confidenceThreshold: 0.85,
    unresolvedFields: [],
    validationErrors: [],
    lastCompletedStep: "review-before-submit",
  });

  assert.equal(summary.eligibleForAutoSubmit, true);
  assert.equal(summary.shouldAttemptSubmit, true);
  assert.equal(summary.blockingReasons.length, 0);
});

test("buildReviewSummary recommends Needs Review when submit is gated", () => {
  const summary = buildReviewSummary({
    submitMode: "auto",
    confidenceScore: 0.9,
    confidenceThreshold: 0.85,
    unresolvedFields: ["Custom essay"],
    validationErrors: [],
    lastCompletedStep: "review-before-submit",
  });

  assert.equal(summary.shouldAttemptSubmit, false);
  assert.equal(summary.recommendedStatus, "Needs Review");
});

test("buildReviewSummary recommends Needs Review when confidence is below threshold", () => {
  const summary = buildReviewSummary({
    submitMode: "auto",
    confidenceScore: 0.5,
    confidenceThreshold: 0.85,
    unresolvedFields: [],
    validationErrors: [],
    lastCompletedStep: "review-before-submit",
  });

  assert.equal(summary.shouldAttemptSubmit, false);
  assert.equal(summary.recommendedStatus, "Needs Review");
});
