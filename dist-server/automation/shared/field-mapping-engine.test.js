import test from "node:test";
import assert from "node:assert/strict";
import { fieldMappingThresholds, mapFieldToProfile, normalizeFieldLabel, summarizeMappingConfidence, } from "./field-mapping-engine.js";
const profile = {
    id: "profile-1",
    resumeText: "",
    autofillText: "",
    autofillFields: {
        first_name: "Perry",
        last_name: "Jones",
        email: "perry@example.com",
        phone: "555-111-2222",
        requires_sponsorship: "No",
        salary_target: "$140,000",
        availability_start_date: "2026-05-01",
    },
    canonicalProfile: {
        personalInfo: { firstName: "Perry", lastName: "Jones", fullName: "Perry Jones" },
        contactInfo: { email: "perry@example.com", phone: "555-111-2222", linkedin: "https://linkedin.com/in/perry" },
        locationPreferences: { currentLocation: "Chicago, IL", preferredLocations: [], remotePreference: "Remote" },
        workAuthorization: { workAuthorizationStatus: "Authorized", requiresSponsorship: false, authorizedCountries: ["US"] },
        education: [],
        technicalSkills: { languages: [], frameworks: [], tools: [], cloud: [], databases: [], other: [], raw: [] },
        projects: [],
        prewrittenAnswers: [
            {
                prompt: "Why do you want to work here?",
                answer: "I am excited about the role because it aligns with my background and the company's mission.",
                length: "long",
                tags: ["why", "work", "here"],
            },
        ],
        demographicAnswers: {},
        jobPreferences: { desiredTitles: ["Data Engineer"], employmentTypes: ["Full-time"], workplaceTypes: ["Remote"], industries: [] },
        salaryPreferences: { targetBase: "$140,000", minimumBase: "$125,000", currency: "USD" },
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
function field(overrides) {
    return {
        label: "unknown",
        type: "text",
        required: false,
        options: [],
        domLocator: {},
        ...overrides,
    };
}
test("normalizes common label variants", () => {
    assert.equal(normalizeFieldLabel("Legal First Name"), "legal first name");
    assert.equal(normalizeFieldLabel("Phone / Mobile"), "phone mobile");
    assert.equal(normalizeFieldLabel("Earliest Start Date"), "earliest start date");
});
test("maps canonical contact fields with high confidence", () => {
    const decision = mapFieldToProfile(profile, field({ label: "Given Name", type: "text", required: true }));
    assert.equal(decision.status, "resolved");
    assert.equal(decision.answer, "Perry");
    assert.ok(decision.confidence >= fieldMappingThresholds.lowConfidence);
});
test("maps consent-style checkboxes safely", () => {
    const decision = mapFieldToProfile(profile, field({
        label: "I consent to the processing of my personal data under the privacy policy",
        type: "checkbox",
        required: true,
        options: ["Yes", "No"],
        section: "Consent",
    }));
    assert.equal(decision.status, "resolved");
    assert.equal(decision.answer, "Yes");
    assert.ok(decision.confidence >= fieldMappingThresholds.lowConfidence);
});
test("maps sponsorship prompts without guessing", () => {
    const decision = mapFieldToProfile(profile, field({
        label: "Will you now or in the future require sponsorship?",
        type: "radio",
        options: ["Yes", "No"],
    }));
    assert.equal(decision.status, "resolved");
    assert.equal(decision.answer, "No");
});
test("maps matching textarea prompts to saved long-form answers", () => {
    const decision = mapFieldToProfile(profile, field({
        label: "Why do you want to work here?",
        type: "textarea",
        required: true,
    }));
    assert.equal(decision.status, "resolved");
    assert.match(decision.answer ?? "", /aligns with my background/i);
    assert.ok(decision.confidence >= fieldMappingThresholds.lowConfidence);
});
test("marks ambiguous screening questions unresolved when no confident answer exists", () => {
    const decision = mapFieldToProfile(profile, field({
        label: "Describe your most meaningful internship experience",
        type: "textarea",
        required: true,
    }));
    assert.equal(decision.status, "unresolved");
    assert.equal(decision.answer, undefined);
    assert.ok(decision.confidence < fieldMappingThresholds.lowConfidence);
});
test("maps demographic questions to a safe opt-out answer when no explicit answer is saved", () => {
    const decision = mapFieldToProfile(profile, field({
        label: "Gender",
        section: "Fill in our Demographic Survey",
        type: "select",
        options: ["Select ...", "Male", "Female", "Decline to self-identify"],
        domLocator: {
            name: "eeo[gender]",
            selector: "[name='eeo[gender]']",
        },
    }));
    assert.equal(decision.status, "resolved");
    assert.equal(decision.answer, "Decline to self-identify");
    assert.ok(decision.confidence >= fieldMappingThresholds.lowConfidence);
});
test("confidence summary does not collapse when only optional extras remain unresolved", () => {
    const resolvedRequired = mapFieldToProfile(profile, field({ label: "First Name", required: true }));
    const resolvedEmail = mapFieldToProfile(profile, field({ label: "Email", type: "email", required: true }));
    const unresolvedOptional = mapFieldToProfile(profile, field({
        label: "Do you need special assistance due to disability?",
        section: "Fill in our Demographic Survey",
        type: "text",
        required: false,
    }));
    const optionalDemographic = mapFieldToProfile(profile, field({
        label: "Veteran status",
        section: "Fill in our Demographic Survey",
        type: "select",
        options: [
            "Select ...",
            "I identify as one or more of the classifications of protected veteran listed above",
            "I am not a protected veteran",
            "I decline to self-identify for protected veteran status",
        ],
        domLocator: {
            name: "eeo[veteran]",
            selector: "[name='eeo[veteran]']",
        },
    }));
    const confidence = summarizeMappingConfidence([
        resolvedRequired,
        resolvedEmail,
        unresolvedOptional,
        optionalDemographic,
    ]);
    assert.equal(resolvedRequired.status, "resolved");
    assert.equal(resolvedEmail.status, "resolved");
    assert.equal(unresolvedOptional.status, "unresolved");
    assert.equal(optionalDemographic.status, "resolved");
    assert.ok(confidence >= 0.85);
});
test("fills disability signature dates with the current date", () => {
    const decision = mapFieldToProfile(profile, field({
        label: "Date",
        placeholder: "MM/DD/YYYY",
        type: "text",
        domLocator: {
            name: "eeo[disabilitySignatureDate]",
            selector: "[name='eeo[disabilitySignatureDate]']",
        },
    }));
    assert.equal(decision.status, "resolved");
    assert.match(decision.answer ?? "", /^\d{2}\/\d{2}\/\d{4}$/);
    assert.ok(decision.confidence >= fieldMappingThresholds.lowConfidence);
});
