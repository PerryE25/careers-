import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import type { AutomationContext } from "../adapter.js";
import type { Profile } from "../../domain/models.js";
import { autofillScreeningTextareas, resolveScreeningAnswerContextFromPage } from "./screening-textarea-filler.js";

function baseProfile(): Profile {
  return {
    id: "profile-1",
    resumeText: "",
    autofillText: "",
    autofillFields: {},
    canonicalProfile: {
      personalInfo: { firstName: "Perry", lastName: "Jones", fullName: "Perry Jones" },
      contactInfo: { email: "perry@example.com", phone: "555-111-2222", linkedin: "https://linkedin.com/in/perry" },
      locationPreferences: { currentLocation: "Chicago, IL", preferredLocations: [], remotePreference: "Remote" },
      workAuthorization: { workAuthorizationStatus: "Authorized", requiresSponsorship: false, authorizedCountries: ["US"] },
      education: [],
      technicalSkills: { languages: ["TypeScript"], frameworks: ["React"], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [
        {
          name: "Payments API",
          summary: "Led redesign of billing microservices.",
          technologies: ["Go", "Kafka"],
          links: [],
        },
      ],
      prewrittenAnswers: [],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: ["Data Engineer"], employmentTypes: ["Full-time"], workplaceTypes: ["Remote"], industries: [] },
      salaryPreferences: { minimumBase: "$120,000", targetBase: "$140,000", currency: "USD" },
      relocationPreferences: { openToRelocate: false, preferredLocations: [] },
      availability: { startDate: "2026-05-01", noticePeriod: "2 weeks", availableImmediately: false },
      technicalBackground: [],
      hasExplicitNoWorkExperience: true,
      sourceNotes: [],
    },
    validation: { isValid: true, issues: [] },
    submitMode: "review",
    autoSubmitConfidenceThreshold: 0.85,
    createdAt: "",
    updatedAt: "",
  };
}

function createContext(profile: Profile): AutomationContext {
  return {
    profile,
    submitMode: "review",
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    screenshotHook: async () => {},
  };
}

const leverRoleInterestFixture = `
<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body style="margin:24px">
    <div class="posting-headline"><h2>Backend Engineer</h2></div>
    <div data-qa="company-name">Contoso Labs</div>
    <div class="application-page">
      <div class="application-question">
        <label for="rolewhy">Why are you interested in this role?</label>
        <textarea id="rolewhy" name="rolewhy" required rows="5" cols="40"></textarea>
      </div>
    </div>
  </body>
</html>
`;

const unknownPromptFixture = `
<!doctype html>
<html><body style="margin:24px">
  <div class="posting-headline"><h2>Engineer</h2></div>
  <div data-qa="company-name">Acme</div>
  <div class="application-page">
    <label for="odd">What is your favorite color of submarine?</label>
    <textarea id="odd" name="odd" required rows="3" cols="40"></textarea>
  </div>
</body></html>
`;

const demographicSkipFixture = `
<!doctype html>
<html><body style="margin:24px">
  <div class="posting-headline"><h2>Engineer</h2></div>
  <div class="application-page">
    <label for="eeo">Disability: please provide any additional context we should know.</label>
    <textarea id="eeo" name="eeo" required rows="3" cols="40"></textarea>
  </div>
</body></html>
`;

test("resolveScreeningAnswerContextFromPage reads Lever posting metadata", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(leverRoleInterestFixture);
    const ctx = await resolveScreeningAnswerContextFromPage(page, "lever");
    assert.match(ctx.roleTitle ?? "", /Backend Engineer/i);
    assert.match(ctx.companyName ?? "", /Contoso/i);
  } finally {
    await browser.close();
  }
});

test("autofillScreeningTextareas fills a known-category required textarea", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(leverRoleInterestFixture);
    const context = createContext(baseProfile());
    const answerContext = await resolveScreeningAnswerContextFromPage(page, "lever");
    const result = await autofillScreeningTextareas(page, context, answerContext);
    assert.equal(result.filled, 1);
    assert.deepEqual(result.unresolvedPrompts, []);
    const value = await page.locator("#rolewhy").inputValue();
    assert.match(value, /interested/i);
  } finally {
    await browser.close();
  }
});

test("autofillScreeningTextareas lists unresolved prompts when category is unknown", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const warnings: Record<string, unknown>[] = [];
  try {
    await page.setContent(unknownPromptFixture);
    const profile = baseProfile();
    const context = createContext(profile);
    context.logger = {
      info() {},
      warn(payload: string, meta?: Record<string, unknown>) {
        if (payload.includes("Unresolved required screening")) {
          warnings.push(meta ?? {});
        }
      },
      error() {},
    };
    const answerContext = await resolveScreeningAnswerContextFromPage(page, "lever");
    const result = await autofillScreeningTextareas(page, context, answerContext);
    assert.equal(result.filled, 0);
    assert.equal(result.unresolvedPrompts.length, 1);
    assert.match(result.unresolvedPrompts[0] ?? "", /submarine/i);
    assert.equal(await page.locator("#odd").inputValue(), "");
    const rollup = warnings.find((entry) => Array.isArray((entry as { prompts?: string[] }).prompts));
    assert.ok(rollup);
    const prompts = (rollup as { prompts: string[] }).prompts;
    assert.ok(prompts.some((p) => /submarine/i.test(p)));
  } finally {
    await browser.close();
  }
});

test("autofillScreeningTextareas skips demographic prompts without counting them unresolved", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(demographicSkipFixture);
    const context = createContext(baseProfile());
    const result = await autofillScreeningTextareas(page, context, {});
    assert.equal(result.filled, 0);
    assert.deepEqual(result.unresolvedPrompts, []);
    assert.equal(result.skippedDemographic, 1);
    assert.equal(await page.locator("#eeo").inputValue(), "");
  } finally {
    await browser.close();
  }
});
