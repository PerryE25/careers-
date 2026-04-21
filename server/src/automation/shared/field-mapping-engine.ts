import type { Profile } from "../../domain/models.js";
import { StructuredProfileHelper } from "../../services/profile-parser.js";
import { ScreeningAnswerService } from "../../services/screening-answer-service.js";
import type { DetectedFormField } from "../adapter.js";

export interface FieldMappingDecision {
  field: DetectedFormField;
  normalizedLabel: string;
  answer?: string;
  confidence: number;
  status: "resolved" | "unresolved";
  reason: string;
}

const LOW_CONFIDENCE_THRESHOLD = 0.74;
const DEMOGRAPHIC_FIELD_PATTERN =
  /\b(demographic|eeo|gender|sex|race|ethnicity|hispanic|latino|veteran|disability|self identify|self-identify|sexual orientation|lgbtq|pronoun)\b/i;
const DEMOGRAPHIC_OPT_OUT_PATTERNS = [
  /prefer not to disclose/i,
  /prefer not to answer/i,
  /decline to self(?: |-)?identify/i,
  /do not want to answer/i,
  /do not wish to answer/i,
  /choose not to disclose/i,
  /choose not to answer/i,
  /rather not say/i,
];

const FIELD_ALIASES: Record<string, string[]> = {
  first_name: ["first name", "given name", "legal first name", "forename"],
  last_name: ["last name", "family name", "surname", "legal last name"],
  full_name: ["full name", "legal name", "name"],
  email: ["email", "email address"],
  phone: ["phone", "mobile", "mobile phone", "cell", "cell phone", "telephone"],
  linkedin: ["linkedin", "linkedin profile"],
  github: ["github", "github profile"],
  portfolio: ["portfolio", "website", "personal site"],
  current_location: ["location", "current location", "city", "address city"],
  current_company: [
    "current company",
    "present company",
    "employer",
    "current employer",
    "current organization",
  ],
  referral_source: [
    "how did you hear",
    "how did you find",
    "where did you hear",
    "how did you learn",
    "referred by",
    "who referred",
  ],
  work_authorization_status: [
    "work authorization",
    "authorized to work",
    "legally authorized",
    "employment authorization",
  ],
  requires_sponsorship: ["sponsorship", "visa sponsorship", "require sponsorship"],
  salary_target: ["salary expectation", "salary expectations", "desired salary", "expected compensation"],
  availability_start_date: ["earliest start date", "start date", "available from", "when can you start"],
};

export function normalizeFieldLabel(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchCanonicalKey(normalizedLabel: string) {
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    const matches = aliases.some((alias) => normalizedLabel.includes(alias));
    if (!matches) {
      continue;
    }
    if (
      key === "current_company" &&
      /(desired|dream|ideal|favorite|why).*company|company.*culture|company website/i.test(normalizedLabel)
    ) {
      continue;
    }
    if (key === "referral_source" && /(visa|sponsor|clearance|authorization)/i.test(normalizedLabel)) {
      continue;
    }
    return key;
  }
  return undefined;
}

