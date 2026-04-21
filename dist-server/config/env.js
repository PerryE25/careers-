import path from "node:path";
const rootDir = process.cwd();
export const env = {
    port: Number(process.env.PORT ?? 4000),
    dataFile: process.env.DATA_FILE ?? path.join(rootDir, "data", "careercopilot-db.json"),
    uploadsDir: process.env.UPLOADS_DIR ?? path.join(rootDir, "data", "uploads"),
    screenshotsDir: process.env.SCREENSHOTS_DIR ?? path.join(rootDir, "data", "screenshots"),
    browserHeadless: process.env.BROWSER_HEADLESS !== "false",
};
