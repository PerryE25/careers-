import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "playwright";
import { ApplicationService } from "./application-service.js";
import { JsonStore } from "../persistence/json-store.js";

function createProfile(store: JsonStore) {
  const profile = store.upsertProfile({
    resumeText: "Resume",
    autofillText: "First Name: Perry\nLast Name: Jones\nEmail: perry@example.com",
    autofillFields: {
      first_name: "Perry",
      last_name: "Jones",
      email: "perry@example.com",
    },
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
      jobPreferences: { desiredTitles: ["Data Engineer"], employmentTypes: [], workplaceTypes: [], industries: [] },
      salaryPreferences: {},
      relocationPreferences: { preferredLocations: [] },
      availability: {},
      technicalBackground: [],
      hasExplicitNoWorkExperience: false,
      sourceNotes: [],
    },
    validation: { isValid: true, issues: [] },
    submitMode: "review",
    autoSubmitConfidenceThreshold: 0.85,
  });

  return profile;
}

function createStoreFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "application-service-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  const profile = createProfile(store);
  store.addDocument({
    kind: "resume",
    fileName: "resume.pdf",
    storagePath: "C:\\docs\\resume.pdf",
    mimeType: "application/pdf",
    source: "uploaded",
    profileId: profile.id,
  });
  return { tempDir, store, profile };
}

function createApplicationSeed(overrides: Record<string, unknown> = {}) {
  return {
    companyName: undefined,
    roleTitle: undefined,
    atsProvider: undefined,
    sourceJobUrl: undefined,
    canonicalJobUrl: undefined,
    location: undefined,
    salary: undefined,
    applicationDate: new Date().toISOString(),
    lastCompletedStep: undefined,
    unresolvedRequiredFields: [],
    screenshotPaths: [],
    failureScreenshotPaths: [],
    failureLogIds: [],
    resumePath: undefined,
    coverLetterPath: undefined,
    duplicate: false,
    ...overrides,
  };
}

function createService(
  store: JsonStore,
  overrides: {
    detector?: { detect(jobUrl: string): { provider: "lever" | "greenhouse" | "workday"; confidence: number; reason: string; canonicalUrl: string; normalizedUrl: string; method: "url-pattern" } };
    registry?: {
      resolve(url: string):
        | {
            openJobPage(page: Page): Promise<void>;
            extractJobMetadata(page: Page): Promise<{ company?: string; title?: string; location?: string; externalJobId?: string }>;
            fillApplication?(page: Page): Promise<unknown>;
          }
        | undefined;
    };
    documents?: {
      selectResume(options: { profileId: string }): { id: string } | undefined;
      generateCoverLetter(): {
        id: string;
        kind: "cover-letter";
        fileName: string;
        filePath: string;
        mimeType: string;
        source: "generated";
      };
    };
  } = {},
) {
  const detector = overrides.detector ?? {
    detect(jobUrl: string) {
      return {
        provider: "workday" as const,
        confidence: 0.91,
        reason: "test",
        canonicalUrl: jobUrl,
        normalizedUrl: jobUrl,
        method: "url-pattern" as const,
      };
    },
  };
  const registry = overrides.registry ?? {
    resolve() {
      return undefined;
    },
  };
  const documents = overrides.documents ?? {
    selectResume() {
      return {
        id: "resume-1",
        kind: "resume",
        fileName: "resume.pdf",
        filePath: "C:\\docs\\resume.pdf",
        mimeType: "application/pdf",
        source: "uploaded",
      };
    },
    generateCoverLetter() {
      return {
        id: "cover-letter-1",
        kind: "cover-letter",
        fileName: "cover-letter.txt",
        filePath: "C:\\docs\\cover-letter.txt",
        mimeType: "text/plain",
        source: "generated",
      };
    },
  };

  return new ApplicationService(
    store,
    detector as never,
    registry as never,
    documents as never,
  );
}

