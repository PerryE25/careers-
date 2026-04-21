import fs from "node:fs";
import path from "node:path";
import { JsonStore } from "../persistence/json-store.js";
import type { JobTarget, Profile, StoredDocument } from "../domain/models.js";

export interface DocumentSelectionOptions {
  profileId: string;
  preferredResumeDocumentId?: string;
}

export interface GeneratedCoverLetterOptions {
  applicationId: string;
  profile: Profile;
  job: JobTarget;
}

export interface DocumentDescriptor {
  id: string;
  kind: StoredDocument["kind"];
  fileName: string;
  filePath: string;
  mimeType: string;
  source: StoredDocument["source"];
  profileId?: string;
  applicationId?: string;
}

const SUPPORTED_RESUME_EXTENSIONS = new Set([".pdf", ".docx", ".doc"]);
const SUPPORTED_RESUME_MIME_PREFIXES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const LOCAL_DEFAULT_RESUME_CANDIDATES = [
  "master_resume.pdf",
  "master_resume.docx",
  "master_resume.doc",
  "master_resume.txt",
  "master_resume.md",
  "resume.pdf",
  "resume.docx",
  "resume.doc",
  "resume.txt",
  "resume.md",
  path.join("data", "master_resume.pdf"),
  path.join("data", "master_resume.docx"),
  path.join("data", "master_resume.doc"),
  path.join("data", "master_resume.txt"),
  path.join("data", "master_resume.md"),
  path.join("data", "resume.pdf"),
  path.join("data", "resume.docx"),
  path.join("data", "resume.doc"),
  path.join("data", "resume.txt"),
  path.join("data", "resume.md"),
  path.join("data", "uploads", "master_resume.pdf"),
  path.join("data", "uploads", "master_resume.docx"),
  path.join("data", "uploads", "master_resume.doc"),
  path.join("data", "uploads", "master_resume.txt"),
  path.join("data", "uploads", "master_resume.md"),
  path.join("data", "uploads", "resume.pdf"),
  path.join("data", "uploads", "resume.docx"),
  path.join("data", "uploads", "resume.doc"),
  path.join("data", "uploads", "resume.txt"),
  path.join("data", "uploads", "resume.md"),
  path.join("public", "master_resume.pdf"),
  path.join("public", "master_resume.docx"),
  path.join("public", "master_resume.doc"),
  path.join("public", "master_resume.txt"),
  path.join("public", "master_resume.md"),
  path.join("public", "resume.pdf"),
  path.join("public", "resume.docx"),
  path.join("public", "resume.doc"),
  path.join("public", "resume.txt"),
  path.join("public", "resume.md"),
  path.join("public", "autofill", "master_resume.pdf"),
  path.join("public", "autofill", "master_resume.docx"),
  path.join("public", "autofill", "master_resume.doc"),
  path.join("public", "autofill", "master_resume.txt"),
  path.join("public", "autofill", "master_resume.md"),
  path.join("public", "autofill", "resume.pdf"),
  path.join("public", "autofill", "resume.docx"),
  path.join("public", "autofill", "resume.doc"),
  path.join("public", "autofill", "resume.txt"),
  path.join("public", "autofill", "resume.md"),
];

export class DocumentService {
  constructor(
    private readonly store: JsonStore,
    private readonly uploadsDir: string,
  ) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  saveUploadedResume(file: Express.Multer.File, profileId?: string): DocumentDescriptor {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();
    const supported =
      SUPPORTED_RESUME_EXTENSIONS.has(ext) ||
      SUPPORTED_RESUME_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
    if (!supported) {
      throw new Error("Unsupported resume format. Supported formats: PDF, DOC, DOCX.");
    }

    const targetPath = path.join(this.uploadsDir, `${Date.now()}-${sanitizeFileName(file.originalname)}`);
    fs.writeFileSync(targetPath, file.buffer);
    const stored = this.store.addDocument({
      kind: "resume",
      fileName: file.originalname,
      storagePath: targetPath,
      mimeType: file.mimetype,
      source: "uploaded",
      profileId,
    });
    return this.toDescriptor(stored);
  }

