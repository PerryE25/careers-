import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { LeverAdapter } from "./lever-adapter.js";
import { runAdapterFlow, type AutomationContext } from "../adapter.js";
import type { Profile } from "../../domain/models.js";

const fixtureHtml = `
<!doctype html>
<html>
  <body>
    <div class="posting-page">
      <div class="posting-headline">
        <h2>Senior Data Engineer</h2>
      </div>
      <div data-qa="company-name">Acme AI</div>
      <div class="posting-categories">
        <div class="location">Remote - US</div>
      </div>
      <button data-qa="btn-apply-bottom" onclick="document.querySelector('.application-page').style.display='block'">
        Apply for this job
      </button>
    </div>

    <div class="application-page" style="display:none">
      <h2>Application</h2>
      <section>
        <h3>Candidate info</h3>
        <label for="name">Legal First Name</label>
        <input id="name" name="name" type="text" required />

        <label for="email">Email Address</label>
        <input id="email" name="email" type="email" required />

        <label for="phone">Mobile</label>
        <input id="phone" name="phone" type="tel" />

        <label for="resume">Resume/CV</label>
        <input id="resume" name="resume" type="file" required />

        <label for="coverLetter">Cover Letter</label>
        <input id="coverLetter" name="coverLetter" type="file" />
      </section>

      <fieldset>
        <legend>Eligibility</legend>
        <label><input type="radio" name="sponsorship" value="Yes" /> Yes</label>
        <label><input type="radio" name="sponsorship" value="No" /> No</label>
      </fieldset>

      <label for="salary">Salary Expectations</label>
      <select id="salary" name="salary">
        <option value="">Choose one</option>
        <option>$120,000</option>
        <option>$140,000</option>
      </select>

      <label for="startDate">Earliest Start Date</label>
      <textarea id="startDate" name="startDate"></textarea>

      <button
        type="submit"
        onclick="event.preventDefault(); this.closest('.application-page').style.display='none'; document.getElementById('lever-thanks').style.display='block';"
      >
        Submit Application
      </button>
      <div id="lever-thanks" style="display:none"><p>Thank you for applying.</p></div>
    </div>
  </body>
</html>
`;

const happyPathFixtureHtml = fixtureHtml.replace('id="resume" name="resume" type="file" required', 'id="resume" name="resume" type="file"');
const saronicStyleFixtureHtml = `
<!doctype html>
<html>
  <body>
    <div class="application-page" style="display:block">
      <form class="application-form" onsubmit="event.preventDefault()">
        <label for="name">Full name</label>
        <input id="name" name="name" type="text" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />

        <label for="resume">Resume/CV</label>
        <input id="resume" name="resume" type="file" />

        <fieldset>
          <legend>Are you a U.S. Person as defined in ITAR section 120.62?</legend>
          <label><input type="radio" name="cards[itar][field0]" value="Yes" required /> Yes</label>
          <label><input type="radio" name="cards[itar][field0]" value="No" required /> No</label>
        </fieldset>

        <fieldset>
          <legend>Are you willing to work onsite full-time in Austin, Texas?</legend>
          <label><input type="radio" name="cards[onsite][field0]" value="Yes" required /> Yes</label>
          <label><input type="radio" name="cards[onsite][field0]" value="No" required /> No</label>
        </fieldset>

        <div class="error-message" style="display:none">
          File exceeds the maximum upload size of 100MB. Please try a smaller size.
        </div>

        <button
          type="submit"
          onclick="event.preventDefault(); this.closest('form').style.display='none'; document.getElementById('saronic-thanks').style.display='block';"
        >
          Submit application
        </button>
        <div id="saronic-thanks" style="display:none"><p>Thank you for applying.</p></div>
      </form>
    </div>
  </body>
</html>
`;

