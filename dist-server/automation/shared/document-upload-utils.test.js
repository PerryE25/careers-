import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { uploadAndVerifyFile } from "./document-upload-utils.js";
test("uploadAndVerifyFile reports success for a visible file input", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-utils-"));
    const filePath = path.join(tempDir, "resume.pdf");
    fs.writeFileSync(filePath, "resume");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.setContent(`<input id="resume" name="resume" type="file" />`);
        const result = await uploadAndVerifyFile(page, "#resume", filePath);
        assert.equal(result.ok, true);
        assert.equal(result.inputName, "resume");
    }
    finally {
        await browser.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
test("uploadAndVerifyFile reports clear failure when the selector is missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-utils-"));
    const filePath = path.join(tempDir, "resume.pdf");
    fs.writeFileSync(filePath, "resume");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.setContent(`<div>No upload field</div>`);
        const result = await uploadAndVerifyFile(page, "#resume", filePath);
        assert.equal(result.ok, false);
        assert.match(result.reason ?? "", /No file input found/);
    }
    finally {
        await browser.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
