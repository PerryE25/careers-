import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyReviewSummaryErrors,
  classifyThrownAutomationError,
  duplicateDetectedError,
} from "./automation-error-utils.js";
import { LoginFirstLayoutUnsupportedError } from "../automation/shared/login-first-apply.js";
import { PageAccessBlockedError } from "../automation/shared/page-access-guard.js";

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
      recommendedStatus: "Needs Review",
      lastCompletedStep: "review-before-submit",
    },
    provider: "greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/123",
    currentStep: "review-before-submit",
  });

  assert.deepEqual(
    errors.map((error) => error.category),
    ["required-field-unmapped", "validation-failed", "validation-failed"],
  );
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

test("classifies page access / bot wall errors", () => {
  const error = classifyThrownAutomationError({
    error: new PageAccessBlockedError("cloudflare_ray_id"),
    provider: "greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/1",
    currentStep: "open-job-page",
  });

  assert.equal(error.category, "access-blocked");
  assert.equal(error.code, "access_blocked");
  assert.match(error.readableMessage, /cloudflare|bot protection|denied/i);
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

test("classifies login-first SSO walls as unsupported forms with URL-shape guidance", () => {
  const error = classifyThrownAutomationError({
    error: new LoginFirstLayoutUnsupportedError({
      provider: "lever",
      url: "https://jobs.lever.co/account/login",
      requiredUrlShape: "https://jobs.lever.co/<company>/<job-id> or the matching /apply guest page",
      headings: ["Sign in to continue"],
      controls: ["Continue with Google", "Log in"],
      matchedSignals: ["url:/login", "heading:sign in to continue"],
    }),
    provider: "lever",
    currentStep: "open-application",
    resumeFromStep: "job-details",
  });

  assert.equal(error.category, "unsupported-form");
  assert.equal(error.code, "login_first_layout_unsupported");
  assert.equal(error.retryable, false);
  assert.equal(error.details?.requiredUrlShape, "https://jobs.lever.co/<company>/<job-id> or the matching /apply guest page");
  assert.match(error.readableMessage, /SSO login is not supported/i);
  assert.match(error.readableMessage, /jobs\.lever\.co\/<company>\/<job-id>/i);
});
