import type { Page } from "playwright";
import type { AutomationContext } from "../adapter.js";
import { clickWhenReady, waitForAnyVisible, waitForAsyncValidation, waitForPageReady } from "./playwright-utils.js";

const GUEST_APPLY_SELECTORS = [
  "button:has-text('Apply as guest')",
  "a:has-text('Apply as guest')",
  "button:has-text('Continue without account')",
  "a:has-text('Continue without account')",
  "button:has-text('Continue as guest')",
  "a:has-text('Continue as guest')",
  "button:has-text('Apply without account')",
  "a:has-text('Apply without account')",
  "button:has-text('Guest apply')",
  "a:has-text('Guest apply')",
];

const AUTH_URL_MARKERS = ["/login", "/log-in", "/signin", "/sign-in", "/auth", "/sso", "/oauth", "/account"];
const AUTH_TEXT_PATTERN =
  /\b(sign in|log in|login|create account|create an account|single sign-on|sso|continue with google|continue with linkedin|continue with microsoft|continue with email|continue with sso|existing account|work email|okta)\b/i;
const GUEST_TEXT_PATTERN =
  /\b(apply as guest|continue without account|continue as guest|apply without account|guest apply)\b/i;

interface LoginFirstSnapshot {
  url: string;
  title?: string;
  headings: string[];
  controls: string[];
  hasVisibleFormRoot: boolean;
}

interface LoginFirstAnalysis {
  detected: boolean;
  guestOptions: string[];
  matchedSignals: string[];
  snapshot: LoginFirstSnapshot;
}

export interface LoginFirstApplyConfig {
  provider: "lever" | "greenhouse";
  supportedUrlShape: string;
  formRootSelectors: string[];
  /**
   * When any of these are visible, the page likely still shows normal job-posting chrome.
   * In that case we do not treat “two generic auth nav controls” alone as a login-first wall,
   * avoiding false positives (e.g. Sign in + Create account) before Apply is clicked.
   */
  postingSurfaceSelectors?: string[];
}

export class LoginFirstLayoutUnsupportedError extends Error {
  readonly code = "login_first_layout_unsupported" as const;
  readonly provider: LoginFirstApplyConfig["provider"];
  readonly url: string;
  readonly requiredUrlShape: string;
  readonly headings: string[];
  readonly controls: string[];
  readonly matchedSignals: string[];

  constructor(input: {
    provider: LoginFirstApplyConfig["provider"];
    url: string;
    requiredUrlShape: string;
    headings: string[];
    controls: string[];
    matchedSignals: string[];
  }) {
    super(
      `${toProviderLabel(input.provider)} opened a login-first application flow. ` +
        `SSO login is not supported. Open a direct guest application URL shaped like ${input.requiredUrlShape}.`,
    );
    this.name = "LoginFirstLayoutUnsupportedError";
    this.provider = input.provider;
    this.url = input.url;
    this.requiredUrlShape = input.requiredUrlShape;
    this.headings = input.headings;
    this.controls = input.controls;
    this.matchedSignals = input.matchedSignals;
  }
}

export async function handleLoginFirstApplyLayout(
  page: Page,
  context: AutomationContext,
  config: LoginFirstApplyConfig,
) {
  const initial = await analyzeLoginFirstLayout(page, config);
  if (!initial.detected) {
    return false;
  }

  const clickedGuestApply = await clickVisibleGuestApply(page);
  if (clickedGuestApply) {
    context.logger?.info("Resolved login-first apply wall via guest flow.", {
      provider: config.provider,
      url: initial.snapshot.url,
      guestOptions: initial.guestOptions,
      matchedSignals: initial.matchedSignals,
    });
    await waitForPageReady(page);
    await waitForAnyVisible(page, config.formRootSelectors, 4000);
    await waitForAsyncValidation(page);

    const afterGuestClick = await analyzeLoginFirstLayout(page, config);
    if (!afterGuestClick.detected || afterGuestClick.snapshot.hasVisibleFormRoot) {
      return true;
    }

    throw toUnsupportedError(config, afterGuestClick);
  }

  throw toUnsupportedError(config, initial);
}

