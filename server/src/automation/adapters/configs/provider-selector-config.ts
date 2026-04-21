export interface ProviderSelectorConfig {
  jobPage: {
    metadataTitle: string[];
    metadataCompany: string[];
    metadataLocation: string[];
    stepIndicators: string[];
    formRoots?: string[];
  };
  applyButtons: {
    primary: string[];
  };
  formFields: {
    errorTexts: string[];
  };
  uploads: {
    resumeInputs: string[];
    coverLetterInputs: string[];
  };
  review: {
    stepIndicators?: string[];
    reviewRoots?: string[];
  };
  submit: {
    buttons: string[];
    nextButtons?: string[];
  };
}
