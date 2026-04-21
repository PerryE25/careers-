import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../persistence/json-store.js";
import { AtsDetectionService } from "./ats-detection-service.js";
import { JobSourceImportService } from "./job-source-import-service.js";
function createProfile(store) {
    return store.upsertProfile({
        resumeText: "Resume",
        autofillText: "Autofill",
        autofillFields: {},
        canonicalProfile: {
            personalInfo: { firstName: "Perry", lastName: "Jones", fullName: "Perry Jones" },
            contactInfo: { email: "perry@example.com" },
            locationPreferences: {
                currentLocation: "Chicago, IL",
                preferredLocations: ["Chicago, IL", "Remote"],
                remotePreference: "Remote",
            },
            workAuthorization: { authorizedCountries: ["US"] },
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
        validation: { isValid: true, issues: [] },
        submitMode: "review",
        autoSubmitConfidenceThreshold: 0.85,
    });
}
test("imports markdown job rows into deduplicated queueable targets ordered by location preference", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-source-import-"));
    const uploadsDir = path.join(tempDir, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const markdownPath = path.join(uploadsDir, "2026-usa-swe-new-grad.md");
    fs.writeFileSync(markdownPath, [
        "| Company | Role | Location | Apply |",
        "| --- | --- | --- | --- |",
        "| Acme | Software Engineer, New Grad | Chicago, IL | [Apply](https://jobs.lever.co/acme/123/apply?lever-source=linkedin) |",
        "| Acme | Software Engineer, New Grad | Chicago, IL | [Apply](https://jobs.lever.co/acme/123?utm_source=dup) |",
        "| Beta | Backend Engineer | Remote - US | [Apply](https://boards.greenhouse.io/beta/jobs/456?gh_src=abc) |",
        "| Gamma | Product Marketing Analyst | New York, NY | [Apply](https://boards.greenhouse.io/gamma/jobs/789) |",
        "| Delta | Entry Level Platform Engineer | Austin, TX | [Apply](https://delta.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Platform-Engineer_JR-100) |",
    ].join("\n"), "utf8");
    const store = new JsonStore(path.join(tempDir, "db.json"));
    createProfile(store);
    const service = new JobSourceImportService(store, new AtsDetectionService(), uploadsDir, tempDir);
    try {
        const result = service.importLatestJobSource();
        assert.equal(result.importedCount, 3);
        assert.equal(result.sourceFileName, "2026-usa-swe-new-grad.md");
        assert.equal(result.targets[0]?.company, "Acme");
        assert.equal(result.targets[0]?.provider, "lever");
        assert.equal(result.targets[1]?.company, "Beta");
        assert.equal(result.targets[1]?.provider, "greenhouse");
        assert.equal(result.targets[2]?.company, "Delta");
        assert.equal(result.targets[2]?.provider, "workday");
        assert.ok(result.targets.every((target) => !/marketing/i.test(target.title ?? "")));
        assert.equal(result.targets[0]?.normalizedUrl, "https://jobs.lever.co/acme/123");
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
test("prefers public job-targets.json when it is available", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-source-json-"));
    const uploadsDir = path.join(tempDir, "uploads");
    const publicAutofillDir = path.join(tempDir, "public", "autofill");
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(publicAutofillDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, "older-targets.md"), [
        "| Company | Role | Location | Apply |",
        "| --- | --- | --- | --- |",
        "| Older | Software Engineer | Remote | [Apply](https://jobs.lever.co/older/123) |",
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(publicAutofillDir, "job-targets.json"), JSON.stringify([
        {
            company: "Figma",
            roleTitle: "Software Engineer, New Grad",
            location: "Remote - US",
            applyUrl: "https://boards.greenhouse.io/figma/jobs/1234567",
        },
        {
            company: "Ramp",
            title: "Backend Engineer",
            location: "New York, NY",
            sourceUrl: "https://jobs.lever.co/ramp/abcdef12-3456-7890-abcd-ef1234567890",
        },
    ], null, 2), "utf8");
    const store = new JsonStore(path.join(tempDir, "db.json"));
    createProfile(store);
    const service = new JobSourceImportService(store, new AtsDetectionService(), uploadsDir, tempDir);
    try {
        const result = service.importLatestJobSource();
        assert.equal(result.sourceFileName, "job-targets.json");
        assert.equal(result.importedCount, 2);
        assert.deepEqual(result.targets.map((target) => target.company), ["Figma", "Ramp"]);
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
test("listJobTargets reflects the current explicit source instead of stale stored jobs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-source-current-source-"));
    const uploadsDir = path.join(tempDir, "uploads");
    const publicAutofillDir = path.join(tempDir, "public", "autofill");
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(publicAutofillDir, { recursive: true });
    fs.writeFileSync(path.join(publicAutofillDir, "job-targets.json"), JSON.stringify([
        {
            company: "Saronic",
            roleTitle: "Software Engineer",
            location: "Austin, TX",
            applyUrl: "https://jobs.lever.co/saronic/ae3473ef-dba6-432a-ad0b-1d0a368e40c6",
        },
        {
            company: "Bolt",
            roleTitle: "Senior Android Engineer",
            location: "Bucharest, Romania",
            applyUrl: "https://bolt.eu/en/careers/positions/8488707002/?gh_jid=8488707002",
        },
    ], null, 2), "utf8");
    const store = new JsonStore(path.join(tempDir, "db.json"));
    createProfile(store);
    store.upsertJob({ normalizedUrl: "https://boards.greenhouse.io/figma/jobs/1234567" }, {
        provider: "greenhouse",
        sourceUrl: "https://boards.greenhouse.io/figma/jobs/1234567",
        company: "Figma",
        title: "Software Engineer",
        location: "Remote",
        externalJobId: "1234567",
    });
    const service = new JobSourceImportService(store, new AtsDetectionService(), uploadsDir, tempDir);
    try {
        const targets = service.listJobTargets();
        assert.deepEqual(targets.map((target) => target.company), ["Saronic", "Bolt"]);
        assert.deepEqual(targets.map((target) => target.provider), ["lever", "greenhouse"]);
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
