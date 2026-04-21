import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import type { AutomationContext } from "../adapter.js";
import {
  handleLoginFirstApplyLayout,
  LoginFirstLayoutUnsupportedError,
  type LoginFirstApplyConfig,
} from "./login-first-apply.js";

const leverLikeConfig: LoginFirstApplyConfig = {
  provider: "lever",
  supportedUrlShape: "https://jobs.lever.co/<company>/<job-id> or the matching /apply guest page",
  formRootSelectors: [".application-page", "form.application-form", "form"],
  postingSurfaceSelectors: [
    ".posting-headline",
    "[data-qa='posting-name']",
    "[data-qa='btn-apply-bottom']",
    "[data-qa='btn-apply-top']",
  ],
};

function minimalContext(): AutomationContext {
  return {
    profile: {
      id: "p",
      resumeText: "",
      autofillText: "",
      autofillFields: {},
      canonicalProfile: {
        personalInfo: { firstName: "A", lastName: "B", fullName: "A B" },
        contactInfo: { email: "a@b.co", phone: "", linkedin: "" },
        locationPreferences: { currentLocation: "", preferredLocations: [], remotePreference: "Remote" },
        workAuthorization: { workAuthorizationStatus: "Authorized", requiresSponsorship: false, authorizedCountries: [] },
        education: [],
        technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
        projects: [],
        prewrittenAnswers: [],
        demographicAnswers: {},
        jobPreferences: { desiredTitles: [], employmentTypes: [], workplaceTypes: [], industries: [] },
        salaryPreferences: { minimumBase: "", targetBase: "", currency: "USD" },
        relocationPreferences: { openToRelocate: false, preferredLocations: [] },
        availability: { startDate: "", noticePeriod: "", availableImmediately: false },
        technicalBackground: [],
        hasExplicitNoWorkExperience: false,
        sourceNotes: [],
      },
      validation: { isValid: true, issues: [] },
      submitMode: "review",
      autoSubmitConfidenceThreshold: 0.85,
      createdAt: "",
      updatedAt: "",
    },
    submitMode: "review",
    logger: { info() {}, warn() {}, error() {} },
    screenshotHook: async () => {},
  };
}

const postingWithNavChromeHtml = `
<!doctype html>
<html><body>
  <header>
    <button type="button">Sign in</button>
    <button type="button">Create account</button>
  </header>
  <div class="posting-headline"><h2>Staff Engineer</h2></div>
  <p>Job description text.</p>
</body></html>
`;

const navAuthOnlyHtml = `
<!doctype html>
<html><body>
  <header>
    <button type="button">Sign in</button>
    <button type="button">Create account</button>
  </header>
  <p>Some marketing copy without posting chrome.</p>
</body></html>
`;

test("login-first: ignores two auth nav controls when job posting surface is visible", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(postingWithNavChromeHtml);
    const handled = await handleLoginFirstApplyLayout(page, minimalContext(), leverLikeConfig);
    assert.equal(handled, false);
  } finally {
    await browser.close();
  }
});

test("login-first: treats auth-only chrome as a wall when no posting surface is visible", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(navAuthOnlyHtml);
    await assert.rejects(
      () => handleLoginFirstApplyLayout(page, minimalContext(), leverLikeConfig),
      (error: unknown) => error instanceof LoginFirstLayoutUnsupportedError,
    );
  } finally {
    await browser.close();
  }
});
