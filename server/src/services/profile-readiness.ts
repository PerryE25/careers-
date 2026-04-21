import type { Profile, ProfileValidationIssue } from "../domain/models.js";
import { parseProfileText } from "./profile-parser.js";

export interface ProfileReadiness {
  ready: boolean;
  hasResumeText: boolean;
  hasAutofillText: boolean;
  usesAutofillAsSourceOfTruth: boolean;
  usesResumeTextForBackground: boolean;
  explicitNoWorkExperience: boolean;
  issues: Array<{
    code: "missing-resume-text" | "missing-autofill-text" | "malformed-profile";
    severity: "error" | "warning";
    message: string;
    actionableMessage: string;
  }>;
}

export function evaluateProfileReadiness(profile: Profile | null): ProfileReadiness {
  const hasResumeText = Boolean(profile?.resumeText?.trim());
  const hasAutofillText = Boolean(profile?.autofillText?.trim());
  const issues: ProfileReadiness["issues"] = [];

  if (!hasResumeText) {
    issues.push({
      code: "missing-resume-text",
      severity: "error",
      message: "Saved master resume text is missing.",
      actionableMessage: "Add your saved master resume text before starting automation.",
    });
  }

  if (!hasAutofillText) {
    issues.push({
      code: "missing-autofill-text",
      severity: "error",
      message: "Saved autofill text is missing.",
      actionableMessage: "Add your saved autofill text before starting automation.",
    });
  }

  const parsed =
    hasResumeText && hasAutofillText && profile
      ? parseProfileText(profile.resumeText, profile.autofillText)
      : undefined;

  for (const issue of parsed?.validation.issues ?? []) {
    if (issue.severity === "error") {
      issues.push(toMalformedIssue(issue));
    }
  }

  return {
    ready: issues.every((issue) => issue.severity !== "error"),
    hasResumeText,
    hasAutofillText,
    usesAutofillAsSourceOfTruth: true,
    usesResumeTextForBackground: true,
    explicitNoWorkExperience: parsed?.canonicalProfile.hasExplicitNoWorkExperience ?? false,
    issues,
  };
}

function toMalformedIssue(issue: ProfileValidationIssue): ProfileReadiness["issues"][number] {
  return {
    code: "malformed-profile",
    severity: issue.severity,
    message: issue.message,
    actionableMessage: `Fix your saved profile source: ${issue.message}`,
  };
}
