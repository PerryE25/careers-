import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProfileReadiness } from "./profile-readiness.js";
function createProfile(overrides = {}) {
    return {
        id: "profile-1",
        resumeText: "Education\nUniversity of Illinois | BS | Computer Science | 2026",
        autofillText: "First Name: Perry\nLast Name: Jones\nEmail: perry@example.com\nNo Work Experience: Yes",
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
            jobPreferences: { desiredTitles: ["Software Engineer"], employmentTypes: [], workplaceTypes: [], industries: [] },
            salaryPreferences: {},
            relocationPreferences: { preferredLocations: [] },
            availability: {},
            technicalBackground: [],
            hasExplicitNoWorkExperience: true,
            sourceNotes: [],
        },
        validation: { isValid: true, issues: [] },
        submitMode: "review",
        autoSubmitConfidenceThreshold: 0.85,
        createdAt: "",
        updatedAt: "",
        ...overrides,
    };
}
test("reports ready when saved resume text and autofill text are both present", () => {
    const readiness = evaluateProfileReadiness(createProfile());
    assert.equal(readiness.ready, true);
    assert.equal(readiness.hasResumeText, true);
    assert.equal(readiness.hasAutofillText, true);
    assert.equal(readiness.usesAutofillAsSourceOfTruth, true);
    assert.equal(readiness.usesResumeTextForBackground, true);
    assert.equal(readiness.explicitNoWorkExperience, true);
});
test("reports actionable issues when saved profile text is missing or malformed", () => {
    const missingReadiness = evaluateProfileReadiness(createProfile({
        resumeText: "",
        autofillText: "First Name: Perry\nLast Name: Jones\nEmail: perry@example.com",
    }));
    assert.equal(missingReadiness.ready, false);
    assert.ok(missingReadiness.issues.some((issue) => issue.code === "missing-resume-text"));
    assert.match(missingReadiness.issues[0]?.actionableMessage ?? "", /add your saved master resume text/i);
    const malformedReadiness = evaluateProfileReadiness(createProfile({
        resumeText: "Education\nState University | BS | CS | 2026",
        autofillText: "Email: not-an-email",
    }));
    assert.equal(malformedReadiness.ready, false);
    assert.ok(malformedReadiness.issues.some((issue) => issue.code === "malformed-profile"));
});
test("accepts markdown mailto email values in saved autofill text", () => {
    const readiness = evaluateProfileReadiness(createProfile({
        autofillText: "First Name: Perry\nLast Name: Jones\nEmail: [perry@example.com](mailto:perry@example.com)\nLinkedIn: [Profile](https://linkedin.com/in/perry)",
        canonicalProfile: {
            personalInfo: { firstName: "Perry", lastName: "Jones", fullName: "Perry Jones" },
            contactInfo: { email: "[perry@example.com](mailto:perry@example.com)" },
            locationPreferences: { preferredLocations: [] },
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
            hasExplicitNoWorkExperience: true,
            sourceNotes: [],
        },
        validation: {
            isValid: false,
            issues: [{ field: "contactInfo.email", severity: "error", message: "Email address appears malformed." }],
        },
    }));
    assert.equal(readiness.ready, true);
    assert.equal(readiness.issues.length, 0);
});
