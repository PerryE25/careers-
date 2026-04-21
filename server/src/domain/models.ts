export type AtsProvider = "lever" | "greenhouse" | "workday" | "unknown";

export type ApplicationStatus =
  | "Not Started"
  | "In Progress"
  | "Applied"
  | "Failed"
  | "Needs Review"
  | "Duplicate";

export type SubmitMode = "review" | "auto";
export type AutomationErrorCategory =
  | "selector-not-found"
  | "unsupported-form"
  | "required-field-unmapped"
  | "upload-failed"
  | "validation-failed"
  | "submit-failed"
  | "duplicate-detected"
  | "access-blocked"
  | "unknown";

export interface DomSnapshot {
  url?: string;
  title?: string;
  headings?: string[];
  htmlSnippet?: string;
  bodyTextSnippet?: string;
}

export interface AutomationErrorDetail {
  category: AutomationErrorCategory;
  code: string;
  message: string;
  readableMessage: string;
  provider?: AtsProvider;
  url?: string;
  currentStep?: string;
  selector?: string;
  fieldLabel?: string;
  retryable: boolean;
  resumeFromStep?: string;
  details?: Record<string, unknown>;
  domSnapshot?: DomSnapshot;
}

export interface ReviewSummary {
  mode: SubmitMode;
  confidenceScore: number;
  confidenceThreshold: number;
  eligibleForAutoSubmit: boolean;
  shouldAttemptSubmit: boolean;
  submitAttempted: boolean;
  submitCompleted: boolean;
  unresolvedRequiredFields: string[];
  validationErrors: string[];
  blockingReasons: string[];
  recommendedStatus: ApplicationStatus;
  lastCompletedStep?: string;
}

export type DocumentKind = "resume" | "cover-letter" | "other";

export interface ProfileValidationIssue {
  field: string;
  severity: "warning" | "error";
  message: string;
}

export interface PromptAnswer {
  prompt: string;
  answer: string;
  length: "short" | "long";
  tags: string[];
}

export interface EducationEntry {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationDate?: string;
  gpa?: string;
  details?: string[];
}

export interface ProjectEntry {
  name?: string;
  summary?: string;
  technologies: string[];
  links: string[];
}

export interface TechnicalSkills {
  languages: string[];
  frameworks: string[];
  tools: string[];
  cloud: string[];
  databases: string[];
  other: string[];
  raw: string[];
}

export interface PersonalInfo {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  preferredName?: string;
  pronouns?: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
}

export interface LocationPreferences {
  currentLocation?: string;
  preferredLocations: string[];
  remotePreference?: string;
  timeZone?: string;
}

export interface WorkAuthorization {
  workAuthorizationStatus?: string;
  requiresSponsorship?: boolean;
  authorizedCountries: string[];
  visaStatus?: string;
  securityClearance?: string;
}

export interface JobPreferences {
  desiredTitles: string[];
  employmentTypes: string[];
  workplaceTypes: string[];
  industries: string[];
  seniority?: string;
  noPriorExperience?: boolean;
}

export interface SalaryPreferences {
  minimumBase?: string;
  targetBase?: string;
  currency?: string;
  notes?: string;
}

export interface RelocationPreferences {
  openToRelocate?: boolean;
  preferredLocations: string[];
  notes?: string;
}

export interface Availability {
  startDate?: string;
  noticePeriod?: string;
  availableImmediately?: boolean;
}

export interface CanonicalProfile {
  personalInfo: PersonalInfo;
  contactInfo: ContactInfo;
  locationPreferences: LocationPreferences;
  workAuthorization: WorkAuthorization;
  education: EducationEntry[];
  technicalSkills: TechnicalSkills;
  projects: ProjectEntry[];
  prewrittenAnswers: PromptAnswer[];
  demographicAnswers: Record<string, string>;
  jobPreferences: JobPreferences;
  salaryPreferences: SalaryPreferences;
  relocationPreferences: RelocationPreferences;
  availability: Availability;
  technicalBackground: string[];
  hasExplicitNoWorkExperience: boolean;
  sourceNotes: string[];
}

export interface Profile {
  id: string;
  resumeText: string;
  autofillText: string;
  autofillFields: Record<string, string>;
  canonicalProfile: CanonicalProfile;
  validation: {
    isValid: boolean;
    issues: ProfileValidationIssue[];
  };
  submitMode: SubmitMode;
  autoSubmitConfidenceThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  storagePath: string;
  mimeType: string;
  source: "uploaded" | "generated";
  profileId?: string;
  applicationId?: string;
  createdAt: string;
}

export interface JobTarget {
  id: string;
  sourceUrl: string;
  normalizedUrl: string;
  normalizedCompanyName?: string;
  normalizedJobTitle?: string;
  externalJobId?: string;
  provider: AtsProvider;
  company?: string;
  title?: string;
  location?: string;
  firstSeenAt: string;
  updatedAt: string;
}

export interface DuplicateReason {
  code: "provider" | "canonical-url" | "company-name" | "job-title" | "external-job-id";
  label: string;
  normalizedValue?: string;
  message: string;
}

export interface FailureLogRecord {
  id: string;
  level: AutomationEvent["level"];
  message: string;
  timestamp: string;
  category?: AutomationErrorCategory;
  details?: Record<string, unknown>;
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  profileId: string;
  companyName?: string;
  roleTitle?: string;
  atsProvider?: AtsProvider;
  sourceJobUrl?: string;
  canonicalJobUrl?: string;
  location?: string;
  salary?: string;
  applicationDate: string;
  status: ApplicationStatus;
  submitMode: SubmitMode;
  confidenceScore: number;
  lastRunId?: string;
  lastCompletedStep?: string;
  unresolvedRequiredFields: string[];
  screenshotPaths: string[];
  failureScreenshotPaths: string[];
  failureLogIds: string[];
  lastSafeStep?: string;
  resumeDocumentId?: string;
  coverLetterDocumentId?: string;
  resumePath?: string;
  coverLetterPath?: string;
  notes?: string;
  duplicate: boolean;
  duplicateOfApplicationId?: string;
  duplicateReasons?: DuplicateReason[];
  reviewSummary?: ReviewSummary;
  errorDetails?: AutomationErrorDetail[];
  lastError?: AutomationErrorDetail;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  applicationId: string;
  provider: AtsProvider;
  status: ApplicationStatus;
  startedAt: string;
  finishedAt?: string;
  confidenceScore: number;
  submitAttempted: boolean;
  submitCompleted: boolean;
  lastCompletedStep?: string;
  lastSafeStep?: string;
  unresolvedRequiredFields?: string[];
  screenshotPaths?: string[];
  errorMessage?: string;
  errorDetails?: AutomationErrorDetail[];
  lastError?: AutomationErrorDetail;
}

export interface AutomationEvent {
  id: string;
  runId: string;
  level: "info" | "warn" | "error";
  message: string;
  category?: AutomationErrorCategory;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface DatabaseShape {
  profile: Profile | null;
  documents: StoredDocument[];
  jobs: JobTarget[];
  applications: ApplicationRecord[];
  runs: AutomationRun[];
  events: AutomationEvent[];
}

export interface TrackerStats {
  totalApplications: number;
  notStarted: number;
  inProgress: number;
  applied: number;
  needsReview: number;
  failed: number;
  duplicate: number;
}

export interface ApplicationListItem {
  application: ApplicationRecord;
  job: JobTarget | undefined;
  run: AutomationRun | undefined;
  failureLogs?: FailureLogRecord[];
}
