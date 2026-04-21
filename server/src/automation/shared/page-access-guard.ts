import type { Page } from "playwright";

/** Thrown when the loaded page looks like Cloudflare, a WAF, or a hard access denial instead of the ATS. */
export class PageAccessBlockedError extends Error {
  readonly code = "access_blocked" as const;
  readonly matched: string;

  constructor(matched: string, message?: string) {
    super(message ?? `Page appears blocked or behind bot protection (${matched}).`);
    this.name = "PageAccessBlockedError";
    this.matched = matched;
  }
}

const BODY_MARKERS = [
  "checking your browser before accessing",
  "just a moment",
  "ddos protection by cloudflare",
  "cloudflare ray id",
  "why have i been blocked",
  "sorry, you have been blocked",
  "needs to review the security of your connection",
  "verify you are human",
  "enable javascript and cookies to continue",
  "attention required! | cloudflare",
  "error 1020",
  "access denied",
  "request blocked",
  "forbidden: you don't have permission",
] as const;

/** Unit-testable heuristic on visible text + title. */
export function analyzeContentForAccessBlock(bodyText: string, title: string): { blocked: boolean; matched?: string } {
  const combined = `${title}\n${bodyText}`.toLowerCase();
  for (const marker of BODY_MARKERS) {
    if (combined.includes(marker)) {
      return { blocked: true, matched: marker };
    }
  }
  return { blocked: false };
}

/**
 * After navigation, fail fast if the document looks like a challenge or access denial
 * so adapters do not sit on selector timeouts.
 */
export async function assertPageNotAccessBlocked(page: Page): Promise<void> {
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 8_000 }).catch(() => "");
  const fromText = analyzeContentForAccessBlock(bodyText, title);
  if (fromText.blocked && fromText.matched) {
    throw new PageAccessBlockedError(fromText.matched);
  }

  const hasCfChallengeMarkup = await page
    .evaluate(() => {
      const html = document.documentElement.innerHTML.toLowerCase();
      return html.includes("cdn-cgi/challenge") || html.includes("cf-browser-verification");
    })
    .catch(() => false);

  if (hasCfChallengeMarkup) {
    const combined = `${title}\n${bodyText}`.toLowerCase();
    const thinContent = combined.replace(/\s+/g, " ").trim().length < 400;
    if (thinContent || combined.includes("cloudflare")) {
      throw new PageAccessBlockedError("cloudflare_challenge_markup");
    }
  }
}
