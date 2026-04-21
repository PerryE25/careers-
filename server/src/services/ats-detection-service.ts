import type { AtsProvider } from "../domain/models.js";

type DetectionMethod = "url-pattern" | "html-marker" | "heuristic" | "fallback";

export interface AtsDetectionResult {
  provider: AtsProvider;
  confidence: number;
  reason: string;
  canonicalUrl: string;
  normalizedUrl: string;
  method: DetectionMethod;
}

interface DetectionContext {
  originalUrl: string;
  url: URL;
  html?: string;
}

interface ProviderDetectionRule {
  provider: AtsProvider;
  canonicalize(url: URL): URL;
  detectByUrl(context: DetectionContext): AtsDetectionResult | null;
  detectByHtml(context: DetectionContext): AtsDetectionResult | null;
  detectByHeuristic(context: DetectionContext): AtsDetectionResult | null;
}

const TRACKING_PARAMS = new Set([
  "gh_src",
  "lever-origin",
  "lever-source",
  "source",
  "src",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "mode",
  "codes",
]);

export function cleanUrl(input: string) {
  const url = new URL(input);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  const params = new URLSearchParams(url.search);
  for (const key of Array.from(params.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      params.delete(key);
    }
  }
  url.search = params.toString() ? `?${params.toString()}` : "";
  url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return url;
}

function makeResult(
  provider: AtsProvider,
  confidence: number,
  canonicalUrl: string,
  reason: string,
  method: DetectionMethod,
): AtsDetectionResult {
  return {
    provider,
    confidence,
    canonicalUrl,
    normalizedUrl: canonicalUrl,
    reason,
    method,
  };
}

