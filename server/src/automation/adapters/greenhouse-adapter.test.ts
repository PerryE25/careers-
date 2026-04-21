import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { GreenhouseAdapter } from "./greenhouse-adapter.js";
import { LoginFirstLayoutUnsupportedError } from "../shared/login-first-apply.js";
import { runAdapterFlow, type AutomationContext } from "../adapter.js";
import type { Profile } from "../../domain/models.js";

const hostedFixtureHtml = `
<!doctype html>
<html>
  <body>
    <div id="app_body">
      <div id="header">
        <div class="company-name">Acme Labs</div>
        <div class="location">Remote</div>
      </div>
      <div class="opening">
        <h1 class="app-title">Senior Product Analyst</h1>
      </div>
      <form id="application_form" onsubmit="event.preventDefault()">
        <div id="main_fields">
          <h3>Candidate Information</h3>

          <label for="first_name">Given Name</label>
          <input id="first_name" name="first_name" type="text" required />

          <label for="last_name">Surname</label>
          <input id="last_name" name="last_name" type="text" required />

          <label for="email">Email</label>
          <input id="email" name="email" type="email" required />

          <label for="phone">Mobile Phone</label>
          <input id="phone" name="phone" type="tel" />

          <label for="resume">Resume</label>
          <input id="resume" name="application[resume]" type="file" required />

          <label for="cover_letter">Cover Letter</label>
          <input id="cover_letter" name="application[cover_letter]" type="file" />
        </div>

        <div class="application_question">
          <h3>Additional Questions</h3>
          <label for="work_auth">Are you legally authorized to work in the United States?</label>
          <select id="work_auth" name="work_auth" required>
            <option value="">Select</option>
            <option>Yes</option>
            <option>No</option>
          </select>

          <label for="salary">Salary Expectations</label>
          <select id="salary" name="salary">
            <option value="">Select</option>
            <option>$120,000</option>
            <option>$140,000</option>
          </select>

          <label for="start_date">Earliest Start Date</label>
          <textarea id="start_date" name="start_date"></textarea>
        </div>

        <button
          type="submit"
          onclick="event.preventDefault(); document.getElementById('application_form').style.display='none'; document.getElementById('gh-hosted-thanks').style.display='block';"
        >
          Submit Application
        </button>
        <div id="gh-hosted-thanks" style="display:none"><p>Thank you for applying.</p></div>
      </form>
    </div>
  </body>
</html>
`;

const hostedHappyPathFixtureHtml = hostedFixtureHtml
  .replace('id="resume" name="application[resume]" type="file" required', 'id="resume" name="application[resume]" type="file"');

const consentFixtureHtml = `
<!doctype html>
<html>
  <body>
    <div id="app_body">
      <div class="opening">
        <h1>Data Engineer</h1>
      </div>
      <form id="application_form" onsubmit="event.preventDefault()">
        <div class="application_question">
          <h3>Screening</h3>
          <label for="why_here">Why do you want to work here?</label>
          <textarea id="why_here" name="why_here" required></textarea>
        </div>

        <div class="application_question">
          <h3>Consent</h3>
          <label>
            <input type="checkbox" id="consent" name="consent" required />
            I consent to the processing of my personal data under the privacy policy
          </label>
        </div>

        <div class="application-errors">Please complete required fields.</div>
        <button type="submit">Submit Application</button>
      </form>
    </div>
  </body>
</html>
`;

const customInlineFixtureHtml = `
<!doctype html>
<html>
  <body>
    <main>
      <h1>Senior Android Engineer</h1>
      <a href="#form">Apply now</a>
      <form onsubmit="event.preventDefault()">
        <label for="first_name">First name</label>
        <input id="first_name" name="first_name" type="text" />

        <label for="last_name">Last name</label>
        <input id="last_name" name="last_name" type="text" />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" />

        <label for="resume">Upload your CV</label>
        <input id="resume" name="resume" type="file" />

        <button>Submit application</button>
      </form>
    </main>
  </body>
</html>
`;

