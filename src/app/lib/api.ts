export type SubmitMode = "review" | "auto";

export type ApplicationStatus =
  | "Not Started"
  | "In Progress"
  | "Applied"
  | "Failed"
  | "Needs Review"
  | "Duplicate";

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
  provider?: string;
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

export interface DuplicateReason {
  code: "provider" | "canonical-url" | "company-name" | "job-title" | "external-job-id";
  label: string;
  normalizedValue?: string;
  message: string;
}

export interface FailureLogRecord {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
  category?: AutomationErrorCategory;
  details?: Record<string, unknown>;
}

export interface TrackerItem {
  application: {
    id: string;
    companyName?: string;
    roleTitle?: string;
    atsProvider?: string;
    sourceJobUrl?: string;
    canonicalJobUrl?: string;
    location?: string;
    salary?: string;
    applicationDate: string;
    status: ApplicationStatus;
    confidenceScore: number;
    lastCompletedStep?: string;
    unresolvedRequiredFields: string[];
    screenshotPaths: string[];
    failureScreenshotPaths: string[];
    failureLogIds: string[];
    lastSafeStep?: string;
    resumePath?: string;
    coverLetterPath?: string;
    notes?: string;
    duplicate: boolean;
    reviewSummary?: ReviewSummary;
    errorDetails?: AutomationErrorDetail[];
    lastError?: AutomationErrorDetail;
    updatedAt: string;
    duplicateOfApplicationId?: string;
    duplicateReasons?: DuplicateReason[];
  };
  job?: {
    id: string;
    title?: string;
    company?: string;
    location?: string;
    sourceUrl: string;
    provider: string;
    normalizedUrl?: string;
  };
  failureLogs?: FailureLogRecord[];
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

export interface ProfileSummary {
  id: string;
  resumeText: string;
  autofillText: string;
  submitMode: SubmitMode;
  autoSubmitConfidenceThreshold: number;
}

export interface ProfileReadiness {
  ready: boolean;
  hasResumeText: boolean;
  hasAutofillText: boolean;
  usesAutofillAsSourceOfTruth: boolean;
  usesResumeTextForBackground: boolean;
  explicitNoWorkExperience: boolean;
  issues: Array<{
    code: "missing-resume-text" | "missing-autofill-text" | "malformed-profile";
    severity: "error" | "warning";
    message: string;
    actionableMessage: string;
  }>;
}

export interface AutomationBatch {
  id: string;
  status: "running" | "completed" | "failed";
  total: number;
  queued: number;
  started: number;
  completed: number;
  failedToStart: number;
  currentJobUrl?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  stats: TrackerStats;
}

export interface JobTargetSummary {
  id: string;
  company?: string;
  title?: string;
  location?: string;
  sourceUrl: string;
  normalizedUrl: string;
  provider: string;
  relevanceScore: number;
}

function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== "undefined") {
    if (window.location.protocol === "file:") {
      return "http://localhost:4000";
    }

    return window.location.origin;
  }

  return "";
}

function buildApiUrl(path: string) {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

async function request(path: string, init?: RequestInit) {
  const url = buildApiUrl(path);

  try {
    return await fetch(url, init);
  } catch {
    throw new Error(
      "Unable to reach the Careers+ backend. Start it with `npm run dev` or `npm run server` and retry.",
    );
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? response.statusText ?? "Request failed");
  }
  return (await response.json()) as T;
}

export async function fetchApplications() {
  return parseResponse<{ items: TrackerItem[]; stats: TrackerStats }>(
    await request("/api/applications"),
  );
}

export async function fetchProfile() {
  return parseResponse<{ profile: ProfileSummary | null; readiness: ProfileReadiness }>(
    await request("/api/profile"),
  );
}

export async function uploadResumeFile(file: File) {
  const formData = new FormData();
  formData.append("resume", file);

  return parseResponse<{ document: { id: string; fileName: string } }>(
    await request("/api/profile/resume-file", {
      method: "POST",
      body: formData,
    }),
  );
}

export async function importProfileText(payload: {
  resumeText: string;
  autofillText: string;
}) {
  return parseResponse<{ profile: ProfileSummary }>(
    await request("/api/profile/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateSubmitMode(
  submitMode: SubmitMode,
  autoSubmitConfidenceThreshold?: number,
) {
  return parseResponse<{ profile: ProfileSummary }>(
    await request("/api/profile/submit-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submitMode, autoSubmitConfidenceThreshold }),
    }),
  );
}

export async function detectAts(jobUrl: string) {
  return parseResponse<{
    provider: string;
    normalizedUrl: string;
    canonicalUrl: string;
    confidence: number;
    reason: string;
    method: string;
  }>(
    await request("/api/applications/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUrl }),
    }),
  );
}

export async function automateApplication(
  jobUrl: string,
  submitMode?: SubmitMode,
  allowDuplicate?: boolean,
) {
  return parseResponse(
    await request("/api/applications/automate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUrl, submitMode, allowDuplicate }),
    }),
  );
}

export async function startApplications(
  jobUrls: string[],
  submitMode?: SubmitMode,
) {
  return parseResponse<{ batch: AutomationBatch }>(
    await request("/api/applications/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUrls, submitMode }),
    }),
  );
}

export async function fetchActiveBatch() {
  return parseResponse<{ batch: AutomationBatch | null }>(
    await request("/api/applications/batch/active"),
  );
}

export async function fetchBatch(batchId: string) {
  return parseResponse<{ batch: AutomationBatch | null }>(
    await request(`/api/applications/batch/${batchId}`),
  );
}

export async function fetchJobTargets(relevantOnly = true) {
  return parseResponse<{ targets: JobTargetSummary[] }>(
    await request(`/api/applications/targets?relevantOnly=${relevantOnly ? "true" : "false"}`),
  );
}

export async function importJobTargets(relevantOnly = true) {
  return parseResponse<{
    sourceFileName: string;
    importedCount: number;
    preferredLocationMatches: number;
    targets: JobTargetSummary[];
  }>(
    await request("/api/applications/import-job-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relevantOnly }),
    }),
  );
}
