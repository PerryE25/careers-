import fs from "node:fs";
import path from "node:path";
export class CoverLetterService {
    store;
    uploadsDir;
    constructor(store, uploadsDir) {
        this.store = store;
        this.uploadsDir = uploadsDir;
    }
    generate(profile, job) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
        const company = job.company ?? "the hiring team";
        const title = job.title ?? "this role";
        const content = [
            `Dear ${company},`,
            "",
            `I am excited to apply for ${title}.`,
            "My background aligns closely with the experience captured in my master resume, and I would welcome the chance to contribute quickly.",
            "",
            "Highlights from my profile:",
            profile.resumeText.slice(0, 700) || profile.autofillText.slice(0, 700) || "Profile imported.",
            "",
            "Thank you for your consideration.",
        ].join("\n");
        const fileName = `cover-letter-${job.id}.txt`;
        const storagePath = path.join(this.uploadsDir, fileName);
        fs.writeFileSync(storagePath, content, "utf8");
        return this.store.addDocument({
            kind: "cover-letter",
            fileName,
            storagePath,
            mimeType: "text/plain",
            source: "generated",
        });
    }
}
