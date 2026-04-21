export const LEVER_SELECTORS = {
    jobPage: {
        metadataTitle: [
            ".posting-headline h2",
            ".posting-page h2",
            "[data-qa='posting-name']",
            "h2",
            "h1",
        ],
        metadataCompany: [
            "[data-qa='company-name']",
            ".posting-categories .sort-by-time",
            ".main-header-text",
        ],
        metadataLocation: [
            ".posting-categories .location",
            "[data-qa='posting-location']",
            ".posting-category.location",
        ],
        stepIndicators: [
            ".application-page h2",
            ".application-page h3",
            ".application-page .section-header",
            ".posting-headline h2",
        ],
        formRoots: [
            ".application-page",
            "form.application-form",
            "form.postings-form",
            "form",
        ],
    },
    applyButtons: {
        primary: [
            "[data-qa='btn-apply-bottom']",
            "[data-qa='btn-apply-top']",
            "a[href$='/apply']",
            "a[href*='/apply?']",
            "button:has-text('Apply for this job')",
            "button:has-text('Apply')",
        ],
    },
    formFields: {
        errorTexts: [
            ".application-error",
            ".errors",
            ".error",
            ".application-page .field-error",
            ".application-page .error-message",
        ],
    },
    uploads: {
        resumeInputs: [
            "input[name='resume']",
            "input[name='resume[]']",
            "input[type='file']",
        ],
        coverLetterInputs: [
            "input[name='coverLetter']",
            "input[name='cover_letter']",
            "input[type='file']",
        ],
    },
    review: {
        reviewRoots: [
            "button[type='submit']",
            "input[type='submit']",
            ".application-page button",
        ],
    },
    submit: {
        buttons: [
            "button[type='submit']",
            "input[type='submit']",
            "button:has-text('Submit application')",
            ".application-page button",
            ".template-btn-submit",
        ],
    },
};
