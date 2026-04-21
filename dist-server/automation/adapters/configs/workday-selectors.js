export const WORKDAY_NEXT_BUTTON_SELECTORS = [
    "button[data-automation-id='pageFooterNextButton']",
    "button[data-automation-id='bottom-navigation-next-button']",
    "button:has-text('Next')",
    "button:has-text('Continue')",
    "button:has-text('Save and Continue')",
];
export const WORKDAY_SUBMIT_BUTTON_SELECTORS = [
    "button[data-automation-id='pageFooterSubmitButton']",
    "button:has-text('Submit')",
    "button:has-text('Review and Submit')",
];
export const WORKDAY_STEP_NAME_SELECTORS = [
    "[data-automation-id='stepName']",
    "[data-automation-id='progressBar'] [aria-current='step']",
    "[data-automation-id='pageHeader']",
    "h1",
];
export const WORKDAY_SELECTORS = {
    jobPage: {
        metadataTitle: [
            "[data-automation-id='jobPostingHeader']",
            "[data-automation-id='posting-header']",
            "h1",
        ],
        metadataCompany: [
            "[data-automation-id='company']",
            "[data-automation-id='promptOption']",
        ],
        metadataLocation: [
            "[data-automation-id='locations']",
            "[data-automation-id='primaryLocation']",
            "[data-automation-id='location']",
        ],
        stepIndicators: WORKDAY_STEP_NAME_SELECTORS,
        formRoots: [
            "[data-automation-id='stepName']",
            "form",
            ...WORKDAY_NEXT_BUTTON_SELECTORS,
        ],
    },
    applyButtons: {
        primary: [
            "button[data-automation-id='applyManually']",
            "[data-automation-id='applyManually']",
            "button:has-text('Apply')",
            "a:has-text('Apply')",
        ],
    },
    formFields: {
        errorTexts: [
            "[data-automation-id='errorMessage']",
            "[data-automation-id='formError']",
            ".css-1d3kg4i",
            "[aria-invalid='true']",
        ],
    },
    uploads: {
        resumeInputs: [
            "input[type='file'][data-automation-id*='resume']",
            "input[type='file']",
        ],
        coverLetterInputs: [
            "input[type='file'][data-automation-id*='cover']",
            "input[type='file']",
        ],
    },
    review: {
        stepIndicators: WORKDAY_STEP_NAME_SELECTORS,
        reviewRoots: WORKDAY_SUBMIT_BUTTON_SELECTORS,
    },
    submit: {
        buttons: WORKDAY_SUBMIT_BUTTON_SELECTORS,
        nextButtons: WORKDAY_NEXT_BUTTON_SELECTORS,
    },
};
