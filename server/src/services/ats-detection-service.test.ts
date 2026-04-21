import test from "node:test";
import assert from "node:assert/strict";
import { AtsDetectionService } from "./ats-detection-service.js";

const service = new AtsDetectionService();

test("detects Lever from hosted jobs domain and canonicalizes apply URLs", () => {
  const result = service.detect(
    "https://jobs.lever.co/acme/12345678-aaaa-bbbb-cccc-1234567890ab/apply?lever-source=LinkedIn&utm_source=test",
  );

  assert.equal(result.provider, "lever");
  assert.equal(
    result.canonicalUrl,
    "https://jobs.lever.co/acme/12345678-aaaa-bbbb-cccc-1234567890ab",
  );
  assert.equal(result.normalizedUrl, result.canonicalUrl);
  assert.equal(result.method, "url-pattern");
  assert.match(result.reason, /lever/i);
});

test("canonicalizes custom Lever paths by trimming trailing apply segments", () => {
  const result = service.detect(
    "https://www.lever.co/jobs/acme/platform-engineer/apply?lever-origin=linkedin#top",
  );

  assert.equal(result.provider, "lever");
  assert.equal(result.canonicalUrl, "https://lever.co/jobs/acme/platform-engineer");
  assert.equal(result.normalizedUrl, result.canonicalUrl);
});

test("detects Greenhouse across common boards path variants", () => {
  const result = service.detect(
    "https://boards.greenhouse.io/acme/jobs/7654321?gh_src=something",
  );

  assert.equal(result.provider, "greenhouse");
  assert.equal(result.canonicalUrl, "https://boards.greenhouse.io/acme/jobs/7654321");
  assert.equal(result.method, "url-pattern");
});

test("detects custom Greenhouse career pages from gh_jid query params", () => {
  const result = service.detect(
    "https://bolt.eu/en/careers/positions/8488707002/?gh_jid=8488707002",
  );

  assert.equal(result.provider, "greenhouse");
  assert.equal(result.canonicalUrl, "https://bolt.eu/en/careers/positions/8488707002?gh_jid=8488707002");
  assert.equal(result.method, "url-pattern");
});

test("detects Greenhouse from HTML markers when URL is custom", () => {
  const result = service.detect(
    "https://careers.acme.com/open-roles/data-engineer",
    `
      <html>
        <body id="app_body">
          <form>
            <input name="application[resume]" />
          </form>
        </body>
      </html>
    `,
  );

  assert.equal(result.provider, "greenhouse");
  assert.equal(result.method, "html-marker");
  assert.match(result.reason, /html markers/i);
});

test("detects Workday across recruiting path variants and strips tracking params", () => {
  const result = service.detect(
    "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Chicago-IL/Data-Engineer_JR-12345?source=jobboard",
  );

  assert.equal(result.provider, "workday");
  assert.equal(
    result.canonicalUrl,
    "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Chicago-IL/Data-Engineer_JR-12345",
  );
  assert.equal(result.method, "url-pattern");
});

test("falls back to unknown safely for unsupported/custom sites", () => {
  const result = service.detect("https://example.com/careers/senior-engineer?utm_source=test");

  assert.equal(result.provider, "unknown");
  assert.equal(result.canonicalUrl, "https://example.com/careers/senior-engineer");
  assert.equal(result.method, "fallback");
  assert.match(result.reason, /no ats-specific/i);
});

test("normalizes fallback URLs by stripping fragments, www, tracking params, and duplicate slashes", () => {
  const result = service.detect(
    "https://www.example.com/careers//data-engineer/?utm_medium=email&src=newsletter#apply",
  );

  assert.equal(result.provider, "unknown");
  assert.equal(result.canonicalUrl, "https://example.com/careers/data-engineer");
});

test("canonicalizes Workday URLs consistently across apply and tracking variants", () => {
  const result = service.detect(
    "https://acme.wd5.myworkdayjobs.com/en-US/recruiting/acme/External/job/Chicago/Data-Engineer_JR-12345/apply?source=Indeed&codes=abc#top",
  );

  assert.equal(result.provider, "workday");
  assert.equal(
    result.canonicalUrl,
    "https://acme.wd5.myworkdayjobs.com/en-US/recruiting/acme/External/job/Chicago/Data-Engineer_JR-12345",
  );
  assert.equal(result.normalizedUrl, result.canonicalUrl);
});
