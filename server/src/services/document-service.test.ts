import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../persistence/json-store.js";
import { DocumentService } from "./document-service.js";
import type { Profile } from "../domain/models.js";

function createProfile(): Profile {
  return {
    id: "profile-1",
    resumeText: "",
    autofillText: "",
    autofillFields: {},
    canonicalProfile: {
      personalInfo: { firstName: "Perry", lastName: "Jones", fullName: "Perry Jones" },
      contactInfo: { email: "perry@example.com" },
      locationPreferences: { preferredLocations: [] },
      workAuthorization: { authorizedCountries: [] },
      education: [],
      technicalSkills: { languages: ["TypeScript"], frameworks: ["React"], tools: [], cloud: [], databases: [], other: [], raw: [] },
      projects: [{ name: "CareerCopilot", summary: "building an automation workflow", technologies: ["TypeScript"], links: [] }],
      prewrittenAnswers: [],
      demographicAnswers: {},
      jobPreferences: { desiredTitles: ["Software Engineer"], employmentTypes: [], workplaceTypes: [], industries: [] },
      salaryPreferences: {},
      relocationPreferences: { preferredLocations: [] },
      availability: {},
      technicalBackground: [],
      hasExplicitNoWorkExperience: true,
      sourceNotes: [],
    },
    validation: { isValid: true, issues: [] },
    submitMode: "review",
    autoSubmitConfidenceThreshold: 0.85,
    createdAt: "",
    updatedAt: "",
  };
}

test("selects the master resume by default and supports future preferred resume selection", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "documents-test-"));
  const dbPath = path.join(tempDir, "db.json");
  const store = new JsonStore(dbPath);
  const service = new DocumentService(store, tempDir);

  const olderPath = path.join(tempDir, "older.pdf");
  const newerPath = path.join(tempDir, "newer.docx");
  fs.writeFileSync(olderPath, "older");
  fs.writeFileSync(newerPath, "newer");

  const older = store.addDocument({
    kind: "resume",
    fileName: "older.pdf",
    storagePath: olderPath,
    mimeType: "application/pdf",
    source: "uploaded",
    profileId: "profile-1",
  });
  const newer = store.addDocument({
    kind: "resume",
    fileName: "newer.docx",
    storagePath: newerPath,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    source: "uploaded",
    profileId: "profile-1",
  });

  const defaultResume = service.selectResume({ profileId: "profile-1" });
  assert.equal(defaultResume?.id, newer.id);

  const preferredResume = service.selectResume({
    profileId: "profile-1",
    preferredResumeDocumentId: older.id,
  });
  assert.equal(preferredResume?.id, older.id);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("falls back to a relocated upload when the stored resume path is stale", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "documents-test-"));
  const dbPath = path.join(tempDir, "db.json");
  const uploadsDir = path.join(tempDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const store = new JsonStore(dbPath);
  const service = new DocumentService(store, uploadsDir);

  const fileName = "1776456418885-UTCS-Master-Resume.pdf";
  const relocatedPath = path.join(uploadsDir, fileName);
  fs.writeFileSync(relocatedPath, "resume");

  store.addDocument({
    kind: "resume",
    fileName: "UTCS Master Resume.pdf",
    storagePath: path.join("C:\\Users\\Perry\\Downloads\\CareerCopilot\\data\\uploads", fileName),
    mimeType: "application/pdf",
    source: "uploaded",
    profileId: "profile-1",
  });

  const selected = service.selectResume({ profileId: "profile-1" });
  assert.equal(selected?.filePath, relocatedPath);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("generates a safe cover letter and associates it with the application", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "documents-test-"));
  const dbPath = path.join(tempDir, "db.json");
  const store = new JsonStore(dbPath);
  const service = new DocumentService(store, tempDir);
  const profile = createProfile();

  const result = service.generateCoverLetter({
    applicationId: "app-123",
    profile,
    job: {
      id: "job-1",
      sourceUrl: "https://example.com/job",
      normalizedUrl: "https://example.com/job",
      provider: "lever",
      company: "Acme",
      title: "Software Engineer",
      firstSeenAt: "",
      updatedAt: "",
    },
  });

  assert.equal(result.applicationId, "app-123");
  assert.equal(result.kind, "cover-letter");
  assert.ok(fs.existsSync(result.filePath));
  assert.match(fs.readFileSync(result.filePath, "utf8"), /Software Engineer/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("accepts PDF and DOCX resume uploads", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "documents-test-"));
  const dbPath = path.join(tempDir, "db.json");
  const store = new JsonStore(dbPath);
  const service = new DocumentService(store, tempDir);

  const pdf = service.saveUploadedResume({
    originalname: "resume.pdf",
    mimetype: "application/pdf",
    buffer: Buffer.from("pdf"),
  } as Express.Multer.File, "profile-1");
  const docx = service.saveUploadedResume({
    originalname: "resume.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("docx"),
  } as Express.Multer.File, "profile-1");

  assert.ok(pdf.filePath.endsWith(".pdf"));
  assert.ok(docx.filePath.endsWith(".docx"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});
