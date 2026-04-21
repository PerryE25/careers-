import path from "node:path";
import { DEFAULT_AUTOMATION_USER_AGENT, DEFAULT_AUTOMATION_VIEWPORT } from "./browser-defaults.js";

const rootDir = process.cwd();

function parseViewport(raw: string | undefined): { width: number; height: number } | undefined {
  if (!raw?.includes("x")) {
    return undefined;
  }
  const [wPart, hPart] = raw.split("x", 2);
  const width = Number.parseInt(wPart.trim(), 10);
  const height = Number.parseInt(hPart.trim(), 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240) {
    return undefined;
  }
  return { width, height };
}

const slowMoParsed = Number.parseInt(process.env.BROWSER_SLOW_MO_MS ?? "0", 10);
const browserSlowMoMs = Number.isFinite(slowMoParsed) && slowMoParsed > 0 ? slowMoParsed : 0;

export const env = {
  port: Number(process.env.PORT ?? 4000),
  dataFile: process.env.DATA_FILE ?? path.join(rootDir, "data", "careercopilot-db.json"),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(rootDir, "data", "uploads"),
  screenshotsDir: process.env.SCREENSHOTS_DIR ?? path.join(rootDir, "data", "screenshots"),
  /** When `false`, run Chromium with a visible window (set env `BROWSER_HEADLESS=false`). Default: headless. */
  browserHeadless: process.env.BROWSER_HEADLESS !== "false",
  /** Milliseconds between Playwright actions for debugging (env `BROWSER_SLOW_MO_MS`, e.g. `250`). `0` = off. */
  browserSlowMoMs,
  /** Full UA string; override with `BROWSER_USER_AGENT` if a site is picky. */
  browserUserAgent: process.env.BROWSER_USER_AGENT?.trim() || DEFAULT_AUTOMATION_USER_AGENT,
  /** Viewport `WIDTHxHEIGHT` (e.g. `1920x1080`). Default matches `DEFAULT_AUTOMATION_VIEWPORT`. */
  browserViewport: parseViewport(process.env.BROWSER_VIEWPORT) ?? DEFAULT_AUTOMATION_VIEWPORT,
};