const boltStyleFixtureHtml = `
<!doctype html>
<html>
  <body>
    <main>
      <h1>Senior Android Engineer</h1>
      <a href="#form">Apply now</a>
      <form id="form" onsubmit="event.preventDefault()">
        <label for="first_name">First name</label>
        <input id="first_name" name="first_name" type="text" required />

        <label for="last_name">Last name</label>
        <input id="last_name" name="last_name" type="text" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />

        <label for="phone">Phone Number</label>
        <input id="phone" name="phone" type="tel" />

        <label>
          <input type="checkbox" name="isGdprConsentGiven" value="true" required />
          I consent to the processing of my personal data under the privacy policy
        </label>

        <label for="gender">Gender</label>
        <select id="gender" name="eeo[gender]">
          <option>Select ...</option>
          <option>Male</option>
          <option>Female</option>
          <option>Decline to self-identify</option>
        </select>

        <fieldset>
          <legend>Race</legend>
          <label><input type="radio" name="eeo[race]" value="White" /> White</label>
          <label><input type="radio" name="eeo[race]" value="Black" /> Black</label>
          <label><input type="radio" name="eeo[race]" value="Decline to self-identify" /> Decline to self-identify</label>
        </fieldset>

        <label for="disability">Disability status</label>
        <select id="disability" name="eeo[disability]">
          <option>Select ...</option>
          <option>Yes, I have a disability, or have had one in the past</option>
          <option>No, I do not have a disability and have not had one in the past</option>
          <option>I do not want to answer</option>
        </select>

        <label for="accommodation">
          Do you need special assistance due to disability? We are happy to provide reasonable accommodations. (optional)
        </label>
        <input id="accommodation" name="question_35969030002" type="text" />

        <label for="resume">Upload your CV</label>
        <input id="resume" name="resume" type="file" />

        <button
          type="submit"
          onclick="event.preventDefault(); document.getElementById('form').style.display='none'; document.getElementById('bolt-thanks').style.display='block';"
        >
          Submit application
        </button>
        <div id="bolt-thanks" style="display:none"><p>Thank you for applying.</p></div>
      </form>
    </main>
  </body>
</html>
`;