function pickAutofillValue(profile: Profile, keys: string[]) {
  const entries = Object.entries(profile.autofillFields ?? {});
  for (const candidateKey of keys) {
    const normalizedWant = normalizeFieldLabel(candidateKey);
    for (const [key, value] of entries) {
      if (!value?.trim()) {
        continue;
      }
      const nk = normalizeFieldLabel(key);
      if (nk === normalizedWant || nk.includes(normalizedWant) || normalizedWant.includes(nk)) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function normalizeOptionMatch(value: string, options: string[]) {
  const normalizedValue = normalizeFieldLabel(value);
  return options.find((option) => {
    const normalizedOption = normalizeFieldLabel(option);
    return normalizedOption === normalizedValue ||
      normalizedOption.includes(normalizedValue) ||
      normalizedValue.includes(normalizedOption);
  });
}

function isDemographicField(field: DetectedFormField, normalizedLabel: string) {
  const domName = normalizeFieldLabel(field.domLocator.name ?? "");
  return DEMOGRAPHIC_FIELD_PATTERN.test(normalizedLabel) ||
    DEMOGRAPHIC_FIELD_PATTERN.test(domName) ||
    domName.includes("demographicanswers") ||
    domName.includes("eeo");
}

function isDemographicOptOutOption(option: string) {
  const normalizedOption = normalizeFieldLabel(option);
  return DEMOGRAPHIC_OPT_OUT_PATTERNS.some((pattern) => pattern.test(normalizedOption));
}

function findSavedDemographicAnswer(profile: Profile, normalizedLabel: string, options: string[]) {
  for (const [key, value] of Object.entries(profile.canonicalProfile.demographicAnswers)) {
    const normalizedKey = normalizeFieldLabel(key);
    if (
      normalizedLabel.includes(normalizedKey) ||
      normalizedKey.includes(normalizedLabel)
    ) {
      return normalizeOptionMatch(value, options) ?? value;
    }
  }
  return undefined;
}

function findDemographicAnswer(profile: Profile, field: DetectedFormField, normalizedLabel: string) {
  if (!isDemographicField(field, normalizedLabel)) {
    return undefined;
  }

  const savedAnswer = findSavedDemographicAnswer(profile, normalizedLabel, field.options);
  if (savedAnswer) {
    return {
      answer: savedAnswer,
      reason: "Matched demographic field to a saved profile answer.",
    };
  }

  if (field.type === "select" || field.type === "radio") {
    const optOut = field.options.find(isDemographicOptOutOption);
    if (optOut) {
      return {
        answer: optOut,
        reason: "Used a privacy-preserving opt-out answer for a demographic question.",
      };
    }
  }

  return undefined;
}

function computeConfidence(
  field: DetectedFormField,
  normalizedLabel: string,
  canonicalKey: string | undefined,
  answer: string | undefined,
) {
  if (!answer) {
    return 0.1;
  }

  let score = 0.45;
  if (canonicalKey) {
    score += 0.25;
  }
  if (field.required) {
    score += 0.05;
  }
  if (field.type === "email" && canonicalKey === "email") {
    score += 0.2;
  }
  if (field.type === "phone" && canonicalKey === "phone") {
    score += 0.2;
  }
  if (field.type === "select" || field.type === "radio") {
    const matched = Boolean(normalizeOptionMatch(answer, field.options));
    score += matched ? 0.15 : -0.15;
    if (matched && field.required) {
      score += 0.05;
    }
    if (matched && isDemographicField(field, normalizedLabel)) {
      score += isDemographicOptOutOption(answer) ? 0.25 : 0.2;
    }
  }
  if (
    field.type === "checkbox" &&
    /(consent|privacy|terms|data processing|acknowledg)/i.test(
      normalizedLabel,
    )
  ) {
    score += 0.3;
  }
  if (field.type === "textarea") {
    score += 0.25;
  }
  if (
    field.type === "text" &&
    /(disabilitysignaturedate|signature date|\bdate mm dd yyyy\b)/i.test(normalizedLabel)
  ) {
    score += 0.3;
  }
  if (answer.length > 0 && answer.length < 500) {
    score += 0.05;
  }
  return Math.max(0, Math.min(score, 0.99));
}

function formatCurrentDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const year = String(now.getFullYear());
  return `${month}/${day}/${year}`;
}

function getAnswerByCanonicalKey(profile: Profile, canonicalKey: string | undefined, field: DetectedFormField) {
  if (!canonicalKey) {
    return undefined;
  }
  const canonical = profile.canonicalProfile;
  const optionText = (value?: string) =>
    value
      ? field.options.find((option) => normalizeFieldLabel(option) === normalizeFieldLabel(value))
        ?? value
      : undefined;

  switch (canonicalKey) {
    case "first_name":
      return canonical.personalInfo.firstName;
    case "last_name":
      return canonical.personalInfo.lastName;
    case "full_name":
      return canonical.personalInfo.fullName;
    case "email":
      return canonical.contactInfo.email;
    case "phone":
      return canonical.contactInfo.phone;
    case "linkedin":
      return canonical.contactInfo.linkedin;
    case "github":
      return canonical.contactInfo.github;
    case "portfolio":
      return canonical.contactInfo.portfolio ?? canonical.contactInfo.website;
    case "current_location":
      return canonical.locationPreferences.currentLocation;
    case "work_authorization_status":
      return optionText(canonical.workAuthorization.workAuthorizationStatus);
    case "requires_sponsorship":
      return optionText(canonical.workAuthorization.requiresSponsorship ? "Yes" : "No");
    case "salary_target":
      return canonical.salaryPreferences.targetBase ?? canonical.salaryPreferences.minimumBase;
    case "availability_start_date":
      return canonical.availability.startDate;
    case "current_company":
      return (
        pickAutofillValue(profile, [
          "current_company",
          "current company",
          "employer",
          "organization",
          "company",
        ]) ?? undefined
      );
    case "referral_source":
      return (
        pickAutofillValue(profile, [
          "referral",
          "referral_source",
          "how_did_you_hear",
          "source",
          "heard_about",
        ]) ??
        (canonical.sourceNotes.length > 0 ? canonical.sourceNotes.join("; ") : undefined)
      );
    default:
      return undefined;
  }
}

export function mapFieldToProfile(profile: Profile, field: DetectedFormField): FieldMappingDecision {
  const helper = new StructuredProfileHelper(profile);
  const combinedLabel = [field.label, field.placeholder, field.section, field.groupName]
    .filter(Boolean)
    .join(" ");
  const normalizedLabel = normalizeFieldLabel(combinedLabel);
  const canonicalKey = matchCanonicalKey(normalizedLabel);

  let answer: string | undefined;
  let reason = "No confident match found.";

  if (field.type === "file") {
    return {
      field,
      normalizedLabel,
      answer: undefined,
      confidence: 0.99,
      status: "unresolved",
      reason: "File upload fields are handled by adapter upload steps.",
    };
  }

  if (
    field.type === "checkbox" &&
    /(consent|privacy|terms|data processing|acknowledg)/i.test(normalizedLabel) &&
    !/(marketing|newsletter|sms|text message alerts)/i.test(normalizedLabel)
  ) {
    answer = field.options.find((option) => normalizeFieldLabel(option) === "yes") ?? "Yes";
    reason = "Matched required consent-style checkbox safely.";
  }

  if (
    !answer &&
    field.type === "text" &&
    /(disabilitysignaturedate|signature date|\bdate mm dd yyyy\b)/i.test(normalizedLabel)
  ) {
    answer = formatCurrentDate();
    reason = "Filled signature date with the current date.";
  }

  if (!answer && field.type === "textarea") {
    answer =
      findPromptAnswer(profile, combinedLabel, "long") ??
      helper.getLongAnswerForPrompt(combinedLabel) ??
      helper.getShortAnswerForPrompt(combinedLabel);
    if (answer) {
      reason = "Matched textarea prompt to a prewritten answer.";
    }
  } else if (!answer) {
    answer =
      getAnswerByCanonicalKey(profile, canonicalKey, field) ??
      helper.getBestAnswerForField(field.label, field.type, field.options);
    if (answer) {
      reason = canonicalKey
        ? `Matched normalized field to canonical profile key ${canonicalKey}.`
        : "Matched field using profile helper.";
    }
  }

  if (!answer) {
    const demographicMatch = findDemographicAnswer(profile, field, normalizedLabel);
    if (demographicMatch) {
      answer = demographicMatch.answer;
      reason = demographicMatch.reason;
    }
  }

  if (
    profile.canonicalProfile.hasExplicitNoWorkExperience &&
    /(experience|employment history|work history|internship)/i.test(normalizedLabel)
  ) {
    answer = undefined;
    reason = "Profile explicitly says no work experience; leaving field unresolved.";
  }

  if (
    /(why do you want|tell us about yourself|describe|additional information|motivation|hope to work|challenging.*problem|what.*at \w+|publicly available)/i.test(
      normalizedLabel,
    ) &&
    !answer
  ) {
    reason = "Ambiguous screening prompt without a confident saved answer.";
  }

  const confidence = computeConfidence(field, normalizedLabel, canonicalKey, answer);
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      field,
      normalizedLabel,
      answer: undefined,
      confidence,
      status: "unresolved",
      reason,
    };
  }

  return {
    field,
    normalizedLabel,
    answer,
    confidence,
    status: "resolved",
    reason,
  };
}