const loginFirstGuestFixtureHtml = `
<!doctype html>
<html>
  <body>
    <div class="posting-page">
      <div class="posting-headline">
        <h2>Staff Platform Engineer</h2>
      </div>
      <button
        data-qa="btn-apply-bottom"
        onclick="document.querySelector('.login-wall').style.display='block'; this.style.display='none';"
      >
        Apply for this job
      </button>
    </div>

    <div class="login-wall" style="display:none">
      <h2>Log in to continue</h2>
      <button type="button">Continue with Google</button>
      <button
        type="button"
        onclick="document.querySelector('.login-wall').style.display='none'; document.querySelector('.application-page').style.display='block';"
      >
        Apply as guest
      </button>
    </div>

    <div class="application-page" style="display:none">
      <form class="application-form" onsubmit="event.preventDefault()">
        <label for="name">Full name</label>
        <input id="name" name="name" type="text" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />

        <button type="submit">Submit application</button>
      </form>
    </div>
  </body>
</html>
`;

function createContext(): AutomationContext {
  const profile: Profile = {
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
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
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

function createTempDocuments(prefix: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const resumePath = path.join(tempDir, "resume.txt");
  const coverPath = path.join(tempDir, "cover.txt");
  fs.writeFileSync(resumePath, "resume");
  fs.writeFileSync(coverPath, "cover");
  return { tempDir, resumePath, coverPath };
}

test("Lever adapter extracts metadata and application fields from fixture HTML", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new LeverAdapter();
  try {
    await page.setContent(fixtureHtml);
    const context = createContext();

    const metadata = await adapter.extractJobMetadata(page, "https://jobs.lever.co/acme/abc123", context);
    assert.equal(metadata.title, "Senior Data Engineer");
    assert.equal(metadata.company, "Acme AI");
    assert.equal(metadata.location, "Remote - US");

    await adapter.clickApply(page, context);
    const fields = await adapter.extractFormFields(page, context);

    assert.ok(fields.some((field) => field.label.includes("Legal First Name") && field.required));
    assert.ok(fields.some((field) => field.type === "email" && field.label.includes("Email")));
    assert.ok(fields.some((field) => field.type === "phone" && field.label.includes("Mobile")));
    assert.ok(fields.some((field) => field.type === "radio" && field.options.includes("Yes") && field.options.includes("No")));
    assert.ok(fields.some((field) => field.type === "select" && field.options.includes("$140,000")));
    assert.ok(fields.some((field) => field.type === "file" && field.label.includes("Resume")));

    const step = await adapter.getCurrentStep(page, context);
    assert.equal(step.step, "review-before-submit");
  } finally {
    await browser.close();
  }
});

test("Lever adapter uploads resume/cover letter and collects missing required errors", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new LeverAdapter();
  const { tempDir, resumePath, coverPath } = createTempDocuments("lever-fixture-");

  try {
    await page.setContent(fixtureHtml);
    const context = createContext();
    await adapter.clickApply(page, context);

    const uploadedResume = await adapter.uploadResume(page, resumePath, context);
    const uploadedCover = await adapter.uploadCoverLetter(page, coverPath, context);
    assert.equal(uploadedResume, true);
    assert.equal(uploadedCover, true);

    const errorsBefore = await adapter.collectErrors(page, context);
    assert.ok(errorsBefore.some((error) => error.fieldLabel?.includes("Legal First Name")));
    assert.ok(errorsBefore.some((error) => error.fieldLabel?.includes("Email Address")));

    await page.locator("#name").fill("Perry");
    await page.locator("#email").fill("perry@example.com");
    const errorsAfter = await adapter.collectErrors(page, context);
    assert.ok(!errorsAfter.some((error) => error.fieldLabel?.includes("Legal First Name")));
    assert.ok(!errorsAfter.some((error) => error.fieldLabel?.includes("Email Address")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

test("Lever adapter completes a happy path fixture and submits successfully", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  class FixtureLeverAdapter extends LeverAdapter {
    override async openJobPage(targetPage: import("playwright").Page) {
      await targetPage.setContent(happyPathFixtureHtml, { waitUntil: "domcontentloaded" });
    }
  }
  const adapter = new FixtureLeverAdapter();
  const { tempDir, resumePath, coverPath } = createTempDocuments("lever-flow-");

  try {
    const context = createContext();
    context.resume = {
      id: "resume-1",
      kind: "resume",
      fileName: "resume.txt",
      storagePath: resumePath,
      mimeType: "text/plain",
      source: "uploaded",
      createdAt: "",
    };
    context.coverLetter = {
      id: "cover-1",
      kind: "cover-letter",
      fileName: "cover.txt",
      storagePath: coverPath,
      mimeType: "text/plain",
      source: "generated",
      createdAt: "",
    };

    const result = await runAdapterFlow(adapter, page, "https://jobs.lever.co/acme/abc123", context);

    assert.equal(result.status, "Applied");
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.equal(result.step, "review-before-submit");
    assert.deepEqual(result.unresolvedFields, []);
    assert.deepEqual(result.errors, []);
    assert.equal(await page.locator("#name").inputValue(), "Perry");
    assert.equal(await page.locator("#email").inputValue(), "perry@example.com");
    assert.equal(await page.locator("#salary").inputValue(), "$140,000");
    assert.equal(await page.locator("#resume").evaluate((el) => (el as HTMLInputElement).files?.length ?? 0), 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

test("Lever adapter submits grouped yes-no questions and ignores hidden upload errors", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  class FixtureLeverAdapter extends LeverAdapter {
    override async openJobPage(targetPage: import("playwright").Page) {
      await targetPage.setContent(saronicStyleFixtureHtml, { waitUntil: "domcontentloaded" });
    }
  }
  const adapter = new FixtureLeverAdapter();
  const { tempDir, resumePath } = createTempDocuments("lever-saronic-flow-");

  try {
    const context = createContext();
    context.profile.autoSubmitConfidenceThreshold = 0.8;
    context.profile.autofillFields.u_s_citizen = "Yes";
    context.profile.autofillFields.open_to_onsite = "Yes";
    context.resume = {
      id: "resume-1",
      kind: "resume",
      fileName: "resume.txt",
      storagePath: resumePath,
      mimeType: "text/plain",
      source: "uploaded",
      createdAt: "",
    };

    const result = await runAdapterFlow(adapter, page, "https://jobs.lever.co/saronic/abc123", context);

    assert.equal(result.status, "Applied");
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.deepEqual(result.unresolvedFields, []);
    assert.deepEqual(result.errors, []);
    assert.equal(await page.locator("input[name='cards[itar][field0]'][value='Yes']").isChecked(), true);
    assert.equal(await page.locator("input[name='cards[onsite][field0]'][value='Yes']").isChecked(), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

const leverScreeningTextareaFixtureHtml = `
<!doctype html>
<html>
  <body style="margin:24px">
    <div class="posting-headline"><h2>Platform Engineer</h2></div>
    <div data-qa="company-name">River Systems</div>
    <div class="application-page">
      <div class="application-question">
        <label for="co">Why do you want to work at our company?</label>
        <textarea id="co" name="co" required rows="5" cols="50"></textarea>
      </div>
    </div>
  </body>
</html>
`;

test("Lever adapter fills a categorized required textarea during answerScreeningQuestions", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new LeverAdapter();
  try {
    await page.setContent(leverScreeningTextareaFixtureHtml);
    const context = createContext();
    await adapter.answerScreeningQuestions(page, context);
    const value = await page.locator("#co").inputValue();
    assert.match(value, /interested|River|company/i);
  } finally {
    await browser.close();
  }
});

test("Lever adapter bypasses login-first apply walls when a guest CTA is available", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new LeverAdapter();
  try {
    await page.setContent(loginFirstGuestFixtureHtml);
    const context = createContext();

    await adapter.clickApply(page, context);

    assert.equal(await page.locator(".application-page").isVisible(), true);
    const fields = await adapter.extractFormFields(page, context);
    assert.ok(fields.some((field) => field.label.includes("Full name")));
    assert.ok(fields.some((field) => field.label.includes("Email")));
  } finally {
    await browser.close();
  }
});
