import fs from "node:fs";
import path from "node:path";
import { scrollIntoViewIfNeeded, waitForAsyncValidation } from "./playwright-utils.js";
export async function uploadAndVerifyFile(page, selector, filePath) {
    if (!fs.existsSync(filePath)) {
        return { ok: false, reason: `File does not exist: ${filePath}` };
    }
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
        return { ok: false, reason: `No file input found for selector ${selector}` };
    }
    await scrollIntoViewIfNeeded(locator);
    await locator.setInputFiles(filePath).catch(() => undefined);
    await waitForAsyncValidation(page);
    const verification = await locator
        .evaluate((element, expectedName) => {
        const input = element;
        return {
            uploaded: Boolean(input.files && input.files.length > 0),
            uploadedName: input.files?.[0]?.name,
            inputName: input.getAttribute("name") || undefined,
            inputId: input.getAttribute("id") || undefined,
            expectedName,
        };
    }, path.basename(filePath))
        .catch(() => null);
    if (!verification) {
        return { ok: false, reason: `Could not verify file input state for selector ${selector}` };
    }
    if (!verification.uploaded) {
        return {
            ok: false,
            reason: `File input did not retain uploaded file for selector ${selector}`,
            inputName: verification.inputName,
            inputId: verification.inputId,
        };
    }
    return {
        ok: true,
        inputName: verification.inputName,
        inputId: verification.inputId,
    };
}
