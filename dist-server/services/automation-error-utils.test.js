import test from "node:test";
import assert from "node:assert/strict";
import { classifyReviewSummaryErrors, classifyThrownAutomationError, duplicateDetectedError, } from "./automation-error-utils.js";
test("classifies unresolved required fields and validation failures from review summaries", () => {
    const errors = classifyReviewSummaryErrors({
        summary: {
            mode: "auto",
            confidenceScore: 0.62,
            confidenceThreshold: 0.85,
            eligibleForAutoSubmit: false,
            shouldAttemptSubmit: false,
            submitAttempted: false,
            submitCompleted: false,
            unresolvedRequiredFields: ["Portfolio URL"],
            validationErrors: ["Email Address: Please enter a valid email."],
            blockingReasons: [],
            recommendedStatus: "Failed",
            lastCompletedStep: "review-before-submit",
        },
        provider: "greenhouse",
        url: "https://boards.greenhouse.io/acme/jobs/123",
        currentStep: "review-before-submit",
    });
    assert.deepEqual(errors.map((error) => error.category), ["required-field-unmapped", "validation-failed", "validation-failed"]);
    assert.ok(errors.every((error) => error.resumeFromStep === "review-before-submit"));
});
test("classifies selector and upload related thrown errors", () => {
    const selectorError = classifyThrownAutomationError({
        error: new Error("No file input found for selector input[type='file']"),
        provider: "workday",
        currentStep: "upload-documents",
    });
    const uploadError = classifyThrownAutomationError({
        error: new Error("Resume upload failed after retry"),
        provider: "lever",
        currentStep: "upload-documents",
    });
    assert.equal(selectorError.category, "selector-not-found");
    assert.equal(uploadError.category, "upload-failed");
    assert.match(selectorError.readableMessage, /could not find/i);
    assert.match(uploadError.readableMessage, /upload/i);
});
test("classifies duplicate detection into a non-retryable error", () => {
    const error = duplicateDetectedError({
        provider: "lever",
        url: "https://jobs.lever.co/acme/123",
        currentStep: "duplicate-check",
        details: { duplicateOfApplicationId: "app-1" },
    });
    assert.equal(error.category, "duplicate-detected");
    assert.equal(error.retryable, false);
    assert.match(error.readableMessage, /blocked as a duplicate/i);
});
