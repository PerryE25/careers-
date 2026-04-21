export function buildAutomationError(input) {
    return {
        category: input.category,
        code: input.code,
        message: input.message,
        readableMessage: toReadableMessage(input),
        provider: input.provider,
        url: input.url,
        currentStep: input.currentStep,
        selector: input.selector,
        fieldLabel: input.fieldLabel,
        retryable: input.retryable ??
            (input.category !== "unsupported-form" && input.category !== "duplicate-detected"),
        resumeFromStep: input.resumeFromStep,
        details: input.details,
        domSnapshot: input.domSnapshot,
    };
}
export function classifyReviewSummaryErrors(input) {
    const issues = [];
    for (const field of input.summary.unresolvedRequiredFields) {
        issues.push(buildAutomationError({
            category: "required-field-unmapped",
            code: "required_field_unmapped",
            message: `Required field remained unresolved: ${field}`,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            fieldLabel: field,
            resumeFromStep: input.summary.lastCompletedStep,
            domSnapshot: input.domSnapshot,
        }));
    }
    for (const error of input.summary.validationErrors) {
        issues.push(buildAutomationError({
            category: "validation-failed",
            code: "validation_failed",
            message: error,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            retryable: true,
            resumeFromStep: input.summary.lastCompletedStep,
            domSnapshot: input.domSnapshot,
        }));
    }
    if (input.summary.mode === "auto" &&
        input.summary.confidenceScore < input.summary.confidenceThreshold) {
        issues.push(buildAutomationError({
            category: "validation-failed",
            code: "confidence_below_threshold",
            message: `Confidence ${input.summary.confidenceScore.toFixed(2)} is below configured threshold ${input.summary.confidenceThreshold.toFixed(2)}.`,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            retryable: true,
            resumeFromStep: input.summary.lastCompletedStep,
            details: {
                confidenceScore: input.summary.confidenceScore,
                confidenceThreshold: input.summary.confidenceThreshold,
            },
            domSnapshot: input.domSnapshot,
        }));
    }
    return dedupeErrors(issues);
}
export function classifyThrownAutomationError(input) {
    const message = input.error instanceof Error ? input.error.message : "Unknown automation error";
    const lower = message.toLowerCase();
    if (lower.includes("selector") || lower.includes("no file input found")) {
        return buildAutomationError({
            category: "selector-not-found",
            code: "selector_not_found",
            message,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            resumeFromStep: input.resumeFromStep,
            domSnapshot: input.domSnapshot,
        });
    }
    if (lower.includes("unsupported")) {
        return buildAutomationError({
            category: "unsupported-form",
            code: "unsupported_form",
            message,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            retryable: false,
            domSnapshot: input.domSnapshot,
        });
    }
    if (lower.includes("upload")) {
        return buildAutomationError({
            category: "upload-failed",
            code: "upload_failed",
            message,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            resumeFromStep: input.resumeFromStep,
            domSnapshot: input.domSnapshot,
        });
    }
    if (lower.includes("submit")) {
        return buildAutomationError({
            category: "submit-failed",
            code: "submit_failed",
            message,
            provider: input.provider,
            url: input.url,
            currentStep: input.currentStep,
            resumeFromStep: input.resumeFromStep,
            domSnapshot: input.domSnapshot,
        });
    }
    return buildAutomationError({
        category: "unknown",
        code: "unknown_automation_error",
        message,
        provider: input.provider,
        url: input.url,
        currentStep: input.currentStep,
        resumeFromStep: input.resumeFromStep,
        domSnapshot: input.domSnapshot,
    });
}
export function duplicateDetectedError(input) {
    return buildAutomationError({
        category: "duplicate-detected",
        code: "duplicate_detected",
        message: "Automation was blocked because this application matches an existing record.",
        provider: input.provider,
        url: input.url,
        currentStep: input.currentStep,
        retryable: false,
        details: input.details,
    });
}
function toReadableMessage(input) {
    switch (input.category) {
        case "selector-not-found":
            return "The automation could not find a required element on the page.";
        case "unsupported-form":
            return "This application form is not supported well enough for safe automation.";
        case "required-field-unmapped":
            return `A required field still needs input${input.fieldLabel ? `: ${input.fieldLabel}` : ""}.`;
        case "upload-failed":
            return "A required document upload did not complete successfully.";
        case "validation-failed":
            return "The form still has validation issues that blocked submission.";
        case "submit-failed":
            return "The final submit step did not complete successfully.";
        case "duplicate-detected":
            return "This application matches an existing record and was blocked as a duplicate.";
        default:
            return "The automation stopped because of an unexpected error.";
    }
}
function dedupeErrors(errors) {
    const seen = new Set();
    return errors.filter((error) => {
        const key = `${error.category}:${error.code}:${error.fieldLabel ?? ""}:${error.message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
