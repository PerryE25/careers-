import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ApplicationListItem,
  ApplicationRecord,
  AutomationEvent,
  AutomationRun,
  DatabaseShape,
  DuplicateReason,
  FailureLogRecord,
  JobTarget,
  Profile,
  StoredDocument,
  TrackerStats,
} from "../domain/models.js";
import { normalizeCompanyName, normalizeJobTitle } from "../services/application-normalization.js";

const EMPTY_DB: DatabaseShape = {
  profile: null,
  documents: [],
  jobs: [],
  applications: [],
  runs: [],
  events: [],
};

interface DuplicateLookupInput {
  provider?: JobTarget["provider"];
  normalizedUrl?: string;
  company?: string;
  title?: string;
  externalJobId?: string;
}

interface DuplicateMatch {
  application: ApplicationRecord;
  job: JobTarget;
  reasons: DuplicateReason[];
}

function normalizeExternalJobId(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export class JsonStore {
  constructor(private readonly filePath: string) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) {
      this.write(EMPTY_DB);
    }
  }

  read(): DatabaseShape {
    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as DatabaseShape;
    return {
      ...parsed,
      profile: parsed.profile
        ? {
            ...parsed.profile,
            submitMode: parsed.profile.submitMode ?? "auto",
            autoSubmitConfidenceThreshold: parsed.profile.autoSubmitConfidenceThreshold ?? 0.85,
          }
        : null,
      applications: (parsed.applications ?? []).map((application) => ({
        ...application,
        applicationDate: application.applicationDate ?? application.createdAt,
        unresolvedRequiredFields: application.unresolvedRequiredFields ?? [],
        screenshotPaths: application.screenshotPaths ?? [],
        failureScreenshotPaths: application.failureScreenshotPaths ?? [],
        failureLogIds: application.failureLogIds ?? [],
        duplicate: application.duplicate ?? application.status === "Duplicate",
        reviewSummary: application.reviewSummary,
        errorDetails: application.errorDetails ?? [],
        lastError: application.lastError,
        lastSafeStep: application.lastSafeStep,
      })),
      runs: (parsed.runs ?? []).map((run) => ({
        ...run,
        unresolvedRequiredFields: run.unresolvedRequiredFields ?? [],
        screenshotPaths: run.screenshotPaths ?? [],
        errorDetails: run.errorDetails ?? [],
        lastError: run.lastError,
        lastSafeStep: run.lastSafeStep,
      })),
    };
  }

  write(data: DatabaseShape) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  upsertProfile(input: Omit<Profile, "id" | "createdAt" | "updatedAt">): Profile {
    const db = this.read();
    const now = new Date().toISOString();
    const profile: Profile = db.profile
      ? {
          ...db.profile,
          ...input,
          updatedAt: now,
        }
      : {
          id: randomUUID(),
          ...input,
          createdAt: now,
          updatedAt: now,
        };
    db.profile = profile;
    this.write(db);
    return profile;
  }

  getProfile() {
    return this.read().profile;
  }

  addDocument(document: Omit<StoredDocument, "id" | "createdAt">): StoredDocument {
    const db = this.read();
    const created = {
      id: randomUUID(),
      ...document,
      createdAt: new Date().toISOString(),
    };
    db.documents.push(created);
    this.write(db);
    return created;
  }

  listDocuments() {
    return this.read().documents;
  }

  upsertJob(
    match: Pick<JobTarget, "normalizedUrl">,
    input: Omit<JobTarget, "id" | "firstSeenAt" | "updatedAt" | "normalizedUrl">,
  ): JobTarget {
    const db = this.read();
    const now = new Date().toISOString();
    const existing = db.jobs.find((job) => job.normalizedUrl === match.normalizedUrl);
    const normalizedFields = {
      normalizedCompanyName: normalizeCompanyName(input.company),
      normalizedJobTitle: normalizeJobTitle(input.title),
    };
    if (existing) {
      const updated = {
        ...existing,
        ...input,
        ...normalizedFields,
        normalizedUrl: match.normalizedUrl,
        updatedAt: now,
      };
      db.jobs = db.jobs.map((job) => (job.id === updated.id ? updated : job));
      this.write(db);
      return updated;
    }
    const created: JobTarget = {
      id: randomUUID(),
      normalizedUrl: match.normalizedUrl,
      ...input,
      ...normalizedFields,
      firstSeenAt: now,
      updatedAt: now,
    };
    db.jobs.push(created);
    this.write(db);
    return created;
  }

  findJobByNormalizedUrl(normalizedUrl: string) {
    return this.read().jobs.find((job) => job.normalizedUrl === normalizedUrl);
  }

  listJobs() {
    return this.read().jobs
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createApplication(
    input: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">,
  ): ApplicationRecord {
    const db = this.read();
    const now = new Date().toISOString();
    const created: ApplicationRecord = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    db.applications.push(created);
    this.write(db);
    return created;
  }

  updateApplication(id: string, patch: Partial<ApplicationRecord>) {
    const db = this.read();
    const existing = db.applications.find((application) => application.id === id);
    if (!existing) {
      throw new Error(`Application ${id} not found`);
    }
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    db.applications = db.applications.map((application) =>
      application.id === id ? updated : application,
    );
    this.write(db);
    return updated;
  }

  findApplicationByJobId(jobId: string) {
    return this.read().applications.find((application) => application.jobId === jobId);
  }

  findDuplicateApplication(
    input: DuplicateLookupInput,
    options: { excludeApplicationId?: string } = {},
  ): DuplicateMatch | undefined {
    const db = this.read();
    const normalizedCompany = normalizeCompanyName(input.company);
    const normalizedTitle = normalizeJobTitle(input.title);
    const normalizedExternalJobId = normalizeExternalJobId(input.externalJobId);

    const matches = db.applications
      .filter((application) => application.id !== options.excludeApplicationId)
      .filter(
        (application) =>
          application.status !== "Duplicate" &&
          application.status !== "Failed" &&
          application.status !== "Needs Review",
      )
      .map((application) => ({
        application,
        job: db.jobs.find((job) => job.id === application.jobId),
      }))
      .filter((entry): entry is { application: ApplicationRecord; job: JobTarget } => Boolean(entry.job))
      .map(({ application, job }) => {
        const reasons: DuplicateReason[] = [];
        const providerMatches = Boolean(input.provider && job.provider === input.provider);
        const existingExternalJobId = normalizeExternalJobId(job.externalJobId);
        const hasDistinctExternalJobId = Boolean(
          normalizedExternalJobId &&
          existingExternalJobId &&
          normalizedExternalJobId !== existingExternalJobId,
        );

        if (!providerMatches) {
          return undefined;
        }

        if (hasDistinctExternalJobId) {
          return undefined;
        }

        reasons.push({
          code: "provider",
          label: "ATS provider",
          normalizedValue: job.provider,
          message: `Matched ATS provider "${job.provider}".`,
        });

        if (input.normalizedUrl && job.normalizedUrl === input.normalizedUrl) {
          reasons.push({
            code: "canonical-url",
            label: "Canonical job URL",
            normalizedValue: job.normalizedUrl,
            message: `Matched canonical job URL "${job.normalizedUrl}".`,
          });
        }

        if (normalizedExternalJobId && existingExternalJobId === normalizedExternalJobId) {
          reasons.push({
            code: "external-job-id",
            label: "External job ID",
            normalizedValue: existingExternalJobId,
            message: `Matched provider job ID "${existingExternalJobId}".`,
          });
        }

        if (normalizedCompany && job.normalizedCompanyName === normalizedCompany) {
          reasons.push({
            code: "company-name",
            label: "Company name",
            normalizedValue: normalizedCompany,
            message: `Matched normalized company name "${normalizedCompany}".`,
          });
        }

        if (normalizedTitle && job.normalizedJobTitle === normalizedTitle) {
          reasons.push({
            code: "job-title",
            label: "Job title",
            normalizedValue: normalizedTitle,
            message: `Matched normalized job title "${normalizedTitle}".`,
          });
        }

        const hasCanonicalMatch = reasons.some((reason) => reason.code === "canonical-url");
        const hasExternalIdMatch = reasons.some((reason) => reason.code === "external-job-id");
        const hasCompanyMatch = reasons.some((reason) => reason.code === "company-name");
        const hasTitleMatch = reasons.some((reason) => reason.code === "job-title");
        const isDuplicate = hasCanonicalMatch || hasExternalIdMatch || (hasCompanyMatch && hasTitleMatch);

        if (!isDuplicate) {
          return undefined;
        }

        return { application, job, reasons };
      })
      .filter((entry): entry is DuplicateMatch => Boolean(entry))
      .sort((left, right) => {
        const leftUrl = left.reasons.some((reason) => reason.code === "canonical-url") ? 1 : 0;
        const rightUrl = right.reasons.some((reason) => reason.code === "canonical-url") ? 1 : 0;
        if (leftUrl !== rightUrl) {
          return rightUrl - leftUrl;
        }
        return right.application.updatedAt.localeCompare(left.application.updatedAt);
      });

    return matches[0];
  }

  createRun(input: Omit<AutomationRun, "id">) {
    const db = this.read();
    const created: AutomationRun = {
      id: randomUUID(),
      ...input,
    };
    db.runs.push(created);
    this.write(db);
    return created;
  }

  updateRun(id: string, patch: Partial<AutomationRun>) {
    const db = this.read();
    const existing = db.runs.find((run) => run.id === id);
    if (!existing) {
      throw new Error(`Run ${id} not found`);
    }
    const updated = { ...existing, ...patch };
    db.runs = db.runs.map((run) => (run.id === id ? updated : run));
    this.write(db);
    return updated;
  }

  addEvent(input: Omit<AutomationEvent, "id" | "timestamp">) {
    const db = this.read();
    const created: AutomationEvent = {
      id: randomUUID(),
      ...input,
      timestamp: new Date().toISOString(),
    };
    db.events.push(created);
    this.write(db);
    return created;
  }

  listApplications(): ApplicationListItem[] {
    const db = this.read();
    return db.applications
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((application) => {
        const run = application.lastRunId
          ? db.runs.find((candidate) => candidate.id === application.lastRunId)
          : undefined;
        const failureLogs: FailureLogRecord[] = (application.failureLogIds ?? [])
          .map((logId) => db.events.find((event) => event.id === logId))
          .filter((event): event is AutomationEvent => Boolean(event))
          .map((event) => ({
            id: event.id,
            level: event.level,
            message: event.message,
            timestamp: event.timestamp,
            category: event.category,
            details: event.details,
          }));

        return {
          application,
          job: db.jobs.find((job) => job.id === application.jobId),
          run,
          failureLogs,
        };
      });
  }

  getTrackerStats(): TrackerStats {
    const applications = this.read().applications;
    return {
      totalApplications: applications.length,
      notStarted: applications.filter((app) => app.status === "Not Started").length,
      inProgress: applications.filter((app) => app.status === "In Progress").length,
      applied: applications.filter((app) => app.status === "Applied").length,
      needsReview: applications.filter((app) => app.status === "Needs Review").length,
      failed: applications.filter((app) => app.status === "Failed").length,
      duplicate: applications.filter((app) => app.status === "Duplicate").length,
    };
  }
}