const loginFirstUnsupportedFixtureHtml = `
<!doctype html>
<html>
  <body>
    <main>
      <h1>Sign in to continue</h1>
      <button type="button">Continue with Google</button>
      <button type="button">Continue with SSO</button>
    </main>
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
      workAuthorization: { workAuthorizationStatus: "Yes", requiresSponsorship: false, authorizedCountries: ["US"] },
      education: [],
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
      prewrittenAnswers: [
        {
          prompt: "Why do you want to work here?",
          answer: "The role aligns closely with my background, and I am excited by the team mission and product scope.",
          length: "long",
          tags: ["why", "work", "here"],
        },
      ],
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

test("Greenhouse adapter extracts metadata and common fields from hosted layout", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GreenhouseAdapter();
  try {
    await page.setContent(hostedFixtureHtml);
    const context = createContext();

    const metadata = await adapter.extractJobMetadata(page, "https://boards.greenhouse.io/acme/jobs/12345", context);
    assert.equal(metadata.title, "Senior Product Analyst");
    assert.equal(metadata.company, "Acme Labs");
    assert.equal(metadata.location, "Remote");
    assert.equal(metadata.externalJobId, "12345");

    const fields = await adapter.extractFormFields(page, context);
    assert.ok(fields.some((field) => field.label.includes("Given Name") && field.required));
    assert.ok(fields.some((field) => field.type === "email" && field.label.includes("Email")));
    assert.ok(fields.some((field) => field.type === "phone" && field.label.includes("Mobile Phone")));
    assert.ok(fields.some((field) => field.type === "file" && field.label.includes("Resume")));
    assert.ok(fields.some((field) => field.type === "select" && field.options.includes("Yes")));

    const step = await adapter.getCurrentStep(page, context);
    assert.equal(step.step, "review-before-submit");
  } finally {
    await browser.close();
  }
});

test("Greenhouse adapter uploads files and reports required validation failures", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GreenhouseAdapter();
  const { tempDir, resumePath, coverPath } = createTempDocuments("greenhouse-fixture-");

  try {
    await page.setContent(hostedFixtureHtml);
    const context = createContext();

    const uploadedResume = await adapter.uploadResume(page, resumePath, context);
    const uploadedCover = await adapter.uploadCoverLetter(page, coverPath, context);
    assert.equal(uploadedResume, true);
    assert.equal(uploadedCover, true);

    const errorsBefore = await adapter.collectErrors(page, context);
    assert.ok(errorsBefore.some((error) => error.fieldLabel?.includes("Given Name")));
    assert.ok(errorsBefore.some((error) => error.fieldLabel?.includes("Surname")));

    await page.locator("#first_name").fill("Perry");
    await page.locator("#last_name").fill("Jones");
    await page.locator("#email").fill("perry@example.com");
    await page.locator("#work_auth").selectOption({ label: "Yes" });

    const errorsAfter = await adapter.collectErrors(page, context);
    assert.ok(!errorsAfter.some((error) => error.fieldLabel?.includes("Given Name")));
    assert.ok(!errorsAfter.some((error) => error.fieldLabel?.includes("Surname")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

test("Greenhouse adapter completes a hosted happy path fixture and submits successfully", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  class FixtureGreenhouseAdapter extends GreenhouseAdapter {
    override async openJobPage(targetPage: import("playwright").Page) {
      await targetPage.setContent(hostedHappyPathFixtureHtml, { waitUntil: "domcontentloaded" });
    }
  }
  const adapter = new FixtureGreenhouseAdapter();
  const { tempDir, resumePath, coverPath } = createTempDocuments("greenhouse-flow-");

  try {
    const context = createContext();
    context.profile.autoSubmitConfidenceThreshold = 0.8;
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

    const result = await runAdapterFlow(adapter, page, "https://boards.greenhouse.io/acme/jobs/12345", context);

    assert.equal(result.status, "Applied");
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.equal(result.step, "review-before-submit");
    assert.deepEqual(result.unresolvedFields, []);
    assert.deepEqual(result.errors, []);
    assert.equal(await page.locator("#first_name").inputValue(), "Perry");
    assert.equal(await page.locator("#last_name").inputValue(), "Jones");
    assert.equal(await page.locator("#email").inputValue(), "perry@example.com");
    assert.equal(await page.locator("#work_auth").inputValue(), "Yes");
    assert.equal(await page.locator("#resume").evaluate((el) => (el as HTMLInputElement).files?.length ?? 0), 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

test("Greenhouse adapter safely handles consent checkbox and review checkpoint", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GreenhouseAdapter();
  try {
    await page.setContent(consentFixtureHtml);
    const context = createContext();

    const fields = await adapter.extractFormFields(page, context);
    assert.ok(fields.some((field) => field.type === "checkbox" && field.label.includes("I consent")));
    assert.ok(fields.some((field) => field.type === "textarea" && field.label.includes("Why do you want")));

    const consentField = fields.find((field) => field.type === "checkbox")!;
    const checked = await adapter.fillField(page, consentField, "Yes", context);
    assert.equal(checked, true);
    assert.equal(await page.locator("#consent").isChecked(), true);

    await adapter.reviewBeforeSubmit(page, context);
    const step = await adapter.getCurrentStep(page, context);
    assert.equal(step.step, "review-before-submit");
  } finally {
    await browser.close();
  }
});

test("Greenhouse adapter treats custom gh_jid pages with inline forms as ready-to-fill applications", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GreenhouseAdapter();
  try {
    await page.setContent(customInlineFixtureHtml);
    const context = createContext();

    assert.equal(adapter.canHandle("https://bolt.eu/en/careers/positions/8488707002/?gh_jid=8488707002"), true);

    const metadata = await adapter.extractJobMetadata(
      page,
      "https://bolt.eu/en/careers/positions/8488707002/?gh_jid=8488707002",
      context,
    );
    assert.equal(metadata.title, "Senior Android Engineer");
    assert.equal(metadata.company, "bolt");
    assert.equal(metadata.externalJobId, "8488707002");

    await adapter.clickApply(page, context);
    const fields = await adapter.extractFormFields(page, context);
    assert.ok(fields.some((field) => field.label.includes("First name")));
    assert.ok(fields.some((field) => field.type === "file"));

    const step = await adapter.getCurrentStep(page, context);
    assert.equal(step.step, "review-before-submit");
  } finally {
    await browser.close();
  }
});

test("Greenhouse adapter auto-submits inline custom forms with optional demographic sections", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  class FixtureGreenhouseAdapter extends GreenhouseAdapter {
    override async openJobPage(targetPage: import("playwright").Page) {
      await targetPage.setContent(boltStyleFixtureHtml, { waitUntil: "domcontentloaded" });
    }
  }
  const adapter = new FixtureGreenhouseAdapter();
  const { tempDir, resumePath } = createTempDocuments("greenhouse-bolt-flow-");

  try {
    const context = createContext();
    context.profile.autoSubmitConfidenceThreshold = 0.85;
    context.resume = {
      id: "resume-1",
      kind: "resume",
      fileName: "resume.txt",
      storagePath: resumePath,
      mimeType: "text/plain",
      source: "uploaded",
      createdAt: "",
    };

    const result = await runAdapterFlow(
      adapter,
      page,
      "https://bolt.eu/en/careers/positions/8488707002/?gh_jid=8488707002",
      context,
    );

    assert.equal(result.status, "Applied");
    assert.equal(result.submitAttempted, true);
    assert.equal(result.submitCompleted, true);
    assert.deepEqual(result.unresolvedFields, []);
    assert.deepEqual(result.errors, []);
    assert.ok((result.confidenceScore ?? 0) >= 0.85);
    assert.equal(await page.locator("#first_name").inputValue(), "Perry");
    assert.equal(await page.locator("#last_name").inputValue(), "Jones");
    assert.equal(await page.locator("#gender").inputValue(), "Decline to self-identify");
    assert.equal(await page.locator("input[name='eeo[race]'][value='Decline to self-identify']").isChecked(), true);
    assert.equal(await page.locator("#disability").inputValue(), "I do not want to answer");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await browser.close();
  }
});

const screeningTextareaFixtureHtml = `
<!doctype html>
<html>
  <body style="margin:24px">
    <div id="app_body">
      <header id="header"><span class="company-name">Ghost Co</span></header>
      <h1 class="app-title">Product Engineer</h1>
      <div id="application">
        <div class="field">
          <label for="fit">Why should we hire you?</label>
          <textarea id="fit" name="fit" required rows="5" cols="50"></textarea>
        </div>
      </div>
    </div>
  </body>
</html>
`;

test("Greenhouse adapter fills a categorized required textarea during answerScreeningQuestions", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GreenhouseAdapter();
  try {
    await page.setContent(screeningTextareaFixtureHtml);
    const context = createContext();
    await adapter.answerScreeningQuestions(page, context);
    const value = await page.locator("#fit").inputValue();
    assert.match(value, /good fit|hire|qualified/i);
  } finally {
    await browser.close();
  }
});

test("Greenhouse adapter stops on login-first pages without a guest apply option", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const adapter = new GreenhouseAdapter();
  try {
    const context = createContext();
    const url = `data:text/html,${encodeURIComponent(loginFirstUnsupportedFixtureHtml)}`;

    await assert.rejects(
      () => adapter.openJobPage(page, url, context),
      (error) => {
        assert.equal(error instanceof LoginFirstLayoutUnsupportedError, true);
        assert.match(
          (error as Error).message,
          /SSO login is not supported\. Open a direct guest application URL shaped like https:\/\/boards\.greenhouse\.io\/<company>\/jobs\/<job-id>/i,
        );
        return true;
      },
    );
  } finally {
    await browser.close();
  }
});
