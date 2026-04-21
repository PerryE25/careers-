import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
/** `server/src` -> `server` -> repo root */
const repoRoot = path.resolve(thisDir, "..", "..");

export const DEBUG_AGENT_LOG_PATH = path.join(repoRoot, "debug-bd917f.log");

const INGEST_ENDPOINT = "http://127.0.0.1:7586/ingest/42f0cd71-cff6-4e86-816d-6827a67f6387";

function appendNdjsonLine(line: string) {
  const targets = [DEBUG_AGENT_LOG_PATH, path.join(process.cwd(), "debug-bd917f.log")];
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, line, "utf8");
      return;
    } catch {
      // try alternate path (cwd may differ from repo root when the server is spawned)
    }
  }
}

export function agentDebugLog(entry: { location: string; message: string; data: Record<string, unknown> }) {
  const payload = { sessionId: "bd917f", ...entry, timestamp: Date.now() };
  appendNdjsonLine(`${JSON.stringify(payload)}\n`);
  fetch(INGEST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bd917f" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