function findPromptAnswer(profile: Profile, prompt: string, preferredLength: "short" | "long") {
  const serviceResult = new ScreeningAnswerService(profile).answerQuestion(prompt, preferredLength);
  if (serviceResult.answer) {
    return serviceResult.answer;
  }

  const normalizedPrompt = normalizeFieldLabel(prompt);
  const direct = profile.canonicalProfile.prewrittenAnswers.find((candidate) => {
    const normalizedCandidate = normalizeFieldLabel(candidate.prompt);
    return (
      normalizedPrompt.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedPrompt)
    );
  });
  if (direct) {
    return direct.answer;
  }

  const sameLength = profile.canonicalProfile.prewrittenAnswers.find(
    (candidate) =>
      candidate.length === preferredLength &&
      normalizedPrompt.split(" ").some((term) => term && normalizeFieldLabel(candidate.prompt).includes(term)),
  );
  return sameLength?.answer;
}

export function summarizeMappingConfidence(decisions: FieldMappingDecision[]) {
  const relevant = decisions.filter((decision) => decision.field.type !== "file");
  if (relevant.length === 0) {
    return 0.55;
  }

  const resolved = relevant.filter((decision) => decision.status === "resolved" && decision.answer);
  if (resolved.length === 0) {
    return 0.4;
  }

  const required = relevant.filter((decision) => decision.field.required);
  const requiredResolved = required.filter((decision) => decision.status === "resolved" && decision.answer);
  const optional = relevant.filter((decision) => !decision.field.required);
  const optionalResolved = optional.filter((decision) => decision.status === "resolved" && decision.answer);

  const averageConfidence =
    resolved.reduce((sum, decision) => sum + decision.confidence, 0) / resolved.length;
  const requiredCoverage = required.length > 0 ? requiredResolved.length / required.length : 1;
  const optionalCoverage = optional.length > 0 ? optionalResolved.length / optional.length : 1;
  const weightedScore =
    averageConfidence * 0.8 +
    requiredCoverage * 0.17 +
    optionalCoverage * 0.03;

  return Math.max(0.4, Math.min(weightedScore, 0.98));
}

export const fieldMappingThresholds = {
  lowConfidence: LOW_CONFIDENCE_THRESHOLD,
};