  selectResume(options: DocumentSelectionOptions): DocumentDescriptor | undefined {
    const documents = this.store
      .listDocuments()
      .filter((document) => document.kind === "resume")
      .map((document) => ({
        document,
        resolvedPath: this.resolveExistingDocumentPath(document),
      }))
      .filter((entry): entry is { document: StoredDocument; resolvedPath: string } => Boolean(entry.resolvedPath))
      .sort((a, b) => b.document.createdAt.localeCompare(a.document.createdAt));

    const preferred = options.preferredResumeDocumentId
      ? documents.find((entry) => entry.document.id === options.preferredResumeDocumentId)
      : undefined;
    if (preferred) {
      return this.toDescriptor(preferred.document, preferred.resolvedPath);
    }

    const profileScoped = documents.find((entry) => entry.document.profileId === options.profileId);
    if (profileScoped) {
      return this.toDescriptor(profileScoped.document, profileScoped.resolvedPath);
    }

    const latest = documents[0];
    if (latest) {
      return this.toDescriptor(latest.document, latest.resolvedPath);
    }

    return this.getOrCreateLocalDefaultResume(options.profileId);
  }

  private resolveExistingDocumentPath(document: StoredDocument) {
    if (fs.existsSync(document.storagePath)) {
      return document.storagePath;
    }

    const relocatedPath = path.join(this.uploadsDir, path.basename(document.storagePath));
    if (fs.existsSync(relocatedPath)) {
      return relocatedPath;
    }

    return undefined;
  }

  generateCoverLetter(options: GeneratedCoverLetterOptions): DocumentDescriptor {
    const content = buildSafeCoverLetter(options.profile, options.job);
    const fileName = `cover-letter-${options.applicationId}.txt`;
    const filePath = path.join(this.uploadsDir, fileName);
    fs.writeFileSync(filePath, content, "utf8");

    const stored = this.store.addDocument({
      kind: "cover-letter",
      fileName,
      storagePath: filePath,
      mimeType: "text/plain",
      source: "generated",
      profileId: options.profile.id,
      applicationId: options.applicationId,
    });

    return this.toDescriptor(stored);
  }

  toDescriptor(document: StoredDocument, filePath = document.storagePath): DocumentDescriptor {
    return {
      id: document.id,
      kind: document.kind,
      fileName: document.fileName,
      filePath,
      mimeType: document.mimeType,
      source: document.source,
      profileId: document.profileId,
      applicationId: document.applicationId,
    };
  }

  private getOrCreateLocalDefaultResume(profileId: string): DocumentDescriptor | undefined {
    const rootDir = process.cwd();
    const localPath = LOCAL_DEFAULT_RESUME_CANDIDATES
      .map((candidate) => path.join(rootDir, candidate))
      .find((candidate) => fs.existsSync(candidate));

    if (!localPath) {
      return undefined;
    }

    const existing = this.store
      .listDocuments()
      .find((document) => document.kind === "resume" && document.storagePath === localPath);
    if (existing) {
      return this.toDescriptor(existing);
    }

    const ext = path.extname(localPath).toLowerCase();
    const mimeType = getMimeTypeForResumeExtension(ext);
    const stored = this.store.addDocument({
      kind: "resume",
      fileName: path.basename(localPath),
      storagePath: localPath,
      mimeType,
      source: "uploaded",
      profileId,
    });
    return this.toDescriptor(stored);
  }
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-z0-9._-]+/gi, "-");
}

function getMimeTypeForResumeExtension(ext: string) {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".doc":
      return "application/msword";
    case ".md":
      return "text/markdown";
    case ".txt":
    default:
      return "text/plain";
  }
}

function buildSafeCoverLetter(profile: Profile, job: JobTarget) {
  const company = job.company ?? "Hiring Team";
  const title = job.title ?? profile.canonicalProfile.jobPreferences.desiredTitles[0] ?? "this role";
  const skills = [
    ...profile.canonicalProfile.technicalSkills.languages,
    ...profile.canonicalProfile.technicalSkills.frameworks,
    ...profile.canonicalProfile.technicalSkills.tools,
  ]
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
  const project = profile.canonicalProfile.projects[0];

  return [
    `Dear ${company},`,
    "",
    `I am excited to apply for ${title}.`,
    `This opportunity stands out because it aligns with my technical background and the kind of work I want to keep growing in.`,
    skills ? `My saved profile highlights experience with ${skills}.` : "My saved profile highlights a solid technical foundation.",
    project?.summary
      ? `One project from my background involved ${project.summary}.`
      : "I am especially interested in roles where I can contribute thoughtfully and continue learning quickly.",
    "",
    "Thank you for your consideration.",
  ].join("\n");
}
