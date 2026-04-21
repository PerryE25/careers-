import fs from "node:fs";
import path from "node:path";
import { normalizeCompanyName, normalizeJobTitle } from "./application-normalization.js";
class JsonJobSourceParser {
    canParse(input) {
        const extension = path.extname(input.fileName).toLowerCase();
        return extension === ".json" || input.mimeType?.includes("json") === true;
    }
    parse(input) {
        const parsed = JSON.parse(input.content);
        const rows = extractJsonRows(parsed);
        return rows
            .map(normalizeJsonCandidate)
            .filter((candidate) => Boolean(candidate.applyUrl));
    }
}
class MarkdownJobSourceParser {
    canParse(input) {
        const extension = path.extname(input.fileName).toLowerCase();
        return extension === ".md" || extension === ".markdown" || input.mimeType?.includes("markdown") === true;
    }
    parse(input) {
        const lines = input.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const rows = [];
        for (let index = 0; index < lines.length - 2; index += 1) {
            const headerLine = lines[index];
            const dividerLine = lines[index + 1];
            if (!headerLine.includes("|") || !/^[:|\-\s]+$/.test(dividerLine)) {
                continue;
            }
            const headers = splitMarkdownRow(headerLine).map(normalizeHeader);
            let rowIndex = index + 2;
            while (rowIndex < lines.length && lines[rowIndex].includes("|")) {
                const cells = splitMarkdownRow(lines[rowIndex]);
                if (cells.length < 2) {
                    rowIndex += 1;
                    continue;
                }
                const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
                const companyCell = pickCell(row, ["company", "employer"]);
                const titleCell = pickCell(row, ["role", "title", "position", "job"]);
                const locationCell = pickCell(row, ["location", "office", "city"]);
                const applyCell = pickCell(row, ["apply", "application", "link", "url"]);
                const roleTitle = stripMarkdownLinks(titleCell) || undefined;
                const company = stripMarkdownLinks(companyCell) || undefined;
                const location = stripMarkdownLinks(locationCell) || undefined;
                const applyUrl = extractFirstUrl(applyCell || titleCell || companyCell);
                rows.push({
                    company,
                    roleTitle,
                    location,
                    applyUrl,
                });
                rowIndex += 1;
            }
            index = rowIndex - 1;
        }
        return rows;
    }
}
function extractJsonRows(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (parsed && typeof parsed === "object") {
        const container = parsed;
        if (Array.isArray(container.targets)) {
            return container.targets;
        }
        if (Array.isArray(container.jobs)) {
            return container.jobs;
        }
        if (Array.isArray(container.items)) {
            return container.items;
        }
    }
    return [];
}
function normalizeJsonCandidate(input) {
    if (!input || typeof input !== "object") {
        return {};
    }
    const row = input;
    const providerHint = normalizeProviderHint(pickStringField(row, ["providerHint", "provider", "atsProvider"]));
    return {
        company: pickStringField(row, ["company", "companyName", "employer"]),
        roleTitle: pickStringField(row, ["roleTitle", "title", "jobTitle", "role", "position"]),
        location: pickStringField(row, ["location", "office", "city"]),
        applyUrl: pickStringField(row, ["applyUrl", "sourceUrl", "jobUrl", "url", "link", "applicationUrl"]),
        providerHint,
    };
}
function normalizeProviderHint(value) {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "lever" || normalized === "greenhouse" || normalized === "workday") {
        return normalized;
    }
    return undefined;
}
function pickStringField(row, fieldNames) {
    for (const fieldName of fieldNames) {
        const value = row[fieldName];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}
function splitMarkdownRow(line) {
    return line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell, index, cells) => !(index === 0 && cell === "") && !(index === cells.length - 1 && cell === ""));
}
function normalizeHeader(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function stripMarkdownLinks(value) {
    return (value ?? "")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`/g, "")
        .trim();
}
function extractFirstUrl(value) {
    if (!value) {
        return undefined;
    }
    const markdownLink = value.match(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/i);
    if (markdownLink?.[1]) {
        return markdownLink[1];
    }
    const rawUrl = value.match(/https?:\/\/[^\s)]+/i);
    return rawUrl?.[0];
}
function pickCell(row, candidates) {
    for (const [header, value] of Object.entries(row)) {
        if (candidates.some((candidate) => header.includes(candidate))) {
            return value;
        }
    }
    return "";
}
function isRelevantRole(candidate) {
    const title = `${candidate.roleTitle ?? ""} ${candidate.company ?? ""}`.toLowerCase();
    const roleMatch = /(software|swe|backend|front ?end|full ?stack|platform|application|developer|engineer)/i.test(title);
    const seniorityMatch = /(new grad|new graduate|entry level|entry-level|graduate|university grad|early career|associate|junior)/i.test(title);
    return roleMatch || (roleMatch && seniorityMatch);
}
function locationPreferenceScore(location, profile) {
    if (!location) {
        return 0;
    }
    const lowerLocation = location.toLowerCase();
    let score = 0;
    const candidates = [
        profile?.canonicalProfile.locationPreferences.currentLocation,
        ...(profile?.canonicalProfile.locationPreferences.preferredLocations ?? []),
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
    for (const candidate of candidates) {
        if (candidate && lowerLocation.includes(candidate)) {
            score += 3;
        }
    }
    if (profile?.canonicalProfile.locationPreferences.remotePreference?.toLowerCase().includes("remote") &&
        lowerLocation.includes("remote")) {
        score += 2;
    }
    if (lowerLocation.includes("united states") || lowerLocation.includes("usa") || lowerLocation.includes("us")) {
        score += 1;
    }
    return score;
}
export class JobSourceImportService {
    store;
    detector;
    uploadsDir;
    rootDir;
    parsers = [new JsonJobSourceParser(), new MarkdownJobSourceParser()];
    constructor(store, detector, uploadsDir, rootDir = process.cwd()) {
        this.store = store;
        this.detector = detector;
        this.uploadsDir = uploadsDir;
        this.rootDir = rootDir;
    }
    findExplicitLocalSource() {
        const candidates = [
            path.join(this.rootDir, "public", "autofill", "job-targets.json"),
            path.join(this.rootDir, "public", "job-targets.json"),
            path.join(this.rootDir, "data", "job-targets.json"),
            path.join(this.rootDir, "data", "uploads", "job-targets.json"),
        ];
        for (const filePath of candidates) {
            if (fs.existsSync(filePath)) {
                return {
                    fileName: path.basename(filePath),
                    filePath,
                    mimeType: "application/json",
                };
            }
        }
        return undefined;
    }
    findLatestStoredSource() {
        const storedDocument = this.store
            .listDocuments()
            .filter((document) => hasSupportedJobSourceExtension(document.fileName) && fs.existsSync(document.storagePath))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (!storedDocument) {
            return undefined;
        }
        return {
            fileName: storedDocument.fileName,
            filePath: storedDocument.storagePath,
            mimeType: storedDocument.mimeType,
        };
    }
    findLatestUploadSource() {
        const files = fs.existsSync(this.uploadsDir)
            ? fs.readdirSync(this.uploadsDir)
                .filter((fileName) => hasSupportedJobSourceExtension(fileName))
                .map((fileName) => {
                const filePath = path.join(this.uploadsDir, fileName);
                const stats = fs.statSync(filePath);
                return {
                    fileName,
                    filePath,
                    mtimeMs: stats.mtimeMs,
                };
            })
                .sort((left, right) => right.mtimeMs - left.mtimeMs)
            : [];
        const latest = files[0];
        if (!latest) {
            return undefined;
        }
        return {
            fileName: latest.fileName,
            filePath: latest.filePath,
            mimeType: path.extname(latest.fileName).toLowerCase() === ".json" ? "application/json" : "text/markdown",
        };
    }
    findLatestJobSource() {
        return this.findExplicitLocalSource() ?? this.findLatestStoredSource() ?? this.findLatestUploadSource();
    }
    parseJobSource(source) {
        const content = fs.readFileSync(source.filePath, "utf8");
        const parser = this.parsers.find((candidate) => candidate.canParse({ fileName: source.fileName, mimeType: source.mimeType, content }));
        if (!parser) {
            throw new Error("No importer is available for the saved job target source.");
        }
        return parser.parse({
            fileName: source.fileName,
            mimeType: source.mimeType,
            content,
        });
    }
    upsertParsedRows(parsedRows, options = {}) {
        const seenUrls = new Set();
        const seenJobs = new Set();
        const imported = [];
        for (const row of parsedRows) {
            if (!row.applyUrl) {
                continue;
            }
            if (options.relevantOnly !== false && !isRelevantRole(row)) {
                continue;
            }
            const detection = this.detector.detect(row.applyUrl);
            const canonicalUrl = detection.canonicalUrl;
            const resolvedProvider = detection.provider === "unknown" ? row.providerHint ?? detection.provider : detection.provider;
            const jobKey = [
                normalizeCompanyName(row.company),
                normalizeJobTitle(row.roleTitle),
                (row.location ?? "").trim().toLowerCase(),
            ].join("|");
            if (seenUrls.has(canonicalUrl) || seenJobs.has(jobKey)) {
                continue;
            }
            seenUrls.add(canonicalUrl);
            seenJobs.add(jobKey);
            imported.push(this.store.upsertJob({ normalizedUrl: canonicalUrl }, {
                provider: resolvedProvider,
                sourceUrl: row.applyUrl,
                company: row.company,
                title: row.roleTitle,
                location: row.location,
                externalJobId: undefined,
            }));
        }
        return imported;
    }
    summarizeJobs(jobs) {
        const profile = this.store.getProfile();
        return jobs
            .map((job) => ({
            id: job.id,
            company: job.company,
            title: job.title,
            location: job.location,
            sourceUrl: job.sourceUrl,
            normalizedUrl: job.normalizedUrl,
            provider: job.provider,
            relevanceScore: locationPreferenceScore(job.location, profile),
        }))
            .sort((left, right) => {
            if (left.relevanceScore !== right.relevanceScore) {
                return right.relevanceScore - left.relevanceScore;
            }
            return (left.company ?? "").localeCompare(right.company ?? "");
        });
    }
    importLatestJobSource(options = {}) {
        const source = this.findLatestJobSource();
        if (!source) {
            throw new Error("No saved job target source was found. Add `public/autofill/job-targets.json` or upload a markdown job list.");
        }
        const parsedRows = this.parseJobSource(source);
        const imported = this.upsertParsedRows(parsedRows, options);
        const profile = this.store.getProfile();
        return {
            sourceFileName: source.fileName,
            importedCount: imported.length,
            targets: this.summarizeJobs(imported),
            preferredLocationMatches: imported.filter((target) => locationPreferenceScore(target.location, profile) > 0).length,
        };
    }
    importLatestJobMarkdown(options = {}) {
        return this.importLatestJobSource(options);
    }
    listJobTargets(options = {}) {
        const source = this.findLatestJobSource();
        if (source) {
            const parsedRows = this.parseJobSource(source);
            const syncedJobs = this.upsertParsedRows(parsedRows, options);
            return this.summarizeJobs(syncedJobs);
        }
        return this.summarizeJobs(this.store
            .listJobs()
            .filter((job) => Boolean(job.sourceUrl))
            .filter((job) => options.relevantOnly === false
            ? true
            : isRelevantRole({
                company: job.company,
                roleTitle: job.title,
                location: job.location,
                applyUrl: job.sourceUrl,
            })));
    }
}
function hasSupportedJobSourceExtension(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return extension === ".json" || extension === ".md" || extension === ".markdown";
}
