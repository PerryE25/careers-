import { capturePageState, clickWhenReady, waitForAnyVisible, waitForAsyncValidation } from "./playwright-utils.js";
export async function captureStepSnapshot(page, options) {
    const visibleHeadings = await page
        .locator((options.headingSelectors ?? ["h1", "h2", "h3"]).join(", "))
        .evaluateAll((elements) => elements
        .map((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visible = style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0;
        return visible ? element.textContent?.trim() || "" : "";
    })
        .filter(Boolean)
        .slice(0, 8))
        .catch(() => []);
    const stepName = await firstVisibleText(page, options.stepSelectors);
    const hasNext = await hasVisibleSelector(page, options.nextSelectors);
    const hasSubmit = await hasVisibleSelector(page, options.submitSelectors);
    const pageState = await capturePageState(page);
    return {
        stepName,
        url: page.url(),
        hasNext,
        hasSubmit,
        visibleHeadings,
        title: pageState.title,
        visibleFormCount: pageState.visibleFormCount,
        invalidFieldCount: pageState.invalidFieldCount,
    };
}
export async function clickFirstVisible(page, selectors) {
    const locator = await waitForAnyVisible(page, selectors, 2000);
    if (!locator) {
        return false;
    }
    const clicked = await clickWhenReady(locator);
    if (clicked) {
        await waitForAsyncValidation(page);
    }
    return clicked;
}
async function hasVisibleSelector(page, selectors) {
    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const count = await locator.count().catch(() => 0);
        if (count === 0) {
            continue;
        }
        if (await locator.isVisible().catch(() => false)) {
            return true;
        }
    }
    return false;
}
async function firstVisibleText(page, selectors) {
    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        const count = await locator.count().catch(() => 0);
        if (count === 0) {
            continue;
        }
        const visible = await locator.isVisible().catch(() => false);
        if (!visible) {
            continue;
        }
        const text = (await locator.textContent().catch(() => null))?.trim();
        if (text) {
            return text;
        }
    }
    return undefined;
}
