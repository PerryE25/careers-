import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { WorkdayAdapter } from "./workday-adapter.js";
import type { AutomationContext } from "../adapter.js";
import type { Profile } from "../../domain/models.js";

const multiStepFixtureHtml = `
<!doctype html>
<html>
  <body>
    <script>
      window.currentStep = 1;
      function syncSteps() {
        for (const element of document.querySelectorAll('[data-step]')) {
          element.style.display = Number(element.getAttribute('data-step')) === window.currentStep ? 'block' : 'none';
        }
        const stepName = document.querySelector('[data-automation-id="stepName"]');
        if (stepName) {
          stepName.textContent = window.currentStep === 1 ? 'My Information' : window.currentStep === 2 ? 'Application Questions' : 'Review';
        }
        const nextButton = document.querySelector('[data-automation-id="pageFooterNextButton"]');
        const submitButton = document.querySelector('[data-automation-id="pageFooterSubmitButton"]');
        if (nextButton) nextButton.style.display = window.currentStep < 3 ? 'inline-block' : 'none';
        if (submitButton) submitButton.style.display = window.currentStep === 3 ? 'inline-block' : 'none';
      }
      function startApply() {
        document.querySelector('#flow').style.display = 'block';
        syncSteps();
      }
      function goNext() {
        if (window.currentStep < 3) {
          window.currentStep += 1;
          syncSteps();
        }
      }
    </script>

    <div data-automation-id="jobPostingHeader">Senior Analytics Engineer</div>
    <div data-automation-id="company">Acme Workday</div>
    <div data-automation-id="locations">Remote - United States</div>
    <button data-automation-id="applyManually" onclick="startApply()">Apply Manually</button>

    <div id="flow" style="display:none">
      <div data-automation-id="stepName">My Information</div>

      <section data-step="1">
        <h2>My Information</h2>
        <label for="firstName">Given Name</label>
        <input id="firstName" name="firstName" type="text" required />

        <label for="lastName">Legal Last Name</label>
        <input id="lastName" name="lastName" type="text" required />

        <label for="email">Email Address</label>
        <input id="email" name="email" type="email" required />

        <label for="resumeUpload">Resume Upload</label>
        <input id="resumeUpload" type="file" data-automation-id="resume-upload" required />
      </section>

      <section data-step="2" style="display:none">
        <h2>Application Questions</h2>
        <label for="workAuth">Are you authorized to work in the United States?</label>
        <select id="workAuth" name="workAuth" required>
          <option value="">Select One</option>
          <option>Yes</option>
          <option>No</option>
        </select>

        <fieldset>
          <legend>Will you require sponsorship now or in the future?</legend>
          <label><input type="radio" name="sponsorship" value="Yes" /> Yes</label>
          <label><input type="radio" name="sponsorship" value="No" /> No</label>
        </fieldset>

        <label for="whyHere">Why do you want to work here?</label>
        <textarea id="whyHere" name="whyHere" required></textarea>

        <label>
          <input id="privacyConsent" type="checkbox" name="privacyConsent" required />
          I consent to the processing of my personal data under the privacy policy
        </label>
      </section>

      <section data-step="3" style="display:none">
        <h2>Review</h2>
        <label for="coverUpload">Cover Letter Upload</label>
        <input id="coverUpload" type="file" data-automation-id="cover-letter-upload" />
        <div data-automation-id="pageSummary">Ready for review before submit.</div>
      </section>

      <button data-automation-id="pageFooterNextButton" onclick="goNext()">Next</button>
      <button data-automation-id="pageFooterSubmitButton" style="display:none">Submit</button>
    </div>
  </body>
</html>
`;

const unresolvedFixtureHtml = `
<!doctype html>
<html>
  <body>
    <button data-automation-id="applyManually" onclick="document.querySelector('#flow').style.display='block'">Apply</button>
    <div id="flow" style="display:none">
      <div data-automation-id="stepName">Application Questions</div>
      <section>
        <h2>Application Questions</h2>
        <label for="portfolio">Portfolio URL</label>
        <input id="portfolio" name="portfolio" type="text" required />

        <label for="ambiguousEssay">Describe your ideal team culture in detail</label>
        <textarea id="ambiguousEssay" name="ambiguousEssay" required></textarea>
      </section>
      <button data-automation-id="pageFooterSubmitButton">Submit</button>
      <div data-automation-id="errorMessage">Please complete this required field.</div>
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
      contactInfo: {
        email: "perry@example.com",
        phone: "555-111-2222",
        linkedin: "https://linkedin.com/in/perry",
        portfolio: "https://portfolio.example.com",
      },
      locationPreferences: { currentLocation: "Chicago, IL", preferredLocations: [], remotePreference: "Remote" },
      workAuthorization: { workAuthorizationStatus: "Yes", requiresSponsorship: false, authorizedCountries: ["US"] },
      education: [],
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
      prewrittenAnswers: [
        {
          prompt: "Why do you want to work here?",
          answer: "The role aligns closely with my background, and I am excited by the chance to contribute to the team.",
          length: "long",
          tags: ["why", "work", "here"],
        },
      ],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: ["Analytics Engineer"], employmentTypes: ["Full-time"], workplaceTypes: ["Remote"], industries: [] },
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

test("Workday adapter extracts metadata and detects current step", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new WorkdayAdapter();
  try {
    await page.setContent(multiStepFixtureHtml);
    const context = createContext();

    const metadata = await adapter.extractJobMetadata(
      page,
      "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Remote/Senior-Analytics-Engineer_JR-9001",
      context,
    );
    assert.equal(metadata.title, "Senior Analytics Engineer");
    assert.equal(metadata.company, "Acme Workday");
    assert.equal(metadata.location, "Remote - United States");

    await adapter.clickApply(page, context);
    const step = await adapter.getCurrentStep(page, context);
    assert.match(step.step, /my information/i);

    const fields = await adapter.extractFormFields(page, context);
    assert.ok(fields.some((field) => field.label.includes("Given Name") && field.required));
    assert.ok(fields.some((field) => field.type === "email"));
    assert.ok(fields.some((field) => field.type === "file"));
  } finally {
    await browser.close();
  }
});

test("Workday adapter progresses through steps and submits successfully", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new WorkdayAdapter();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workday-fixture-"));
  const resumePath = path.join(tempDir, "resume.txt");
  const coverPath = path.join(tempDir, "cover.txt");
  fs.writeFileSync(resumePath, "resume");
  fs.writeFileSync(coverPath, "cover");

  try {
    await page.setContent(multiStepFixtureHtml, { waitUntil: "domcontentloaded" });
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

    const result = await adapter.fillApplication!(page, context);
    assert.equal(result.status, "Applied");
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.match(result.step ?? "", /review/i);

    const currentStep = await adapter.getCurrentStep(page, context);
    assert.equal(currentStep.step, "review-before-submit");
    assert.equal(await page.locator("#privacyConsent").isChecked(), true);
    assert.equal(await page.locator("#coverUpload").evaluate((el) => (el as HTMLInputElement).files?.length ?? 0), 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

test("Workday adapter stops at Needs Review on unresolved required fields", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new WorkdayAdapter();
  try {
    await page.setContent(unresolvedFixtureHtml, { waitUntil: "domcontentloaded" });
    const context = createContext();

    const result = await adapter.fillApplication!(page, context);
    assert.equal(result.status, "Needs Review");
    assert.ok((result.unresolvedFields ?? []).some((field) => field.includes("Describe your ideal team culture")));
    assert.ok((result.errors ?? []).some((error) => error.message.includes("Please complete")));
    assert.equal(result.submitAttempted, false);
  } finally {
    await browser.close();
  }
});
