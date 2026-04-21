import test from "node:test";
import assert from "node:assert/strict";
import { ScreeningAnswerService } from "./screening-answer-service.js";
import type { Profile } from "../domain/models.js";

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
      website: "https://portfolio.example.com",
    },
    locationPreferences: { currentLocation: "Chicago, IL", preferredLocations: ["Remote"], remotePreference: "Remote" },
    workAuthorization: { workAuthorizationStatus: "Yes", requiresSponsorship: false, authorizedCountries: ["US"] },
    education: [
      { school: "State University", degree: "BS", fieldOfStudy: "Computer Science", graduationDate: "2024" },
    ],
    technicalSkills: {
      languages: ["TypeScript", "Python"],
      frameworks: ["React", "Node.js"],
      tools: ["Git", "Docker"],
      cloud: ["AWS"],
      databases: ["PostgreSQL"],
      other: [],
      raw: [],
    },
    projects: [
      {
        name: "CareerCopilot",
        summary: "building an automation workflow for job applications",
        technologies: ["TypeScript", "Playwright", "Node.js"],
        links: [],
      },
    ],
    prewrittenAnswers: [
      {
        prompt: "Why are you interested in this company?",
        answer: "I am interested in the company because the mission and engineering work are closely aligned with the kind of impact I want to have.",
        length: "long",
        tags: ["why", "company"],
      },
      {
        prompt: "Why do you want to work here?",
        answer: "The mission is compelling and the role aligns closely with my background.",
        length: "short",
        tags: ["why", "work", "here"],
      },
    ],
    demographicAnswers: {},
    jobPreferences: {
      desiredTitles: ["Software Engineer"],
      employmentTypes: ["Full-time"],
      workplaceTypes: ["Remote"],
      industries: ["Software"],
    },
    salaryPreferences: { minimumBase: "$120,000", targetBase: "$140,000", currency: "USD" },
    relocationPreferences: { openToRelocate: false, preferredLocations: [] },
    availability: { startDate: "2026-05-01", noticePeriod: "2 weeks", availableImmediately: false },
    technicalBackground: ["TypeScript", "Node.js", "automation workflows"],
    hasExplicitNoWorkExperience: true,
    sourceNotes: [],
  },
  validation: { isValid: true, issues: [] },
  submitMode: "review",
  autoSubmitConfidenceThreshold: 0.85,
  createdAt: "",
  updatedAt: "",
};

test("uses exact saved answers when available", () => {
  const service = new ScreeningAnswerService(profile);
  const result = service.answerQuestion("Why do you want to work here?", "short");
  assert.equal(result.source, "saved");
  assert.equal(result.answer, "The mission is compelling and the role aligns closely with my background.");
});

test("generates safe role interest answers with company and role interpolation", () => {
  const service = new ScreeningAnswerService(profile);
  const result = service.answerQuestion("What interests you about this position?", "long", {
    companyName: "Acme",
    roleTitle: "Senior Software Engineer",
  });
  assert.equal(result.source, "generated");
  assert.match(result.answer ?? "", /Senior Software Engineer/);
  assert.ok((result.answer ?? "").length > 40);
});

test("returns project answers from saved project data", () => {
  const service = new ScreeningAnswerService(profile);
  const result = service.answerQuestion("Describe a technical project you are proud of.", "long");
  assert.equal(result.category, "technical-project");
  assert.match(result.answer ?? "", /CareerCopilot/);
  assert.match(result.answer ?? "", /Playwright/);
});

test("returns preference and compliance answers from saved fields", () => {
  const service = new ScreeningAnswerService(profile);
  assert.equal(
    service.answerQuestion("Preferred programming language", "short").answer,
    "TypeScript",
  );
  assert.equal(
    service.answerQuestion("Will you require sponsorship now or in the future?", "short").answer,
    "No",
  );
  assert.equal(
    service.answerQuestion("Earliest start date", "short").answer,
    "2026-05-01",
  );
  assert.equal(
    service.answerQuestion("Salary expectations", "short").answer,
    "$140,000",
  );
});

test("does not fabricate unsupported ambiguous prompts", () => {
  const service = new ScreeningAnswerService(profile);
  const result = service.answerQuestion("Describe your previous internship in detail.", "long");
  assert.equal(result.answer, undefined);
  assert.equal(result.source, "none");
  assert.ok(result.confidence < 0.5);
});
