import type {
  CanonicalProfile,
  EducationEntry,
  Profile,
  ProfileValidationIssue,
  ProjectEntry,
  PromptAnswer,
  TechnicalSkills,
} from "../domain/models.js";
import { ScreeningAnswerService, type ScreeningAnswerContext } from "./screening-answer-service.js";

interface ParsedSectionMap {
  [key: string]: string[];
}

interface ParsedResult {
  autofillFields: Record<string, string>;
  canonicalProfile: CanonicalProfile;
  validation: Profile["validation"];
}

const SECTION_ALIASES: Record<string, string> = {
  personal_info: "personal_info",
  personal: "personal_info",
  contact: "contact_info",
  contact_info: "contact_info",
  location: "location_preferences",
  location_preferences: "location_preferences",
  work_authorization: "work_authorization",
  authorization: "work_authorization",
  education: "education",
  skills: "technical_skills",
  technical_skills: "technical_skills",
  projects: "projects",
  prewritten_answers: "prewritten_answers",
  answers: "prewritten_answers",
  demographic: "demographic_answers",
  demographic_answers: "demographic_answers",
  job_preferences: "job_preferences",
  preferences: "job_preferences",
  salary_preferences: "salary_preferences",
  relocation_preferences: "relocation_preferences",
  availability: "availability",
};

const FIELD_ALIASES: Record<string, string[]> = {
  first_name: ["first name", "firstname", "given name"],
  last_name: ["last name", "lastname", "family name", "surname"],
  full_name: ["full name", "name", "legal name"],
  preferred_name: ["preferred name"],
  pronouns: ["pronouns"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "mobile number"],
  linkedin: ["linkedin", "linkedin url"],
  github: ["github", "github url"],
  portfolio: ["portfolio", "portfolio url"],
  website: ["website", "personal website"],
  current_location: ["location", "current location", "city", "home location"],
  preferred_locations: ["preferred locations", "preferred location"],
  remote_preference: ["remote preference", "remote", "workplace preference"],
  requires_sponsorship: ["require sponsorship", "requires sponsorship", "sponsorship"],
  work_authorization_status: ["work authorization", "authorization status", "us work authorization"],
  visa_status: ["visa status"],
  security_clearance: ["security clearance", "clearance"],
  desired_titles: ["desired titles", "target titles", "job titles"],
  employment_types: ["employment types", "employment type"],
  workplace_types: ["workplace types", "workplace type"],
  industries: ["industries", "industry preferences"],
  seniority: ["seniority", "level"],
  salary_minimum: ["minimum salary", "minimum base", "salary minimum"],
  salary_target: ["target salary", "target base", "salary target", "desired salary"],
  salary_currency: ["salary currency", "currency"],
  relocation_open: ["open to relocate", "willing to relocate", "relocation"],
  relocation_locations: ["relocation locations", "relocation preferences"],
  availability_start_date: ["start date", "availability date", "available from"],
  availability_notice_period: ["notice period"],
  availability_immediate: ["available immediately", "immediately available"],
  no_work_experience: ["no work experience", "no internship experience", "work experience"],
};

