import { FileText, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchProfile,
  importProfileText,
  updateSubmitMode,
  uploadResumeFile,
  type SubmitMode,
} from "../lib/api";

export function UploadResume() {
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<{
    isLoading: boolean;
    message?: string;
    error?: string;
  }>({ isLoading: false });

  const [resumeText, setResumeText] = useState("");
  const [autofillText, setAutofillText] = useState("");
  const [submitMode, setSubmitMode] = useState<SubmitMode>("auto");
  const [autoSubmitConfidenceThreshold, setAutoSubmitConfidenceThreshold] = useState("0.85");
  const [isPreloading, setIsPreloading] = useState(true);

  useEffect(() => {
    const preloadProfileText = async () => {
      try {
        const profileResult = await fetchProfile();
        if (profileResult.profile) {
          setResumeText(profileResult.profile.resumeText ?? "");
          setAutofillText(profileResult.profile.autofillText ?? "");
          setSubmitMode("auto");
          setAutoSubmitConfidenceThreshold(
            String(profileResult.profile.autoSubmitConfidenceThreshold ?? 0.85),
          );
        }
      } catch (error) {
        setUploadState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Failed to load saved profile text.",
        }));
      } finally {
        setIsPreloading(false);
      }
    };

    void preloadProfileText();
  }, []);

  const handleFile = async (file: File) => {
    try {
      setUploadState({ isLoading: true, message: undefined, error: undefined });
      const result = await uploadResumeFile(file);
      setUploadState({
        isLoading: false,
        message: `Saved ${result.document.fileName} as your current resume source.`,
      });
    } catch (error) {
      setUploadState({
        isLoading: false,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  };

  const handleProfileSave = async () => {
    try {
      setUploadState({ isLoading: true, message: undefined, error: undefined });

      await importProfileText({
        resumeText,
        autofillText,
      });

      await updateSubmitMode(
        submitMode,
        Number.parseFloat(autoSubmitConfidenceThreshold) || 0.85,
      );

      setUploadState({
        isLoading: false,
        message: "Saved your master resume text, autofill profile, and submit settings.",
      });
    } catch (error) {
      setUploadState({
        isLoading: false,
        error: error instanceof Error ? error.message : "Profile save failed",
      });
    }
  };

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      void handleFile(event.dataTransfer.files[0]);
    }
  };

  return (
    <div className="max-w-[800px] mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="mb-2">Upload Master Resume</h1>
        <p className="text-muted-foreground">
          Upload your resume and save the autofill profile Careers+ should use as the source of
          truth.
        </p>
      </div>

      <div
        className={`bg-white rounded-2xl border-2 border-dashed p-12 transition-all ${
          dragActive
            ? "border-[#6366f1] bg-[#f0f4ff]"
            : "border-border hover:border-[#6366f1]"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-[#eef2ff] rounded-full flex items-center justify-center mb-6">
            <Upload className="w-10 h-10 text-[#6366f1]" />
          </div>

          <h2 className="mb-2">Drop your resume here</h2>
          <p className="text-muted-foreground mb-6">or click to browse from your computer</p>

          <input
            type="file"
            id="resume-upload"
            className="hidden"
            accept=".pdf,.doc,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
            }}
          />
          <label
            htmlFor="resume-upload"
            className="px-6 py-3 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors cursor-pointer"
          >
            Choose File
          </label>

          <p className="text-xs text-muted-foreground mt-6">
            Supported formats: PDF, DOC, DOCX (Max 10MB)
          </p>

          {isPreloading && (
            <p className="text-sm text-muted-foreground mt-4">
              Loading your saved resume text and autofill profile...
            </p>
          )}

          {uploadState.isLoading && (
            <p className="text-sm text-muted-foreground mt-4">
              Uploading your resume to the backend...
            </p>
          )}

          {uploadState.message && (
            <p className="text-sm text-green-600 mt-4">{uploadState.message}</p>
          )}

          {uploadState.error && (
            <p className="text-sm text-red-600 mt-4">{uploadState.error}</p>
          )}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl border border-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-[#f0f4ff] rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-[#6366f1]" />
          </div>
          <div>
            <h3 className="mb-1">Canonical profile sources</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Master resume text is the factual source for experience and skills.</li>
              <li>Autofill text is the source for repeated application answers.</li>
              <li>Saved Lever and Greenhouse job targets can reuse this profile automatically.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl border border-border p-6 space-y-5">
        <div>
          <h3 className="mb-1">Master Profile Text</h3>
          <p className="text-sm text-muted-foreground">
            These fields should be saved before auto-apply runs. They will be used as the source
            of truth.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Master Resume Text</label>
          <textarea
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            className="min-h-40 w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            placeholder="Paste your master resume text here..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Master Autofill Text</label>
          <textarea
            value={autofillText}
            onChange={(event) => setAutofillText(event.target.value)}
            className="min-h-36 w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            placeholder={
              "Example:\nFirst Name: Perry\nLast Name: Ehimuh\nEmail: perry@example.com\nPhone: 555-123-4567\nLinkedIn: https://linkedin.com/in/...\nPreferred Roles: Software Engineer, New Grad Software Engineer\nEmployment Type: Full-Time\nPreferred Start Date: January 2027"
            }
          />
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4">
          <p className="text-sm font-medium">Job Targeting Rules</p>
          <ul className="mt-2 text-sm text-muted-foreground space-y-1">
            <li>Software engineering only.</li>
            <li>Full-time only.</li>
            <li>New grad and entry-level roles are preferred.</li>
            <li>Start dates from December 2026 through January 2027 are preferred.</li>
            <li>Internships and senior-only roles stay out unless you add them on purpose.</li>
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Final Submit Mode</p>
          <div className="rounded-xl border border-[#6366f1] bg-[#eef2ff] px-4 py-3">
            <p className="font-medium">Auto-Submit Enabled</p>
            <p className="text-sm text-muted-foreground">
              Careers+ now submits valid applications automatically instead of stopping in a
              manual review state.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Auto-Submit Confidence Threshold</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={autoSubmitConfidenceThreshold}
              onChange={(event) => setAutoSubmitConfidenceThreshold(event.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleProfileSave()}
          className="rounded-lg bg-[#111827] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-black"
        >
          Save Master Profile
        </button>
      </div>
    </div>
  );
}
