export async function waitForPageReady(page) {
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForFunction(() => document.readyState === "interactive" || document.readyState === "complete")
        .catch(() => undefined);
}
export async function waitForAnyVisible(page, selectors, timeout = 5000) {
    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const found = await locator.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
        if (found) {
            return locator;
        }
    }
    return null;
}
export async function scrollIntoViewIfNeeded(locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
}
export async function clickWhenReady(locator) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
        return false;
    }
    await locator.waitFor({ state: "attached", timeout: 5000 }).catch(() => undefined);
    await scrollIntoViewIfNeeded(locator);
    const enabled = await locator.isEnabled().catch(() => true);
    const visible = await locator.isVisible().catch(() => false);
    if (!visible || !enabled) {
        return false;
    }
    await locator.click().catch(() => undefined);
    return true;
}
export async function fillWhenReady(locator, value) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
        return false;
    }
    await locator.waitFor({ state: "attached", timeout: 5000 }).catch(() => undefined);
    await scrollIntoViewIfNeeded(locator);
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
        return false;
    }
    await locator.fill(value).catch(() => undefined);
    await waitForInputValue(locator, value);
    return true;
}
export async function selectOptionWhenReady(locator, value) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
        return false;
    }
    await locator.waitFor({ state: "attached", timeout: 5000 }).catch(() => undefined);
    await scrollIntoViewIfNeeded(locator);
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
        return false;
    }
    const byLabel = await locator.selectOption({ label: value }).catch(() => []);
    if (byLabel.length > 0) {
        await waitForSelectValue(locator);
        return true;
    }
    const byValue = await locator.selectOption({ value }).catch(() => []);
    if (byValue.length > 0) {
        await waitForSelectValue(locator);
        return true;
    }
    return false;
}
export async function waitForInputValue(locator, expectedValue, timeout = 2000) {
    await locator
        .evaluate((element, payload) => new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const tick = () => {
            const field = element;
            if ((field.value || "").trim() === payload.expected.trim()) {
                resolve();
                return;
            }
            if (Date.now() - startedAt > payload.timeout) {
                reject(new Error("Timed out waiting for filled input value."));
                return;
            }
            window.requestAnimationFrame(tick);
        };
        tick();
    }), { expected: expectedValue, timeout })
        .catch(() => undefined);
}
export async function waitForSelectValue(locator, timeout = 2000) {
    await locator
        .evaluate((element, inputTimeout) => new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const tick = () => {
            const field = element;
            if ((field.value || "").trim()) {
                resolve();
                return;
            }
            if (Date.now() - startedAt > inputTimeout) {
                reject(new Error("Timed out waiting for selected option."));
                return;
            }
            window.requestAnimationFrame(tick);
        };
        tick();
    }), timeout)
        .catch(() => undefined);
}
export async function waitForAsyncValidation(page) {
    await page
        .waitForFunction(() => {
        const active = document.querySelector("[aria-busy='true'], .loading, .spinner, [data-loading='true']");
        return !active;
    }, undefined, { timeout: 2500 })
        .catch(() => undefined);
}
export async function waitForPageStateChange(page, previous, timeout = 5000) {
    await page
        .waitForFunction((state) => document.location.href !== state.url || document.title !== (state.title ?? ""), previous, { timeout })
        .catch(() => undefined);
}
export async function capturePageState(page) {
    const snapshot = await page
        .evaluate(() => {
        const isVisible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
            .filter(isVisible)
            .map((element) => element.textContent?.trim() || "")
            .filter(Boolean)
            .slice(0, 8);
        return {
            url: document.location.href,
            title: document.title || undefined,
            headings,
            visibleFormCount: Array.from(document.querySelectorAll("form")).filter(isVisible).length,
            invalidFieldCount: document.querySelectorAll("[aria-invalid='true'], .field-error, .error, .validation-error").length,
            htmlSnippet: (document.body?.outerHTML || "").slice(0, 4000),
            bodyTextSnippet: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1200),
        };
    })
        .catch(() => ({
        url: page.url(),
        title: undefined,
        headings: [],
        visibleFormCount: 0,
        invalidFieldCount: 0,
        htmlSnippet: undefined,
        bodyTextSnippet: undefined,
    }));
    return snapshot;
}
