import test from "node:test";
import assert from "node:assert/strict";
import { analyzeContentForAccessBlock } from "./page-access-guard.js";

test("detects Cloudflare-style challenge copy", () => {
  const hit = analyzeContentForAccessBlock(
    "Checking your browser before accessing boards.example.com.",
    "Just a moment...",
  );
  assert.equal(hit.blocked, true);
  assert.ok(hit.matched);
});

test("does not flag a normal job description mentioning challenges", () => {
  const ok = analyzeContentForAccessBlock(
    "We value engineers who love a technical challenge and shipping quality software.",
    "Software Engineer — Acme",
  );
  assert.equal(ok.blocked, false);
});