test("blocks duplicate automation when canonical ATS URL already exists", async () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const canonicalUrl = "https://acme.wd5.myworkdayjobs.com/en-US/job/Remote/Data-Engineer_JR-100";
    const job = store.upsertJob(
      { normalizedUrl: canonicalUrl },
      {
        provider: "workday",
        sourceUrl: canonicalUrl,
        company: "Acme",
        title: "Data Engineer",
        location: "Remote",
        externalJobId: "JR-100",
      },
    );
    const existing = store.createApplication({
      ...createApplicationSeed({
        companyName: "Acme",
        roleTitle: "Data Engineer",
        atsProvider: "workday",
        sourceJobUrl: canonicalUrl,
        canonicalJobUrl: canonicalUrl,
        location: "Remote",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Applied",
      submitMode: "review",
      confidenceScore: 0.95,
      notes: "Existing application",
    });

    const service = createService(store, {
      detector: {
        detect() {
          return {
            provider: "workday",
            confidence: 0.88,
            reason: "matched workday",
            canonicalUrl,
            normalizedUrl: canonicalUrl,
            method: "url-pattern",
          };
        },
      },
      registry: {
        resolve() {
          return {
            async openJobPage() {
              throw new Error("should not open browser for URL duplicate");
            },
            async extractJobMetadata() {
              return {};
            },
          };
        },
      },
    });

    const result = await service.automate(canonicalUrl);

    assert.equal(result.duplicate, true);
    assert.equal(result.blocked, true);
    assert.equal(result.application.status, "Duplicate");
    assert.equal(result.application.duplicateOfApplicationId, existing.id);
    assert.ok(result.duplicateMatch);
    assert.deepEqual(
      result.duplicateMatch?.reasons.map((reason: { code: string }) => reason.code),
      ["provider", "canonical-url"],
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("allows unique automation when provider and normalized company/title match but external job ids differ", async () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const existingUrl = "https://boards.greenhouse.io/acme/jobs/123";
    const incomingUrl = "https://boards.greenhouse.io/acme/jobs/456";
    const job = store.upsertJob(
      { normalizedUrl: existingUrl },
      {
        provider: "greenhouse",
        sourceUrl: existingUrl,
        company: "Acme, Inc.",
        title: "Senior Data Engineer",
        location: "Remote",
        externalJobId: "123",
      },
    );
    const existing = store.createApplication({
      ...createApplicationSeed({
        companyName: "Acme, Inc.",
        roleTitle: "Senior Data Engineer",
        atsProvider: "greenhouse",
        sourceJobUrl: existingUrl,
        canonicalJobUrl: existingUrl,
        location: "Remote",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Needs Review",
      submitMode: "review",
      confidenceScore: 0.67,
      notes: "Existing greenhouse application",
    });

    const service = createService(store, {
      detector: {
        detect() {
          return {
            provider: "greenhouse",
            confidence: 0.9,
            reason: "matched greenhouse",
            canonicalUrl: incomingUrl,
            normalizedUrl: incomingUrl,
            method: "url-pattern",
          };
        },
      },
      registry: {
        resolve() {
          return {
            async openJobPage(page: Page) {
              await page.setContent("<html><body><h1>Senior Data Engineer</h1></body></html>");
            },
            async extractJobMetadata() {
              return {
                company: "ACME Inc",
                title: "Senior Data Engineer!!",
                location: "Remote",
                externalJobId: "456",
              };
            },
            async fillApplication() {
              return {
                status: "Applied",
                confidenceScore: 0.92,
                submitAttempted: true,
                submitCompleted: true,
                step: "review-before-submit",
                unresolvedFields: [],
                errors: [],
                statusUpdates: [],
                reviewSummary: {
                  mode: "auto",
                  confidenceScore: 0.92,
                  confidenceThreshold: 0.85,
                  eligibleForAutoSubmit: true,
                  shouldAttemptSubmit: true,
                  submitAttempted: true,
                  submitCompleted: true,
                  unresolvedRequiredFields: [],
                  validationErrors: [],
                  blockingReasons: [],
                  recommendedStatus: "Applied",
                  lastCompletedStep: "review-before-submit",
                },
              };
            },
          };
        },
      },
    });

    const result = await service.automate(incomingUrl);

    assert.equal(result.duplicate, false);
    assert.equal(result.blocked, false);
    assert.equal(result.application.status, "Applied");
    assert.equal(result.duplicateMatch, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("normalized duplicate matching ignores company suffixes and punctuation", () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const existingUrl = "https://jobs.lever.co/acme/123";
    const job = store.upsertJob(
      { normalizedUrl: existingUrl },
      {
        provider: "lever",
        sourceUrl: existingUrl,
        company: "The Acme Company, Inc.",
        title: "Senior Platform Engineer",
        location: "Remote",
        externalJobId: "123",
      },
    );
    store.createApplication({
      ...createApplicationSeed({
        companyName: "The Acme Company, Inc.",
        roleTitle: "Senior Platform Engineer",
        atsProvider: "lever",
        sourceJobUrl: existingUrl,
        canonicalJobUrl: existingUrl,
        location: "Remote",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Applied",
      submitMode: "review",
      confidenceScore: 0.9,
      notes: "Existing lever application",
    });

    const match = store.findDuplicateApplication({
      provider: "lever",
      normalizedUrl: "https://jobs.lever.co/acme/456",
      company: "Acme Co",
      title: "Senior Platform Engineer!!!",
    });

    assert.ok(match);
    assert.deepEqual(
      match?.reasons.map((reason) => reason.code),
      ["provider", "company-name", "job-title"],
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("duplicate matching ignores Needs Review applications so the same job can be automated again", () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const existingUrl = "https://jobs.lever.co/saronic/role-1";
    const job = store.upsertJob(
      { normalizedUrl: existingUrl },
      {
        provider: "lever",
        sourceUrl: existingUrl,
        company: "Saronic",
        title: "Engineer",
        location: "Austin",
      },
    );
    store.createApplication({
      ...createApplicationSeed({
        companyName: "Saronic",
        roleTitle: "Engineer",
        atsProvider: "lever",
        sourceJobUrl: existingUrl,
        canonicalJobUrl: existingUrl,
        location: "Austin",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Needs Review",
      submitMode: "review",
      confidenceScore: 0.6,
      notes: "Gated before submit",
    });

    const match = store.findDuplicateApplication({
      provider: "lever",
      normalizedUrl: existingUrl,
    });

    assert.equal(match, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("normalized duplicate matching does not collapse postings with different external job ids", () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const existingUrl = "https://jobs.lever.co/acme/123";
    const job = store.upsertJob(
      { normalizedUrl: existingUrl },
      {
        provider: "lever",
        sourceUrl: existingUrl,
        company: "Acme",
        title: "Software Engineer",
        location: "Remote",
        externalJobId: "123",
      },
    );
    store.createApplication({
      ...createApplicationSeed({
        companyName: "Acme",
        roleTitle: "Software Engineer",
        atsProvider: "lever",
        sourceJobUrl: existingUrl,
        canonicalJobUrl: existingUrl,
        location: "Remote",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Applied",
      submitMode: "review",
      confidenceScore: 0.9,
      notes: "Existing lever application",
    });

    const match = store.findDuplicateApplication({
      provider: "lever",
      normalizedUrl: "https://jobs.lever.co/acme/456",
      company: "Acme",
      title: "Software Engineer",
      externalJobId: "456",
    });

    assert.equal(match, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("duplicate matching does not cross ATS providers when company and title are the same", () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const existingUrl = "https://jobs.lever.co/acme/123";
    const job = store.upsertJob(
      { normalizedUrl: existingUrl },
      {
        provider: "lever",
        sourceUrl: existingUrl,
        company: "Acme",
        title: "Data Engineer",
        location: "Remote",
        externalJobId: "123",
      },
    );
    store.createApplication({
      ...createApplicationSeed({
        companyName: "Acme",
        roleTitle: "Data Engineer",
        atsProvider: "lever",
        sourceJobUrl: existingUrl,
        canonicalJobUrl: existingUrl,
        location: "Remote",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Applied",
      submitMode: "review",
      confidenceScore: 0.88,
      notes: "Existing Lever application",
    });

    const match = store.findDuplicateApplication({
      provider: "greenhouse",
      normalizedUrl: "https://boards.greenhouse.io/acme/jobs/123",
      company: "Acme",
      title: "Data Engineer",
    });

    assert.equal(match, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("tracker list returns enriched application fields and resolved failure logs", () => {
  const { tempDir, store, profile } = createStoreFixture();
  try {
    const canonicalUrl = "https://jobs.lever.co/acme/789";
    const job = store.upsertJob(
      { normalizedUrl: canonicalUrl },
      {
        provider: "lever",
        sourceUrl: canonicalUrl,
        company: "Acme",
        title: "Staff Engineer",
        location: "Chicago, IL",
        externalJobId: "789",
      },
    );
    const application = store.createApplication({
      ...createApplicationSeed({
        companyName: "Acme",
        roleTitle: "Staff Engineer",
        atsProvider: "lever",
        sourceJobUrl: canonicalUrl,
        canonicalJobUrl: canonicalUrl,
        location: "Chicago, IL",
        salary: "$180,000 - $210,000 / year",
        lastCompletedStep: "review-before-submit",
        unresolvedRequiredFields: ["Portfolio URL"],
        screenshotPaths: ["C:\\shots\\run-1-review.png"],
        failureScreenshotPaths: ["C:\\shots\\run-1-error.png"],
        resumePath: "C:\\docs\\resume.pdf",
        coverLetterPath: "C:\\docs\\cover.txt",
      }),
      jobId: job.id,
      profileId: profile.id,
      status: "Failed",
      submitMode: "review",
      confidenceScore: 0.72,
      notes: "Validation failed",
      duplicate: false,
    });
    const run = store.createRun({
      applicationId: application.id,
      provider: "lever",
      status: "Failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      confidenceScore: 0.72,
      submitAttempted: false,
      submitCompleted: false,
      lastCompletedStep: "review-before-submit",
      unresolvedRequiredFields: ["Portfolio URL"],
      screenshotPaths: ["C:\\shots\\run-1-review.png"],
      errorMessage: "Validation failed",
    });
    store.updateApplication(application.id, {
      lastRunId: run.id,
      failureLogIds: [
        store.addEvent({
          runId: run.id,
          level: "error",
          message: "Validation failed",
        }).id,
      ],
    });

    const [item] = store.listApplications();

    assert.equal(item.application.companyName, "Acme");
    assert.equal(item.application.roleTitle, "Staff Engineer");
    assert.equal(item.application.salary, "$180,000 - $210,000 / year");
    assert.equal(item.application.resumePath, "C:\\docs\\resume.pdf");
    assert.equal(item.application.coverLetterPath, "C:\\docs\\cover.txt");
    assert.equal(item.application.lastCompletedStep, "review-before-submit");
    assert.deepEqual(item.application.unresolvedRequiredFields, ["Portfolio URL"]);
    assert.deepEqual(item.application.failureScreenshotPaths, ["C:\\shots\\run-1-error.png"]);
    assert.equal(item.failureLogs?.[0]?.message, "Validation failed");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("startBatch rejects when saved profile text is incomplete", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "application-batch-missing-profile-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  store.upsertProfile({
    resumeText: "",
    autofillText: "",
    autofillFields: {},
    canonicalProfile: {
      personalInfo: {},
      contactInfo: {},
      locationPreferences: { preferredLocations: [] },
      workAuthorization: { authorizedCountries: [] },
      education: [],
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
      prewrittenAnswers: [],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: [], employmentTypes: [], workplaceTypes: [], industries: [] },
      salaryPreferences: {},
      relocationPreferences: { preferredLocations: [] },
      availability: {},
      technicalBackground: [],
      hasExplicitNoWorkExperience: false,
      sourceNotes: [],
    },
    validation: { isValid: true, issues: [] },
    submitMode: "review",
    autoSubmitConfidenceThreshold: 0.85,
  });

  const service = createService(store);

  try {
    assert.throws(
      () => service.startBatch(["https://jobs.lever.co/acme/123"]),
      /saved master resume text/i,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("startBatch rejects when saved autofill text is malformed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "application-batch-malformed-profile-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  const profile = store.upsertProfile({
    resumeText: "Education\nState University | BS | CS | 2026",
    autofillText: "Email: not-an-email",
    autofillFields: {},
    canonicalProfile: {
      personalInfo: {},
      contactInfo: {},
      locationPreferences: { preferredLocations: [] },
      workAuthorization: { authorizedCountries: [] },
      education: [],
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
      prewrittenAnswers: [],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: [], employmentTypes: [], workplaceTypes: [], industries: [] },
      salaryPreferences: {},
      relocationPreferences: { preferredLocations: [] },
      availability: {},
      technicalBackground: [],
      hasExplicitNoWorkExperience: false,
      sourceNotes: [],
    },
    validation: { isValid: false, issues: [{ field: "contactInfo.email", severity: "error", message: "Email address appears malformed." }] },
    submitMode: "review",
    autoSubmitConfidenceThreshold: 0.85,
  });
  store.addDocument({
    kind: "resume",
    fileName: "resume.pdf",
    storagePath: "C:\\docs\\resume.pdf",
    mimeType: "application/pdf",
    source: "uploaded",
    profileId: profile.id,
  });

  const service = createService(store, {
    documents: {
      selectResume() {
        return { id: "resume-1" };
      },
      generateCoverLetter() {
        return {
          id: "cover-letter-1",
          kind: "cover-letter",
          fileName: "cover-letter.txt",
          filePath: "C:\\docs\\cover-letter.txt",
          mimeType: "text/plain",
          source: "generated",
        };
      },
    },
  });

  try {
    assert.throws(
      () => service.startBatch(["https://jobs.lever.co/acme/123"]),
      /fix your saved profile source/i,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("startBatch accepts markdown mailto email values by refreshing the saved profile", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "application-batch-markdown-email-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  const profile = store.upsertProfile({
    resumeText: "Education\nState University | BS | CS | 2026",
    autofillText:
      "First Name: Perry\nLast Name: Jones\nEmail: [perry@example.com](mailto:perry@example.com)\nLinkedIn: [Profile](https://linkedin.com/in/perry)",
    autofillFields: {},
    canonicalProfile: {
      personalInfo: {},
      contactInfo: { email: "[perry@example.com](mailto:perry@example.com)" },
      locationPreferences: { preferredLocations: [] },
      workAuthorization: { authorizedCountries: [] },
      education: [],
      technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [],
      prewrittenAnswers: [],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: ["Software Engineer"], employmentTypes: [], workplaceTypes: [], industries: [] },
      salaryPreferences: {},
      relocationPreferences: { preferredLocations: [] },
      availability: {},
      technicalBackground: [],
      hasExplicitNoWorkExperience: false,
      sourceNotes: [],
    },
    validation: { isValid: false, issues: [{ field: "contactInfo.email", severity: "error", message: "Email address appears malformed." }] },
    submitMode: "review",
    autoSubmitConfidenceThreshold: 0.85,
  });
  store.addDocument({
    kind: "resume",
    fileName: "resume.pdf",
    storagePath: "C:\\docs\\resume.pdf",
    mimeType: "application/pdf",
    source: "uploaded",
    profileId: profile.id,
  });

  const service = createService(store, {
    documents: {
      selectResume() {
        return { id: "resume-1" };
      },
      generateCoverLetter() {
        return {
          id: "cover-letter-1",
          kind: "cover-letter",
          fileName: "cover-letter.txt",
          filePath: "C:\\docs\\cover-letter.txt",
          mimeType: "text/plain",
          source: "generated",
        };
      },
    },
  });

  try {
    const batch = service.startBatch(["https://jobs.lever.co/acme/123"]);
    assert.equal(batch.total, 1);
    assert.equal(batch.status, "running");
    assert.equal(store.getProfile()?.canonicalProfile.contactInfo.email, "perry@example.com");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("startBatch reuses the active batch while automation is already running", async () => {
  const { tempDir, store } = createStoreFixture();
  store.addDocument({
    kind: "resume",
    fileName: "resume.pdf",
    storagePath: "C:\\docs\\resume.pdf",
    mimeType: "application/pdf",
    source: "uploaded",
    profileId: store.getProfile()!.id,
  });

  const service = createService(store, {
    documents: {
      selectResume() {
        return { id: "resume-1" };
      },
      generateCoverLetter() {
        return {
          id: "cover-letter-1",
          kind: "cover-letter",
          fileName: "cover-letter.txt",
          filePath: "C:\\docs\\cover-letter.txt",
          mimeType: "text/plain",
          source: "generated",
        };
      },
    },
  });
  const originalAutomate = service.automate.bind(service);
  service.automate = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      duplicate: false,
      blocked: false,
      application: undefined,
      duplicateMatch: undefined,
    } as never;
  }) as typeof service.automate;

  try {
    const first = service.startBatch(["https://jobs.lever.co/acme/123"]);
    const second = service.startBatch(["https://jobs.lever.co/acme/456"]);

    assert.equal(second.id, first.id);
    assert.equal(second.status, "running");
    await new Promise((resolve) => setTimeout(resolve, 80));
  } finally {
    service.automate = originalAutomate;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
