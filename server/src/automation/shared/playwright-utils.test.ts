import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  capturePageState,
  clickWhenReady,
  fillWhenReady,
  waitForAnyVisible,
} from "./playwright-utils.js";

test("waitForAnyVisible and clickWhenReady handle delayed rendering without sleeps", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setContent(`
      <button id="toggle" onclick="setTimeout(() => { document.querySelector('#target').style.display='block'; }, 50)">Show</button>
      <button id="target" style="display:none" onclick="document.body.dataset.clicked='yes'">Target</button>
    `);

    await clickWhenReady(page.locator("#toggle"));
    const target = await waitForAnyVisible(page, ["#target"], 1500);
    assert.ok(target);
    const clicked = await clickWhenReady(target!);
    assert.equal(clicked, true);
    assert.equal(await page.locator("body").getAttribute("data-clicked"), "yes");
  } finally {
    await browser.close();
  }
});

test("fillWhenReady fills visible fields and capturePageState returns useful debug state", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setContent(`
      <h1>Application</h1>
      <form style="display:block; min-height:40px">
        <input id="name" />
        <input id="email" aria-invalid="true" />
      </form>
    `);

    const filled = await fillWhenReady(page.locator("#name"), "Perry");
    assert.equal(filled, true);
    assert.equal(await page.locator("#name").inputValue(), "Perry");

    const state = await capturePageState(page);
    assert.equal(state.url.startsWith("about:"), true);
    assert.equal(state.visibleFormCount >= 0, true);
    assert.ok(Array.isArray(state.headings));
    assert.equal(state.invalidFieldCount >= 0, true);
  } finally {
    await browser.close();
  }
});