async function analyzeLoginFirstLayout(page: Page, config: LoginFirstApplyConfig): Promise<LoginFirstAnalysis> {
  const snapshot = await collectSnapshot(page, config.formRootSelectors);
  if (snapshot.hasVisibleFormRoot) {
    return {
      detected: false,
      guestOptions: [],
      matchedSignals: [],
      snapshot,
    };
  }

  const normalizedUrl = snapshot.url.toLowerCase();
  const headingTexts = [snapshot.title ?? "", ...snapshot.headings].map((text) => normalizeText(text)).filter(Boolean);
  const controlTexts = snapshot.controls.map((text) => normalizeText(text)).filter(Boolean);

  const urlSignals = AUTH_URL_MARKERS.filter((marker) => normalizedUrl.includes(marker));
  const headingSignals = headingTexts.filter((text) => AUTH_TEXT_PATTERN.test(text));
  const authControls = controlTexts.filter((text) => AUTH_TEXT_PATTERN.test(text) && !GUEST_TEXT_PATTERN.test(text));
  const guestOptions = controlTexts.filter((text) => GUEST_TEXT_PATTERN.test(text));

  const postingSurfaceVisible =
    config.postingSurfaceSelectors && config.postingSurfaceSelectors.length > 0
      ? await hasAnyVisible(page, config.postingSurfaceSelectors)
      : false;

  const matchedSignals = [
    ...urlSignals.map((value) => `url:${value}`),
    ...headingSignals.map((value) => `heading:${value}`),
    ...authControls.map((value) => `control:${value}`),
  ];

  const authChromeOnlyWall = authControls.length >= 2 && !postingSurfaceVisible;

  const detected =
    urlSignals.length > 0 ||
    headingSignals.length > 0 ||
    authChromeOnlyWall ||
    (authControls.length >= 1 && guestOptions.length >= 1);

  return {
    detected,
    guestOptions,
    matchedSignals,
    snapshot,
  };
}

async function collectSnapshot(page: Page, formRootSelectors: string[]): Promise<LoginFirstSnapshot> {
  const [title, headings, controls, hasVisibleFormRoot] = await Promise.all([
    page.title().catch(() => undefined),
    collectVisibleHeadingTexts(page),
    collectVisibleControlTexts(page),
    hasAnyVisible(page, formRootSelectors),
  ]);

  return {
    url: page.url(),
    title,
    headings,
    controls,
    hasVisibleFormRoot,
  };
}

async function hasAnyVisible(page: Page, selectors: string[]) {
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

async function clickVisibleGuestApply(page: Page) {
  for (const selector of GUEST_APPLY_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      continue;
    }
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    if (await clickWhenReady(locator)) {
      return true;
    }
  }
  return false;
}

async function collectVisibleControlTexts(page: Page) {
  const locator = page.locator("button, a, input[type='button'], input[type='submit'], [role='button']");
  const count = await locator.count().catch(() => 0);
  const texts: string[] = [];

  for (let index = 0; index < count && texts.length < 16; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    const value =
      (await candidate.textContent().catch(() => null)) ??
      (await candidate.getAttribute("aria-label").catch(() => null)) ??
      (await candidate.getAttribute("title").catch(() => null)) ??
      (await candidate.getAttribute("value").catch(() => null)) ??
      "";
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) {
      texts.push(normalized);
    }
  }

  return texts;
}

async function collectVisibleHeadingTexts(page: Page) {
  const locator = page.locator("h1, h2, h3, [role='heading']");
  const count = await locator.count().catch(() => 0);
  const texts: string[] = [];

  for (let index = 0; index < count && texts.length < 8; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    const value =
      (await candidate.textContent().catch(() => null)) ??
      (await candidate.getAttribute("aria-label").catch(() => null)) ??
      (await candidate.getAttribute("title").catch(() => null)) ??
      "";
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) {
      texts.push(normalized);
    }
  }

  return texts;
}

function toUnsupportedError(config: LoginFirstApplyConfig, analysis: LoginFirstAnalysis) {
  return new LoginFirstLayoutUnsupportedError({
    provider: config.provider,
    url: analysis.snapshot.url,
    requiredUrlShape: config.supportedUrlShape,
    headings: analysis.snapshot.headings,
    controls: analysis.snapshot.controls,
    matchedSignals: analysis.matchedSignals,
  });
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toProviderLabel(provider: LoginFirstApplyConfig["provider"]) {
  return provider === "lever" ? "Lever" : "Greenhouse";
}
