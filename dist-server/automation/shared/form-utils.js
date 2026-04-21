import { clickWhenReady, fillWhenReady, scrollIntoViewIfNeeded, selectOptionWhenReady, waitForAnyVisible, waitForAsyncValidation, } from "./playwright-utils.js";
export async function findFirstVisibleByLabels(page, labels) {
    for (const label of labels) {
        const locator = page.getByLabel(new RegExp(label, "i")).first();
        if (await locator.count().catch(() => 0)) {
            return locator;
        }
    }
    return null;
}
export async function setFileInput(locator, filePath) {
    if ((await locator.count().catch(() => 0)) === 0) {
        return false;
    }
    await locator.setInputFiles(filePath).catch(() => undefined);
    return true;
}
export async function extractBasicFormFields(page) {
    const fields = await page.locator("input, textarea, select").evaluateAll((elements) => elements.map((element) => {
        const typeAttr = element.getAttribute("type")?.toLowerCase();
        const tag = element.tagName.toLowerCase();
        let fieldType = "unknown";
        if (tag === "textarea") {
            fieldType = "textarea";
        }
        else if (tag === "select") {
            fieldType = "select";
        }
        else if (typeAttr === "email") {
            fieldType = "email";
        }
        else if (typeAttr === "tel") {
            fieldType = "phone";
        }
        else if (typeAttr === "radio") {
            fieldType = "radio";
        }
        else if (typeAttr === "checkbox") {
            fieldType = "checkbox";
        }
        else if (typeAttr === "file") {
            fieldType = "file";
        }
        else if (typeAttr === "text" || typeAttr === "search" || !typeAttr) {
            fieldType = "text";
        }
        const id = element.getAttribute("id") || undefined;
        const name = element.getAttribute("name") || undefined;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        const sameNamedInputs = typeAttr === "radio" || typeAttr === "checkbox"
            ? Array.from(document.querySelectorAll(`input[type="${typeAttr}"]`)).filter((candidate) => candidate.getAttribute("name") === name)
            : [];
        const shouldTreatAsGroupedRadio = typeAttr === "radio" && sameNamedInputs.length > 1;
        const section = element.closest("fieldset, section, form, .section, .application-question");
        const heading = section?.querySelector("legend, h1, h2, h3, h4, .section-header, .heading");
        const sectionName = heading?.textContent?.replace(/\s+/g, " ").trim() || undefined;
        let options = [];
        if (tag === "select") {
            options = Array.from(element.querySelectorAll("option"))
                .map((option) => (option.textContent ?? "").replace(/\s+/g, " ").trim())
                .filter(Boolean);
        }
        else if ((typeAttr === "radio" || typeAttr === "checkbox") && name) {
            options = sameNamedInputs
                .map((candidate) => {
                const candidateId = candidate.getAttribute("id");
                const explicit = candidateId ? document.querySelector(`label[for="${candidateId}"]`) : null;
                const wrapped = candidate.closest("label");
                const alternative = candidate.parentElement?.querySelector(".application-answer-alternative");
                return (explicit?.textContent ??
                    wrapped?.textContent ??
                    alternative?.textContent ??
                    candidate.getAttribute("value") ??
                    "").replace(/\s+/g, " ").trim();
            })
                .filter(Boolean);
        }
        const labelTarget = shouldTreatAsGroupedRadio ? (sameNamedInputs[0] ?? element) : element;
        const labelTargetId = labelTarget.getAttribute("id");
        const explicitLabel = labelTargetId ? document.querySelector(`label[for="${labelTargetId}"]`) : null;
        const wrappedLabel = labelTarget.closest("label");
        let label = "";
        if (!shouldTreatAsGroupedRadio) {
            label = (explicitLabel?.textContent ??
                wrappedLabel?.textContent ??
                labelTarget.getAttribute("aria-label") ??
                labelTarget.getAttribute("placeholder") ??
                "").replace(/\s+/g, " ").trim();
        }
        if (!label) {
            const containers = [
                labelTarget.closest("li.application-question"),
                labelTarget.closest(".application-question"),
                labelTarget.closest("fieldset"),
                labelTarget.closest(".application-field"),
                labelTarget.closest(".question"),
                labelTarget.closest(".field"),
                labelTarget.closest(".form-group"),
                labelTarget.closest("section"),
                labelTarget.closest("form"),
            ].filter(Boolean);
            for (const container of containers) {
                const root = container;
                const candidates = [
                    root.querySelector(".application-label .text"),
                    root.querySelector(".application-label"),
                    root.querySelector("legend"),
                    root.querySelector("[data-qa='form-field-label']"),
                    root.querySelector(".field-label"),
                    root.querySelector(".question-label"),
                    root.querySelector(".form-label"),
                    root.querySelector("label"),
                    root.previousElementSibling,
                ];
                const found = candidates
                    .map((candidate) => (candidate?.textContent ?? "").replace(/\s+/g, " ").trim())
                    .find((text) => text && (!shouldTreatAsGroupedRadio || !/^(yes|no|other|male|female|non-binary)$/i.test(text)));
                if (found) {
                    label = found;
                    break;
                }
            }
        }
        if (!label) {
            label = (name ?? id ?? "unknown").replace(/\s+/g, " ").trim();
        }
        return {
            label,
            placeholder: element.getAttribute("placeholder") || undefined,
            type: fieldType,
            visible,
            required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
            options,
            section: sectionName,
            groupName: name,
            domLocator: {
                name,
                id,
                selector: shouldTreatAsGroupedRadio
                    ? name
                        ? `[name="${name}"]`
                        : undefined
                    : id
                        ? `#${id}`
                        : name
                            ? `[name="${name}"]`
                            : undefined,
            },
            locatorHint: name || id || undefined,
        };
    }));
    const seen = new Set();
    return fields.filter((field) => {
        if (!field.visible) {
            return false;
        }
        const key = [
            field.label,
            field.type,
            field.groupName ?? "",
            field.domLocator.selector ?? "",
        ].join(":");
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
export async function fillTextLikeField(page, field, value) {
    const candidates = [];
    if (field.domLocator.name) {
        candidates.push(page.locator(`[name="${field.domLocator.name}"]`).first());
    }
    if (field.domLocator.id) {
        candidates.push(page.locator(`#${field.domLocator.id}`).first());
    }
    candidates.push(page.getByLabel(new RegExp(field.label, "i")).first());
    if (field.placeholder) {
        candidates.push(page.getByPlaceholder(new RegExp(field.placeholder, "i")).first());
    }
    for (const locator of candidates) {
        if (await fillWhenReady(locator, value)) {
            await waitForAsyncValidation(page);
            return true;
        }
    }
    return false;
}
export async function fillSelectLikeField(page, field, value) {
    const locator = field.domLocator.name
        ? page.locator(`[name="${field.domLocator.name}"]`).first()
        : field.domLocator.id
            ? page.locator(`#${field.domLocator.id}`).first()
            : page.getByLabel(new RegExp(field.label, "i")).first();
    if (field.type === "select") {
        const selected = await selectOptionWhenReady(locator, value);
        if (selected) {
            await waitForAsyncValidation(page);
        }
        return selected;
    }
    if (field.type === "radio" || field.type === "checkbox") {
        if (field.groupName) {
            const candidates = await page.locator(`[name="${field.groupName}"]`).all().catch(() => []);
            for (const candidate of candidates) {
                const candidateValue = (await candidate.getAttribute("value").catch(() => null)) ?? "";
                const candidateId = (await candidate.getAttribute("id").catch(() => null)) ?? "";
                const explicitLabel = candidateId
                    ? page.locator(`label[for="${candidateId}"]`).first()
                    : undefined;
                const wrappedLabel = candidate.locator("xpath=ancestor::label[1]").first();
                const explicitText = explicitLabel
                    ? (await explicitLabel.textContent().catch(() => null)) ?? ""
                    : "";
                const wrappedText = (await wrappedLabel.textContent().catch(() => null)) ?? "";
                const optionText = `${explicitText} ${wrappedText} ${candidateValue}`.trim();
                if (normalizeFieldText(candidateValue) === normalizeFieldText(value) ||
                    normalizeFieldText(optionText).includes(normalizeFieldText(value))) {
                    await scrollIntoViewIfNeeded(candidate);
                    await candidate.check().catch(() => undefined);
                    let checked = await candidate.isChecked().catch(() => false);
                    if (!checked && explicitLabel) {
                        await scrollIntoViewIfNeeded(explicitLabel);
                        await explicitLabel.click().catch(() => undefined);
                        checked = await candidate.isChecked().catch(() => false);
                    }
                    if (!checked) {
                        await scrollIntoViewIfNeeded(wrappedLabel);
                        await wrappedLabel.click().catch(() => undefined);
                        checked = await candidate.isChecked().catch(() => false);
                    }
                    if (!checked) {
                        await candidate.evaluate((element) => {
                            const input = element;
                            input.click();
                            input.dispatchEvent(new Event("input", { bubbles: true }));
                            input.dispatchEvent(new Event("change", { bubbles: true }));
                        }).catch(() => undefined);
                        checked = await candidate.isChecked().catch(() => false);
                    }
                    if (checked) {
                        await waitForAsyncValidation(page);
                        return true;
                    }
                }
            }
        }
        const optionLocator = page
            .getByLabel(new RegExp(`^${escapeRegex(value)}$`, "i"))
            .first();
        if ((await optionLocator.count().catch(() => 0)) > 0) {
            await scrollIntoViewIfNeeded(optionLocator);
            await optionLocator.check().catch(() => undefined);
            let checked = await optionLocator.isChecked().catch(() => false);
            if (!checked) {
                await optionLocator.click().catch(() => undefined);
                checked = await optionLocator.isChecked().catch(() => false);
            }
            if (checked) {
                await waitForAsyncValidation(page);
                return true;
            }
        }
    }
    return false;
}
export async function clickFirst(page, selectors) {
    const locator = await waitForAnyVisible(page, selectors, 1500);
    if (!locator) {
        return false;
    }
    const clicked = await clickWhenReady(locator);
    if (clicked) {
        await waitForAsyncValidation(page);
    }
    return clicked;
}
export async function collectTextErrors(page, selectors) {
    const messages = [];
    for (const selector of selectors) {
        const items = await page.locator(selector).evaluateAll((elements) => elements
            .filter((element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
            .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
            .filter(Boolean)).catch(() => []);
        messages.push(...items.map((item) => item.trim()).filter(Boolean));
    }
    return Array.from(new Set(messages)).map((message) => ({ message }));
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeFieldText(value) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}
