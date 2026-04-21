import fs from "node:fs";
import path from "node:path";
import { parseProfileText, StructuredProfileHelper } from "./profile-parser.js";
import { DocumentService } from "./document-service.js";
import { evaluateProfileReadiness } from "./profile-readiness.js";
export class ProfileService {
    store;
    uploadsDir;
    documents;
    constructor(store, uploadsDir) {
        this.store = store;
        this.uploadsDir = uploadsDir;
        fs.mkdirSync(uploadsDir, { recursive: true });
        this.documents = new DocumentService(store, uploadsDir);
    }
    readFirstExistingTextFile(candidatePaths) {
        for (const candidatePath of candidatePaths) {
            if (!fs.existsSync(candidatePath)) {
                continue;
            }
            const text = fs.readFileSync(candidatePath, "utf8").trim();
            if (text) {
                return text;
            }
        }
        return undefined;
    }
    getDefaultProfileTextSources() {
        const rootDir = process.cwd();
        const resumeText = this.readFirstExistingTextFile([
            path.join(rootDir, "master_resume.txt"),
            path.join(rootDir, "resume.txt"),
            path.join(rootDir, "resume.md"),
            path.join(rootDir, "data", "master_resume.txt"),
            path.join(rootDir, "data", "resume.txt"),
            path.join(rootDir, "data", "resume.md"),
            path.join(rootDir, "data", "uploads", "master_resume.txt"),
            path.join(rootDir, "data", "uploads", "resume.txt"),
            path.join(rootDir, "public", "master_resume.txt"),
            path.join(rootDir, "public", "resume.txt"),
            path.join(rootDir, "public", "autofill", "master_resume.txt"),
            path.join(rootDir, "public", "autofill", "resume.txt"),
        ]);
        const autofillText = this.readFirstExistingTextFile([
            path.join(rootDir, "autofill.txt"),
            path.join(rootDir, "data", "autofill.txt"),
            path.join(rootDir, "data", "uploads", "autofill.txt"),
            path.join(rootDir, "public", "autofill.txt"),
            path.join(rootDir, "public", "autofill", "autofill.txt"),
        ]);
        return {
            resumeText,
            autofillText,
        };
    }
    ensureDefaultProfileText(profile) {
        const defaults = this.getDefaultProfileTextSources();
        const resumeText = profile?.resumeText?.trim() ? profile.resumeText : defaults.resumeText ?? "";
        const autofillText = profile?.autofillText?.trim() ? profile.autofillText : defaults.autofillText ?? "";
        if (profile?.resumeText === resumeText && profile?.autofillText === autofillText) {
            return profile;
        }
        if (!resumeText && !autofillText) {
            return profile;
        }
        const parsed = parseProfileText(resumeText, autofillText);
        return this.store.upsertProfile({
            resumeText,
            autofillText,
            autofillFields: parsed.autofillFields,
            canonicalProfile: parsed.canonicalProfile,
            validation: parsed.validation,
            submitMode: profile?.submitMode ?? "auto",
            autoSubmitConfidenceThreshold: profile?.autoSubmitConfidenceThreshold ?? 0.85,
        });
    }
    syncDerivedProfileFields(profile) {
        const parsed = parseProfileText(profile.resumeText ?? "", profile.autofillText ?? "");
        const shouldRefresh = JSON.stringify(profile.autofillFields ?? {}) !== JSON.stringify(parsed.autofillFields) ||
            JSON.stringify(profile.canonicalProfile ?? {}) !== JSON.stringify(parsed.canonicalProfile) ||
            JSON.stringify(profile.validation ?? {}) !== JSON.stringify(parsed.validation);
        if (!shouldRefresh) {
            return profile;
        }
        return this.store.upsertProfile({
            resumeText: profile.resumeText ?? "",
            autofillText: profile.autofillText ?? "",
            autofillFields: parsed.autofillFields,
            canonicalProfile: parsed.canonicalProfile,
            validation: parsed.validation,
            submitMode: profile.submitMode ?? "auto",
            autoSubmitConfidenceThreshold: profile.autoSubmitConfidenceThreshold ?? 0.85,
        });
    }
    getProfile() {
        const profile = this.ensureDefaultProfileText(this.store.getProfile());
        if (!profile) {
            return null;
        }
        if (profile.canonicalProfile && profile.validation) {
            return this.syncDerivedProfileFields(profile);
        }
        const parsed = parseProfileText(profile.resumeText ?? "", profile.autofillText ?? "");
        return this.store.upsertProfile({
            resumeText: profile.resumeText ?? "",
            autofillText: profile.autofillText ?? "",
            autofillFields: parsed.autofillFields,
            canonicalProfile: parsed.canonicalProfile,
            validation: parsed.validation,
            submitMode: profile.submitMode ?? "auto",
            autoSubmitConfidenceThreshold: profile.autoSubmitConfidenceThreshold ?? 0.85,
        });
    }
    getProfileStatus() {
        const profile = this.getProfile();
        const readiness = evaluateProfileReadiness(profile);
        return {
            profile,
            readiness,
        };
    }
    importText(resumeText, autofillText) {
        const parsed = parseProfileText(resumeText, autofillText);
        return this.store.upsertProfile({
            resumeText,
            autofillText,
            autofillFields: parsed.autofillFields,
            canonicalProfile: parsed.canonicalProfile,
            validation: parsed.validation,
            submitMode: this.getProfile()?.submitMode ?? "auto",
            autoSubmitConfidenceThreshold: this.getProfile()?.autoSubmitConfidenceThreshold ?? 0.85,
        });
    }
    updateSubmitMode(submitMode, autoSubmitConfidenceThreshold) {
        const current = this.getProfile();
        const parsed = parseProfileText(current?.resumeText ?? "", current?.autofillText ?? "");
        return this.store.upsertProfile({
            resumeText: current?.resumeText ?? "",
            autofillText: current?.autofillText ?? "",
            autofillFields: current?.autofillFields ?? parsed.autofillFields,
            canonicalProfile: current?.canonicalProfile ?? parsed.canonicalProfile,
            validation: current?.validation ?? parsed.validation,
            submitMode,
            autoSubmitConfidenceThreshold: autoSubmitConfidenceThreshold ?? current?.autoSubmitConfidenceThreshold ?? 0.85,
        });
    }
    getBestAnswerForField(fieldLabel, fieldType, options = []) {
        const profile = this.getProfile();
        if (!profile) {
            return undefined;
        }
        return new StructuredProfileHelper(profile).getBestAnswerForField(fieldLabel, fieldType, options);
    }
    getShortAnswerForPrompt(prompt) {
        const profile = this.getProfile();
        if (!profile) {
            return undefined;
        }
        return new StructuredProfileHelper(profile).getShortAnswerForPrompt(prompt);
    }
    getLongAnswerForPrompt(prompt) {
        const profile = this.getProfile();
        if (!profile) {
            return undefined;
        }
        return new StructuredProfileHelper(profile).getLongAnswerForPrompt(prompt);
    }
    answerScreeningQuestion(prompt, preferredLength, context = {}) {
        const profile = this.getProfile();
        if (!profile) {
            return undefined;
        }
        return new StructuredProfileHelper(profile).answerScreeningQuestion(prompt, preferredLength, context);
    }
    saveResumeUpload(file) {
        const document = this.documents.saveUploadedResume(file, this.getProfile()?.id);
        return { document };
    }
}
