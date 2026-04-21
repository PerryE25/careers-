import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchActiveBatch,
  fetchApplications,
  fetchBatch,
  fetchJobTargets,
  fetchProfile,
  importJobTargets,
  startApplications,
  type AutomationBatch,
  type JobTargetSummary,
  type ProfileReadiness,
  type TrackerStats,
} from "../lib/api";

const providerIcons: Record<string, string> = {
  lever: "🎯",
  greenhouse: "🌱",
  workday: "💼",
  unknown: "📄",
};

const emptyStats: TrackerStats = {
  totalApplications: 0,
  notStarted: 0,
  inProgress: 0,
  applied: 0,
  needsReview: 0,
  failed: 0,
  duplicate: 0,
};

const TARGETING_SUMMARY =
  "Software engineering · Full-time · New grad / entry-level · Start date Dec 2026 to Jan 2027";

export function Home() {
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [jobType, setJobType] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [batch, setBatch] = useState<AutomationBatch | null>(null);
  const [trackerStats, setTrackerStats] = useState<TrackerStats>(emptyStats);
  const [jobTargets, setJobTargets] = useState<JobTargetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<{
    hasResumeText: boolean;
    hasAutofillText: boolean;
    readiness: ProfileReadiness | null;
  }>({
    hasResumeText: false,
    hasAutofillText: false,
    readiness: null,
  });

  const filteredJobListings = jobTargets.filter((job) => {
    const matchesTitle =
      !jobTitle ||
      `${job.title ?? ""} ${job.company ?? ""}`
        .toLowerCase()
        .includes(jobTitle.toLowerCase());

    const matchesLocation =
      !location ||
      (job.location ?? "").toLowerCase().includes(location.toLowerCase());

    const matchesType =
      !jobType ||
      (job.location ?? "").toLowerCase().includes(jobType.toLowerCase());

    return matchesTitle && matchesLocation && matchesType;
  });

  useEffect(() => {
    let active = true;

    const loadInitialState = async () => {
      try {
        const [
          profileResult,
          applicationsResult,
          activeBatchResult,
          targetsResult,
        ] = await Promise.all([
          fetchProfile(),
          fetchApplications(),
          fetchActiveBatch(),
          fetchJobTargets(),
        ]);

        if (!active) return;

        setProfileStatus({
          hasResumeText: profileResult.readiness.hasResumeText,
          hasAutofillText: profileResult.readiness.hasAutofillText,
          readiness: profileResult.readiness,
        });

        setTrackerStats(applicationsResult.stats);
        setBatch(activeBatchResult.batch);
        setJobTargets(targetsResult.targets);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load home page state.",
          );
        }
      }
    };

    void loadInitialState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!batch || batch.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void Promise.all([fetchBatch(batch.id), fetchApplications()])
        .then(([batchResult, applicationsResult]) => {
          setBatch(batchResult.batch);
          setTrackerStats(applicationsResult.stats);

          if (batchResult.batch?.status === "completed") {
            setInfo("Auto-apply run finished. Tracker records are up to date.");
          } else if (batchResult.batch?.status === "failed") {
            setError(batchResult.batch.lastError ?? "Auto-apply run failed to start.");
          }
        })
        .catch((pollError) => {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Failed to refresh automation status.",
          );
        });
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [batch]);

  const counts = batch?.stats ?? trackerStats;

  const handleStartApplying = async () => {
    setIsStarting(true);
    setError(null);
    setInfo(null);

    try {
      const profileResult = await fetchProfile();

      setProfileStatus({
        hasResumeText: profileResult.readiness.hasResumeText,
        hasAutofillText: profileResult.readiness.hasAutofillText,
        readiness: profileResult.readiness,
      });

      let targets = filteredJobListings;

      try {
        const imported = await importJobTargets();
        setJobTargets(imported.targets);
        targets = imported.targets;

        if (imported.importedCount > 0) {
          setInfo(
            `Synced ${imported.importedCount} saved job targets from ${imported.sourceFileName}.`,
          );
        }
      } catch (importError) {
        if (targets.length === 0) {
          throw importError;
        }
      }

      const targetUrls = targets.map((job) => job.sourceUrl).filter(Boolean);

      if (targetUrls.length === 0) {
        throw new Error(
          "No saved job targets are available yet. Add `public/autofill/job-targets.json` or sync your Lever/Greenhouse targets first.",
        );
      }

      const result = await startApplications(targetUrls);
      setBatch(result.batch);
      setTrackerStats(result.batch.stats);
      setInfo(
        `Started automation for ${result.batch.total} saved job targets.`,
      );
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to start automation.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <button
        onClick={() => void handleStartApplying()}
        disabled={isStarting || batch?.status === "running"}
        className="w-full bg-gradient-to-r from-[#f0f4ff] to-[#faf5ff] rounded-2xl p-6 mb-6 border border-[#e0e7ff] hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#6366f1] rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1">
            <h1 className="mb-1">1-Click Action with Copilot</h1>
            <p className="text-sm text-muted-foreground">
              Automatically apply to software engineering jobs or autofill applications instantly
            </p>
            <p className="mt-2 text-xs font-medium text-[#4f46e5]">
              {TARGETING_SUMMARY}
            </p>
            <p className="mt-3 text-sm font-medium text-[#4338ca]">
              {isStarting
                ? "Starting your saved auto-apply workflow..."
                : batch?.status === "running"
                  ? "Auto-apply is running. Tracker records are updating in real time."
                  : jobTargets.length > 0
                    ? `Start applying with ${jobTargets.length} saved job targets and your saved profile.`
                    : "Save your profile and sync job targets to start applying."}
            </p>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Queued", value: batch?.status === "running" ? batch.queued : 0 },
          { label: "In Progress", value: counts.inProgress },
          { label: "Applied", value: counts.applied },
          { label: "Needs review", value: counts.needsReview },
          { label: "Failed", value: counts.failed + (batch?.failedToStart ?? 0) },
          { label: "Duplicate", value: counts.duplicate },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-semibold">{item.value}</p>
          </div>
        ))}
      </div>

      {(error || info) && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-[#c7d2fe] bg-[#eef2ff] text-[#3730a3]"
          }`}
        >
          {error ?? info}
        </div>
      )}

      {profileStatus.readiness?.issues?.[0] && !error && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {profileStatus.readiness.issues[0].actionableMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <p className="text-muted-foreground">Saved resume text</p>
          <p className={profileStatus.hasResumeText ? "text-[#166534]" : "text-[#b45309]"}>
            {profileStatus.hasResumeText ? "Ready" : "Missing"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <p className="text-muted-foreground">Saved autofill text</p>
          <p className={profileStatus.hasAutofillText ? "text-[#166534]" : "text-[#b45309]"}>
            {profileStatus.hasAutofillText ? "Ready" : "Missing"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <p className="text-muted-foreground">Profile source of truth</p>
          <p className="text-foreground">
            {profileStatus.readiness?.usesAutofillAsSourceOfTruth
              ? "Autofill answers + master resume text"
              : "Unavailable"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <p className="text-muted-foreground">Imported job targets</p>
          <p className="text-foreground">{jobTargets.length}</p>
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <p className="text-muted-foreground">Targeting</p>
          <p className="text-foreground">SWE full-time · Dec 2026–Jan 2027</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Job Title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          />
          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          />
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          >
            <option value="">Job Type</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredJobListings.map((job) => (
          <div
            key={job.id}
            className="bg-white rounded-xl border border-border p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">{providerIcons[job.provider] ?? providerIcons.unknown}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  {job.company ?? "Unknown company"}
                </p>
                <h3 className="text-sm font-semibold truncate">{job.title ?? "Untitled role"}</h3>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded text-xs">
                {job.location ?? "Unknown"}
              </span>
              <span className="px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded text-xs capitalize">
                {job.provider}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Relevance score {job.relevanceScore}. Saved from your synced job targets.
            </p>

            <div className="flex gap-2">
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 px-3 py-2 bg-white border border-[#6366f1] text-[#6366f1] rounded-lg hover:bg-[#f0f4ff] transition-colors text-sm text-center"
              >
                Open Job
              </a>
              <button className="flex-1 px-3 py-2 bg-white border border-border text-foreground rounded-lg hover:bg-[#f9fafb] transition-colors text-sm">
                Queue Ready
              </button>
            </div>
          </div>
        ))}

        {filteredJobListings.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No saved job targets are available yet. Add `public/autofill/job-targets.json` or
            sync your Lever or Greenhouse targets and Careers+ will queue them automatically.
          </div>
        )}
      </div>
    </div>
  );
}
