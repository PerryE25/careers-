export const GREENHOUSE_SELECTORS = {
    jobPage: {
        metadataTitle: [
            "#app_body h1.app-title",
            "#app_body h1",
            ".opening h1",
            "h1.app-title",
            "h1",
        ],
        metadataCompany: [
            "#header .company-name",
            ".company-name",
            "meta[property='og:site_name']",
        ],
        metadataLocation: [
            "#header .location",
            ".opening .location",
            ".location",
        ],
        stepIndicators: [
            "#application",
            ".application_container",
            ".opening",
            "#main_fields h3",
            "h1",
        ],
        formRoots: [
            "#application",
            ".application_container",
            "form#application_form",
            "form:has(input[type='file'])",
            "form:has(button:has-text('Submit application'))",
        ],
    },
    applyButtons: {
        primary: [
            "a[href$='#form']",
            "a[href*='#form']",
            "a[href*='/job_app']",
            "button:has-text('Apply now')",
            "a:has-text('Apply now')",
            "button:has-text('Apply for this job')",
            "button:has-text('Apply')",
            "a:has-text('Apply')",
        ],
    },
    formFields: {
        errorTexts: [
            ".field-error",
            ".errors",
            ".validation-error",
            ".error",
            ".application-errors",
        ],
    },
    uploads: {
        resumeInputs: [
            "input[name='application[resume]']",
            "input[name='resume']",
            "input[type='file']",
        ],
        coverLetterInputs: [
            "input[name='application[cover_letter]']",
            "input[name='cover_letter']",
            "input[type='file']",
        ],
    },
    review: {
        reviewRoots: [
            "button[type='submit']",
            "input[type='submit']",
        ],
    },
    submit: {
        buttons: [
            "button:has-text('Submit application')",
            "button[type='submit']",
            "input[type='submit']",
        ],
    },
};