export function normalizeProfileLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_#]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function splitList(value: string) {
  return value
    .split(/\s*[|,;/]\s*|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function asBoolean(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["yes", "true", "y", "open", "available", "authorized"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "n", "not open", "none"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isLikelyHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("#")) {
    return true;
  }
  if (!trimmed.endsWith(":")) {
    return false;
  }
  const withoutColon = trimmed.slice(0, -1);
  return !withoutColon.includes("  ") && !withoutColon.match(/\d/);
}

function headingToKey(line: string) {
  return SECTION_ALIASES[normalizeProfileLabel(line.replace(/^#+/, "").replace(/:$/, ""))] ?? "general";
}

function splitKeyValue(line: string) {
  const match = line.match(/^\s*[-*]?\s*([^:=-]+?)\s*[:=-]\s*(.+)\s*$/);
  if (!match) {
    return null;
  }
  return {
    key: normalizeProfileLabel(match[1]),
    rawKey: match[1].trim(),
    value: match[2].trim(),
  };
}

function parseMarkdownLink(value: string) {
  const match = value.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) {
    return undefined;
  }
  return {
    text: match[1].trim(),
    href: match[2].trim(),
  };
}

function stripEnclosingAngleBrackets(value: string) {
  const trimmed = value.trim();
  if (/^<[^<>]+>$/.test(trimmed)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function extractMailtoAddress(value: string) {
  const trimmed = stripEnclosingAngleBrackets(value);
  if (!trimmed.toLowerCase().startsWith("mailto:")) {
    return undefined;
  }

  const address = trimmed.slice("mailto:".length).split("?")[0]?.trim();
  if (!address) {
    return undefined;
  }

  return decodeURIComponent(address);
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function looksLikeUrl(value: string) {
  try {
    const candidate = stripEnclosingAngleBrackets(value);
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeFieldValue(key: string, value: string) {
  const trimmed = value.trim();
  const markdownLink = parseMarkdownLink(trimmed);

  if (key === "email") {
    if (markdownLink) {
      const hrefEmail = extractMailtoAddress(markdownLink.href);
      if (hrefEmail) {
        return hrefEmail;
      }
      if (looksLikeEmail(markdownLink.text)) {
        return markdownLink.text;
      }
      if (looksLikeEmail(markdownLink.href)) {
        return markdownLink.href;
      }
    }

    return extractMailtoAddress(trimmed) ?? stripEnclosingAngleBrackets(trimmed);
  }

  if (["linkedin", "github", "portfolio", "website"].includes(key)) {
    if (markdownLink) {
      if (looksLikeUrl(markdownLink.href)) {
        return markdownLink.href;
      }
      if (looksLikeUrl(markdownLink.text)) {
        return markdownLink.text;
      }
    }

    return stripEnclosingAngleBrackets(trimmed);
  }

  return trimmed;
}

function deriveNameParts(fullName?: string) {
  const normalized = fullName?.trim();
  if (!normalized) {
    return {};
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {};
  }
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

function aliasKey(key: string) {
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (canonical === key || aliases.some((alias) => normalizeProfileLabel(alias) === key)) {
      return canonical;
    }
  }
  return key;
}

function collectSections(autofillText: string) {
  const sections: ParsedSectionMap = { general: [] };
  let currentSection = "general";
  for (const rawLine of autofillText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (isLikelyHeading(line)) {
      currentSection = headingToKey(line);
      sections[currentSection] ??= [];
      continue;
    }
    sections[currentSection] ??= [];
    sections[currentSection].push(line);
  }
  return sections;
}

function collectAutofillFields(sections: ParsedSectionMap) {
  const fields: Record<string, string> = {};
  for (const [section, lines] of Object.entries(sections)) {
    for (const line of lines) {
      const pair = splitKeyValue(line);
      if (pair) {
        const canonicalKey = aliasKey(pair.key);
        const normalizedValue = normalizeFieldValue(canonicalKey, pair.value);
        fields[canonicalKey] = normalizedValue;
        if (section !== "general") {
          fields[`${section}__${canonicalKey}`] = normalizedValue;
        }
      }
    }
  }
  return fields;
}

function parseAnswerLines(lines: string[]): PromptAnswer[] {
  const answers: PromptAnswer[] = [];
  let currentPrompt: string | null = null;
  let currentAnswer: string[] = [];
  const flush = () => {
    if (!currentPrompt || currentAnswer.length === 0) {
      currentPrompt = null;
      currentAnswer = [];
      return;
    }
    const answer = currentAnswer.join(" ").trim();
    answers.push({
      prompt: currentPrompt,
      answer,
      length: answer.length > 180 ? "long" : "short",
      tags: unique(splitList(currentPrompt.toLowerCase())),
    });
    currentPrompt = null;
    currentAnswer = [];
  };

  for (const line of lines) {
    const qa = line.match(/^(?:q|prompt|question)\s*[:=-]\s*(.+)$/i);
    const aa = line.match(/^(?:a|answer)\s*[:=-]\s*(.+)$/i);
    const arrow = line.match(/^(.+?)\s*(?:=>|->)\s*(.+)$/);
    if (qa) {
      flush();
      currentPrompt = qa[1].trim();
      continue;
    }
    if (aa && currentPrompt) {
      currentAnswer.push(aa[1].trim());
      continue;
    }
    if (arrow) {
      flush();
      answers.push({
        prompt: arrow[1].trim(),
        answer: arrow[2].trim(),
        length: arrow[2].trim().length > 180 ? "long" : "short",
        tags: unique(splitList(arrow[1].toLowerCase())),
      });
      continue;
    }
    if (currentPrompt) {
      currentAnswer.push(line.replace(/^[-*]\s*/, "").trim());
    }
  }
  flush();
  return answers;
}

function parseEducationLines(lines: string[]): EducationEntry[] {
  return lines
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+\|\s+|;\s*/).map((part) => part.trim()).filter(Boolean);
      return {
        school: parts[0],
        degree: parts[1],
        fieldOfStudy: parts[2],
        graduationDate: parts.find((part) => /\b(20\d{2}|19\d{2}|present|expected)\b/i.test(part)),
        details: parts.length > 3 ? parts.slice(3) : [],
      } satisfies EducationEntry;
    });
}

function parseProjectsLines(lines: string[]): ProjectEntry[] {
  return lines
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, ...rest] = line.split(/\s*[:|-]\s*/);
      const summary = rest.join(" - ").trim();
      const links = (line.match(/https?:\/\/\S+/g) ?? []).map((value) => value.trim());
      const technologies = unique(
        splitList(summary)
          .filter((part) => /^[A-Za-z0-9.+#-]{2,}$/.test(part))
          .slice(0, 8),
      );
      return {
        name: namePart?.trim(),
        summary: summary || undefined,
        technologies,
        links,
      } satisfies ProjectEntry;
    });
}

function categorizeSkillLine(value: string, skills: TechnicalSkills) {
  const pair = splitKeyValue(value);
  if (pair) {
    const items = unique(splitList(pair.value));
    if (pair.key.includes("language")) {
      skills.languages.push(...items);
      return;
    }
    if (pair.key.includes("framework") || pair.key.includes("frontend") || pair.key.includes("backend")) {
      skills.frameworks.push(...items);
      return;
    }
    if (pair.key.includes("cloud")) {
      skills.cloud.push(...items);
      return;
    }
    if (pair.key.includes("database") || pair.key.includes("data")) {
      skills.databases.push(...items);
      return;
    }
    if (pair.key.includes("tool") || pair.key.includes("platform") || pair.key.includes("devops")) {
      skills.tools.push(...items);
      return;
    }
    skills.other.push(...items);
    return;
  }
  skills.raw.push(value);
  skills.other.push(...splitList(value));
}

function emptySkills(): TechnicalSkills {
  return {
    languages: [],
    frameworks: [],
    tools: [],
    cloud: [],
    databases: [],
    other: [],
    raw: [],
  };
}

function parseResumeSections(resumeText: string) {
  const sections: ParsedSectionMap = {};
  let current = "summary";
  sections[current] = [];
  for (const rawLine of resumeText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const key = normalizeProfileLabel(line);
    if (
      [
        "education",
        "projects",
        "skills",
        "technical_skills",
        "technologies",
        "technical_background",
      ].includes(key)
    ) {
      current =
        key === "skills" || key === "technical_skills" || key === "technologies"
          ? "technical_skills"
          : key;
      sections[current] ??= [];
      continue;
    }
    sections[current] ??= [];
    sections[current].push(line);
  }
  return sections;
}

function mergeResumeIntoCanonical(resumeText: string, canonical: CanonicalProfile) {
  const sections = parseResumeSections(resumeText);

  if (canonical.education.length === 0 && sections.education?.length) {
    canonical.education = parseEducationLines(sections.education);
    canonical.sourceNotes.push("Education supplemented from resume text.");
  }

  if (canonical.projects.length === 0 && sections.projects?.length) {
    canonical.projects = parseProjectsLines(sections.projects);
    canonical.sourceNotes.push("Projects supplemented from resume text.");
  }

  const resumeSkills = emptySkills();
  for (const line of sections.technical_skills ?? []) {
    categorizeSkillLine(line, resumeSkills);
  }
  if (
    canonical.technicalSkills.languages.length === 0 &&
    canonical.technicalSkills.frameworks.length === 0 &&
    canonical.technicalSkills.tools.length === 0 &&
    canonical.technicalSkills.cloud.length === 0 &&
    canonical.technicalSkills.databases.length === 0 &&
    canonical.technicalSkills.other.length === 0
  ) {
    canonical.technicalSkills = normalizeSkills(resumeSkills);
    if (resumeSkills.raw.length > 0) {
      canonical.sourceNotes.push("Technical skills supplemented from resume text.");
    }
  }

  if (canonical.technicalBackground.length === 0) {
    canonical.technicalBackground = unique([
      ...sections.technical_background ?? [],
      ...sections.technical_skills ?? [],
      ...sections.projects?.slice(0, 4) ?? [],
      ...sections.education?.slice(0, 3) ?? [],
    ]).slice(0, 12);
  }
}

function normalizeSkills(skills: TechnicalSkills): TechnicalSkills {
  return {
    languages: unique(skills.languages),
    frameworks: unique(skills.frameworks),
    tools: unique(skills.tools),
    cloud: unique(skills.cloud),
    databases: unique(skills.databases),
    other: unique(skills.other),
    raw: unique(skills.raw),
  };
}

function validateCanonicalProfile(canonical: CanonicalProfile) {
  const issues: ProfileValidationIssue[] = [];
  const email = canonical.contactInfo.email;
  const phone = canonical.contactInfo.phone;
  const linkedin = canonical.contactInfo.linkedin;

  if (!canonical.personalInfo.fullName && !(canonical.personalInfo.firstName && canonical.personalInfo.lastName)) {
    issues.push({
      field: "personalInfo.fullName",
      severity: "error",
      message: "Missing name. Add either Full Name or both First Name and Last Name.",
    });
  }

  if (!email) {
    issues.push({
      field: "contactInfo.email",
      severity: "error",
      message: "Missing email address.",
    });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({
      field: "contactInfo.email",
      severity: "error",
      message: "Email address appears malformed.",
    });
  }

  if (phone && phone.replace(/\D/g, "").length < 10) {
    issues.push({
      field: "contactInfo.phone",
      severity: "warning",
      message: "Phone number appears incomplete.",
    });
  }

  if (linkedin) {
    try {
      new URL(linkedin);
    } catch {
      issues.push({
        field: "contactInfo.linkedin",
        severity: "warning",
        message: "LinkedIn URL appears malformed.",
      });
    }
  }

  if (canonical.jobPreferences.desiredTitles.length === 0) {
    issues.push({
      field: "jobPreferences.desiredTitles",
      severity: "warning",
      message: "No desired job titles were found.",
    });
  }

  if (
    canonical.technicalSkills.languages.length === 0 &&
    canonical.technicalSkills.frameworks.length === 0 &&
    canonical.technicalSkills.tools.length === 0 &&
    canonical.technicalSkills.other.length === 0
  ) {
    issues.push({
      field: "technicalSkills",
      severity: "warning",
      message: "No technical skills were parsed.",
    });
  }

  if (canonical.education.length === 0) {
    issues.push({
      field: "education",
      severity: "warning",
      message: "No education entries were parsed.",
    });
  }

  return {
    isValid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

function fromSections(sections: ParsedSectionMap, autofillFields: Record<string, string>): CanonicalProfile {
  const derivedNames = deriveNameParts(autofillFields.full_name ?? autofillFields.name);
  const personalInfo = {
    firstName: autofillFields.first_name ?? derivedNames.firstName ?? autofillFields.preferred_name,
    lastName: autofillFields.last_name ?? derivedNames.lastName,
    fullName: autofillFields.full_name ??
      ([autofillFields.first_name ?? derivedNames.firstName, autofillFields.last_name ?? derivedNames.lastName]
        .filter(Boolean)
        .join(" ") || undefined),
    preferredName: autofillFields.preferred_name,
    pronouns: autofillFields.pronouns,
  };

  const contactInfo = {
    email: autofillFields.email,
    phone: autofillFields.phone,
    linkedin: autofillFields.linkedin,
    github: autofillFields.github,
    portfolio: autofillFields.portfolio,
    website: autofillFields.website,
  };

  const locationPreferences = {
    currentLocation: autofillFields.current_location,
    preferredLocations: unique(splitList(autofillFields.preferred_locations ?? "")),
    remotePreference: autofillFields.remote_preference,
    timeZone: autofillFields.time_zone,
  };

  const workAuthorization = {
    workAuthorizationStatus: autofillFields.work_authorization_status,
    requiresSponsorship: asBoolean(autofillFields.requires_sponsorship),
    authorizedCountries: unique(splitList(autofillFields.authorized_countries ?? "")),
    visaStatus: autofillFields.visa_status,
    securityClearance: autofillFields.security_clearance,
  };

  const skills = emptySkills();
  for (const line of sections.technical_skills ?? []) {
    categorizeSkillLine(line, skills);
  }
  if (autofillFields.skills) {
    categorizeSkillLine(autofillFields.skills, skills);
  }

  const demographicAnswers = Object.fromEntries(
    Object.entries(autofillFields)
      .filter(([key]) => key.startsWith("demographic_answers__"))
      .map(([key, value]) => [key.replace("demographic_answers__", ""), value]),
  );
  for (const line of sections.demographic_answers ?? []) {
    const pair = splitKeyValue(line);
    if (pair) {
      demographicAnswers[pair.key] = pair.value;
    }
  }

  const relocationLocations = unique([
    ...splitList(autofillFields.relocation_locations ?? ""),
    ...(sections.relocation_preferences ?? [])
      .map((line) => splitKeyValue(line))
      .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair && pair.key.includes("location")))
      .flatMap((pair) => splitList(pair.value)),
  ]);

  const hasExplicitNoWorkExperience =
    asBoolean(autofillFields.no_work_experience) === true ||
    /^(none|no|n\/a)$/i.test(autofillFields.no_work_experience ?? "");

  return {
    personalInfo,
    contactInfo,
    locationPreferences,
    workAuthorization,
    education: parseEducationLines(sections.education ?? []),
    technicalSkills: normalizeSkills(skills),
    projects: parseProjectsLines(sections.projects ?? []),
    prewrittenAnswers: parseAnswerLines(sections.prewritten_answers ?? []),
    demographicAnswers,
    jobPreferences: {
      desiredTitles: unique(splitList(autofillFields.desired_titles ?? autofillFields.target_titles ?? "")),
      employmentTypes: unique(splitList(autofillFields.employment_types ?? "")),
      workplaceTypes: unique(splitList(autofillFields.workplace_types ?? "")),
      industries: unique(splitList(autofillFields.industries ?? "")),
      seniority: autofillFields.seniority,
      noPriorExperience: hasExplicitNoWorkExperience || undefined,
    },
    salaryPreferences: {
      minimumBase: autofillFields.salary_minimum,
      targetBase: autofillFields.salary_target,
      currency: autofillFields.salary_currency,
      notes: autofillFields.salary_notes,
    },
    relocationPreferences: {
      openToRelocate: asBoolean(autofillFields.relocation_open),
      preferredLocations: relocationLocations,
      notes: autofillFields.relocation_notes,
    },
    availability: {
      startDate: autofillFields.availability_start_date,
      noticePeriod: autofillFields.availability_notice_period,
      availableImmediately: asBoolean(autofillFields.availability_immediate),
    },
    technicalBackground: [],
    hasExplicitNoWorkExperience,
    sourceNotes: ["Autofill profile used as source of truth."],
  };
}

function scorePromptMatch(query: string, candidate: PromptAnswer) {
  const queryTerms = unique(splitList(normalizeProfileLabel(query).replace(/_/g, " ")));
  const promptTerms = new Set(splitList(normalizeProfileLabel(candidate.prompt).replace(/_/g, " ")));
  let score = 0;
  for (const term of queryTerms) {
    if (promptTerms.has(term)) {
      score += 2;
    }
    if (candidate.answer.toLowerCase().includes(term)) {
      score += 1;
    }
  }
  return score;
}

export class StructuredProfileHelper {
  constructor(private readonly profile: Profile) {}

  getBestAnswerForField(fieldLabel: string, fieldType?: string, options: string[] = []) {
    const canonical = this.profile.canonicalProfile;
    const label = normalizeProfileLabel(fieldLabel);
    const optionMap = options.map((option) => ({ option, normalized: normalizeProfileLabel(option) }));

    const directMap: Array<[string, string | undefined]> = [
      ["full_name", canonical.personalInfo.fullName],
      ["first_name", canonical.personalInfo.firstName],
      ["last_name", canonical.personalInfo.lastName],
      ["email", canonical.contactInfo.email],
      ["phone", canonical.contactInfo.phone],
      ["linkedin", canonical.contactInfo.linkedin],
      ["github", canonical.contactInfo.github],
      ["portfolio", canonical.contactInfo.portfolio ?? canonical.contactInfo.website],
      ["location", canonical.locationPreferences.currentLocation],
      ["desired_title", canonical.jobPreferences.desiredTitles[0]],
      ["salary", canonical.salaryPreferences.targetBase ?? canonical.salaryPreferences.minimumBase],
      ["start_date", canonical.availability.startDate],
    ];

    const employerFromAutofill = () => {
      const af = this.profile.autofillFields ?? {};
      const keys = ["current_company", "current company", "employer", "organization", "company"];
      for (const want of keys) {
        const nw = normalizeProfileLabel(want);
        for (const [k, v] of Object.entries(af)) {
          if (!v?.trim()) {
            continue;
          }
          const nk = normalizeProfileLabel(k);
          if (nk === nw || nk.includes(nw) || nw.includes(nk)) {
            return v.trim();
          }
        }
      }
      return undefined;
    };

    if (
      (label.includes("current_company") ||
        label.includes("employer") ||
        (label.includes("company") && (label.includes("current") || label.includes("present")))) &&
      !/(desired|dream|ideal|favorite).*company|company.*culture/i.test(label)
    ) {
      const emp = employerFromAutofill();
      if (emp) {
        return emp;
      }
    }

    if (
      label.includes("how_did_you_hear") ||
      label.includes("referral") ||
      (label.includes("hear") && label.includes("about")) ||
      (label.includes("find") && label.includes("about") && label.includes("us"))
    ) {
      const af = this.profile.autofillFields ?? {};
      for (const key of ["referral", "how_did_you_hear", "heard_about", "source"]) {
        const v = af[key];
        if (v?.trim()) {
          return fieldType === "select" || fieldType === "radio"
            ? matchOption(v.trim(), optionMap) ?? v.trim()
            : v.trim();
        }
      }
      if (canonical.sourceNotes.length > 0) {
        const joined = canonical.sourceNotes.join("; ");
        return fieldType === "select" || fieldType === "radio"
          ? matchOption(joined, optionMap) ?? joined
          : joined;
      }
    }

    for (const [key, value] of directMap) {
      if (label.includes(key) && value) {
        return value;
      }
    }

    if (label.includes("sponsor")) {
      const needs = canonical.workAuthorization.requiresSponsorship;
      if (typeof needs === "boolean") {
        return matchOption(needs ? "yes" : "no", optionMap) ?? (needs ? "Yes" : "No");
      }
    }

    if (
      label.includes("u_s_person") ||
      label.includes("us_person") ||
      label.includes("u s person") ||
      label.includes("us person")
    ) {
      const usPerson =
        asBoolean(this.profile.autofillFields.u_s_citizen) ??
        asBoolean(this.profile.autofillFields.authorized_to_work_in_u_s);
      if (typeof usPerson === "boolean") {
        return matchOption(usPerson ? "yes" : "no", optionMap) ?? (usPerson ? "Yes" : "No");
      }
    }

    if (/(onsite|on site|in person)/i.test(label)) {
      const openToOnsite =
        asBoolean(this.profile.autofillFields.open_to_onsite) ??
        asBoolean(this.profile.autofillFields.relocation_open);
      if (typeof openToOnsite === "boolean") {
        return matchOption(openToOnsite ? "yes" : "no", optionMap) ?? (openToOnsite ? "Yes" : "No");
      }
    }

    if (label.includes("hybrid")) {
      const openToHybrid = asBoolean(this.profile.autofillFields.open_to_hybrid);
      if (typeof openToHybrid === "boolean") {
        return matchOption(openToHybrid ? "yes" : "no", optionMap) ?? (openToHybrid ? "Yes" : "No");
      }
    }

    if (label.includes("remote")) {
      const openToRemote = asBoolean(this.profile.autofillFields.open_to_remote);
      if (typeof openToRemote === "boolean") {
        return matchOption(openToRemote ? "yes" : "no", optionMap) ?? (openToRemote ? "Yes" : "No");
      }
    }

    if (label.includes("relocat")) {
      const open = canonical.relocationPreferences.openToRelocate;
      if (typeof open === "boolean") {
        return matchOption(open ? "yes" : "no", optionMap) ?? (open ? "Yes" : "No");
      }
    }

    if (fieldType === "select" || fieldType === "radio") {
      const answer = this.getShortAnswerForPrompt(fieldLabel);
      if (answer) {
        return matchOption(answer, optionMap) ?? answer;
      }
    }

    return this.profile.autofillFields[label];
  }

  getShortAnswerForPrompt(prompt: string) {
    return this.getAnswerForPrompt(prompt, "short");
  }

  getLongAnswerForPrompt(prompt: string) {
    return this.getAnswerForPrompt(prompt, "long");
  }

  answerScreeningQuestion(
    prompt: string,
    preferredLength: "short" | "long",
    context: ScreeningAnswerContext = {},
  ) {
    return new ScreeningAnswerService(this.profile).answerQuestion(prompt, preferredLength, context);
  }

  private getAnswerForPrompt(prompt: string, preferredLength: "short" | "long") {
    const result = this.answerScreeningQuestion(prompt, preferredLength);
    if (result.answer) {
      return result.answer;
    }
    const sorted = this.profile.canonicalProfile.prewrittenAnswers
      .map((answer) => ({ answer, score: scorePromptMatch(prompt, answer) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (a.answer.length === preferredLength && b.answer.length !== preferredLength) {
          return -1;
        }
        if (b.answer.length === preferredLength && a.answer.length !== preferredLength) {
          return 1;
        }
        return b.score - a.score;
      });
    return sorted[0]?.answer.answer;
  }
}

function matchOption(value: string, options: Array<{ option: string; normalized: string }>) {
  const normalized = normalizeProfileLabel(value);
  return options.find((option) => option.normalized.includes(normalized) || normalized.includes(option.normalized))
    ?.option;
}

export function parseProfileText(resumeText: string, autofillText: string): ParsedResult {
  const sections = collectSections(autofillText);
  const autofillFields = collectAutofillFields(sections);
  const canonicalProfile = fromSections(sections, autofillFields);
  mergeResumeIntoCanonical(resumeText, canonicalProfile);
  const validation = validateCanonicalProfile(canonicalProfile);
  return {
    autofillFields,
    canonicalProfile,
    validation,
  };
}