function candidateSegments(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function includesAny(value: string, needles: string[]) {
  const lower = value.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

class LeverDetectionRule implements ProviderDetectionRule {
  provider = "lever" as const;

  canonicalize(url: URL) {
    const normalized = new URL(url.toString());
    const segments = candidateSegments(normalized.pathname);

    if (normalized.hostname.endsWith("jobs.lever.co") && segments.length >= 2) {
      normalized.pathname = `/${segments[0]}/${segments[1]}`;
    } else if (normalized.hostname.endsWith("lever.co")) {
      const applyIndex = segments.findIndex((segment) => segment === "apply");
      if (applyIndex > 0) {
        normalized.pathname = `/${segments.slice(0, applyIndex).join("/")}`;
      } else if (segments.length >= 2 && segments[0] === "jobs") {
        normalized.pathname = `/${segments.slice(0, 2).join("/")}`;
      }
    }

    normalized.search = "";
    normalized.hash = "";
    return normalized;
  }

  detectByUrl(context: DetectionContext) {
    const host = context.url.hostname;
    const path = context.url.pathname.toLowerCase();

    if (host.endsWith("jobs.lever.co")) {
      return makeResult(
        this.provider,
        0.99,
        this.canonicalize(context.url).toString(),
        `Matched Lever hosted jobs domain: ${host}.`,
        "url-pattern",
      );
    }

    if (host.includes("lever.co") && includesAny(path, ["/jobs/", "/apply"])) {
      return makeResult(
        this.provider,
        0.96,
        this.canonicalize(context.url).toString(),
        `Matched Lever URL path pattern: ${path}.`,
        "url-pattern",
      );
    }

    return null;
  }

  detectByHtml(context: DetectionContext) {
    const html = context.html?.toLowerCase();
    if (!html) {
      return null;
    }

    if (
      includesAny(html, [
        'class="application-page"',
        'data-qa="btn-apply-bottom"',
        "jobs.lever.co",
        "lever-analytics",
      ])
    ) {
      return makeResult(
        this.provider,
        0.92,
        this.canonicalize(context.url).toString(),
        "Matched Lever HTML markers.",
        "html-marker",
      );
    }

    return null;
  }

  detectByHeuristic(context: DetectionContext) {
    const host = context.url.hostname;
    const path = context.url.pathname.toLowerCase();
    if (host.includes("lever") || includesAny(path, ["lever", "postings"])) {
      return makeResult(
        this.provider,
        0.72,
        this.canonicalize(context.url).toString(),
        "Lever heuristic matched host/path tokens.",
        "heuristic",
      );
    }
    return null;
  }
}

class GreenhouseDetectionRule implements ProviderDetectionRule {
  provider = "greenhouse" as const;

  canonicalize(url: URL) {
    const normalized = new URL(url.toString());
    const segments = candidateSegments(normalized.pathname);
    const jobIndex = segments.findIndex((segment) => segment === "jobs" || segment === "job");
    const greenhouseJobId = normalized.searchParams.get("gh_jid");

    if (jobIndex >= 0 && segments[jobIndex + 1]) {
      const company = segments[jobIndex - 1] ?? segments[0];
      const jobId = segments[jobIndex + 1];
      normalized.pathname = `/${company}/jobs/${jobId}`;
      normalized.search = "";
    } else if (greenhouseJobId) {
      normalized.search = `?gh_jid=${encodeURIComponent(greenhouseJobId)}`;
    } else {
      normalized.search = "";
    }

    normalized.hash = "";
    return normalized;
  }

  detectByUrl(context: DetectionContext) {
    const host = context.url.hostname;
    const path = context.url.pathname.toLowerCase();
    const greenhouseJobId = context.url.searchParams.get("gh_jid");

    if (
      host.endsWith("greenhouse.io") &&
      (includesAny(host, ["boards.", "job-boards."]) || includesAny(path, ["/jobs/", "/job/"]))
    ) {
      return makeResult(
        this.provider,
        0.99,
        this.canonicalize(context.url).toString(),
        `Matched Greenhouse host/path pattern: ${host}${path}.`,
        "url-pattern",
      );
    }

    if (greenhouseJobId) {
      return makeResult(
        this.provider,
        0.95,
        this.canonicalize(context.url).toString(),
        `Matched Greenhouse job query parameter gh_jid=${greenhouseJobId}.`,
        "url-pattern",
      );
    }

    return null;
  }

  detectByHtml(context: DetectionContext) {
    const html = context.html?.toLowerCase();
    if (!html) {
      return null;
    }

    if (
      includesAny(html, [
        'id="app_body"',
        "boards.greenhouse.io",
        "greenhouse.io/embed/job_board",
        'name="application[resume]"',
      ])
    ) {
      return makeResult(
        this.provider,
        0.93,
        this.canonicalize(context.url).toString(),
        "Matched Greenhouse HTML markers.",
        "html-marker",
      );
    }

    return null;
  }

  detectByHeuristic(context: DetectionContext) {
    const host = context.url.hostname;
    const path = context.url.pathname.toLowerCase();
    if (host.includes("greenhouse") || includesAny(path, ["greenhouse", "job_board"])) {
      return makeResult(
        this.provider,
        0.74,
        this.canonicalize(context.url).toString(),
        "Greenhouse heuristic matched host/path tokens.",
        "heuristic",
      );
    }
    return null;
  }
}

class WorkdayDetectionRule implements ProviderDetectionRule {
  provider = "workday" as const;

  canonicalize(url: URL) {
    const normalized = new URL(url.toString());
    const segments = candidateSegments(normalized.pathname);
    const recruitingIndex = segments.findIndex((segment) => segment.toLowerCase() === "recruiting");
    const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === "job");

    if (recruitingIndex >= 0 && jobIndex > recruitingIndex && segments.length >= jobIndex + 2) {
      normalized.pathname = `/${segments.slice(0, Math.min(segments.length, jobIndex + 3)).join("/")}`;
    } else if (jobIndex >= 0 && segments.length >= jobIndex + 2) {
      const kept = segments.slice(0, Math.min(segments.length, jobIndex + 3));
      normalized.pathname = `/${kept.join("/")}`;
    }

    normalized.search = "";
    normalized.hash = "";
    return normalized;
  }

  detectByUrl(context: DetectionContext) {
    const host = context.url.hostname;
    const path = context.url.pathname.toLowerCase();

    if (
      host.includes("myworkdayjobs.com") ||
      host.includes("myworkdaysite.com") ||
      includesAny(path, ["/recruiting/", "/job/", "/job_application/"])
    ) {
      return makeResult(
        this.provider,
        0.97,
        this.canonicalize(context.url).toString(),
        `Matched Workday host/path pattern: ${host}${path}.`,
        "url-pattern",
      );
    }

    return null;
  }

  detectByHtml(context: DetectionContext) {
    const html = context.html?.toLowerCase();
    if (!html) {
      return null;
    }

    if (
      includesAny(html, [
        "workday",
        'data-automation-id="applymanually"',
        'data-automation-id="jobpostingheader"',
        "wd-application",
      ])
    ) {
      return makeResult(
        this.provider,
        0.9,
        this.canonicalize(context.url).toString(),
        "Matched Workday HTML markers.",
        "html-marker",
      );
    }

    return null;
  }

  detectByHeuristic(context: DetectionContext) {
    const host = context.url.hostname;
    const path = context.url.pathname.toLowerCase();
    if (host.includes("workday") || includesAny(path, ["requisition", "job_application"])) {
      return makeResult(
        this.provider,
        0.7,
        this.canonicalize(context.url).toString(),
        "Workday heuristic matched host/path tokens.",
        "heuristic",
      );
    }
    return null;
  }
}

const DETECTION_RULES: ProviderDetectionRule[] = [
  new LeverDetectionRule(),
  new GreenhouseDetectionRule(),
  new WorkdayDetectionRule(),
];

function pickBestResult(results: AtsDetectionResult[]) {
  return results.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

export class AtsDetectionService {
  detect(input: string, html?: string): AtsDetectionResult {
    const cleanedUrl = cleanUrl(input);
    const context: DetectionContext = {
      originalUrl: input,
      url: cleanedUrl,
      html,
    };

    const urlMatches = DETECTION_RULES
      .map((rule) => rule.detectByUrl(context))
      .filter((result): result is AtsDetectionResult => Boolean(result));
    const urlMatch = pickBestResult(urlMatches);
    if (urlMatch) {
      return urlMatch;
    }

    const htmlMatches = DETECTION_RULES
      .map((rule) => rule.detectByHtml(context))
      .filter((result): result is AtsDetectionResult => Boolean(result));
    const htmlMatch = pickBestResult(htmlMatches);
    if (htmlMatch) {
      return htmlMatch;
    }

    const heuristicMatches = DETECTION_RULES
      .map((rule) => rule.detectByHeuristic(context))
      .filter((result): result is AtsDetectionResult => Boolean(result));
    const heuristicMatch = pickBestResult(heuristicMatches);
    if (heuristicMatch) {
      return heuristicMatch;
    }

    return makeResult(
      "unknown",
      0.2,
      cleanedUrl.toString(),
      "No ATS-specific URL patterns, HTML markers, or fallback heuristics matched.",
      "fallback",
    );
  }
}
