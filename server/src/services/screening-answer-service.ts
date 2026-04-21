import type { Profile, ProjectEntry } from "../domain/models.js";

export type AnswerLength = "short" | "long";

export interface ScreeningAnswerContext {
  companyName?: string;
  roleTitle?: string;
}

export interface ScreeningAnswerResult {
  answer?: string;
  confidence: number;
  source: "saved" | "generated" | "none";
  category?:
    | "company-interest"
    | "role-interest"
    | "fit"
    | "technical-project"
    | "preferred-language"
    | "work-authorization"
    | "sponsorship"
    | "relocation"
    | "salary"
    | "availability";
  reason: string;
}

type Category = NonNullable<ScreeningAnswerResult["category"]>;

const CATEGORY_PATTERNS: Array<{ category: Category; patterns: RegExp[] }> = [
  {
    category: "company-interest",
    patterns: [
      /why (?:are you|do you want|would you be) interested in (?:this|our) company/i,
      /why .*work (?:at|for) .+/i,
      /why do you want to join/i,
    ],
  },
  {
    category: "role-interest",
    patterns: [
      /why (?:are you|do you want|would you be) interested in (?:this|the) role/i,
      /why (?:this|the) position/i,
      /what interests you about (?:this|the) role/i,
      /what interests you about (?:this|the) position/i,
    ],
  },
  {
    category: "fit",
    patterns: [
      /why (?:are you|would you be) (?:a )?good fit/i,
      /why should we hire you/i,
      /what makes you a strong candidate/i,
      /why are you qualified/i,
    ],
  },
  {
    category: "technical-project",
    patterns: [
      /describe (?:a|one) technical project/i,
      /tell us about (?:a|one) technical project/i,
      /technical project/i,
      /project you are proud of/i,
    ],
  },
  {
    category: "preferred-language",
    patterns: [
      /preferred programming language/i,
      /favorite programming language/i,
      /primary programming language/i,
      /what programming language/i,
    ],
  },
  {
    category: "work-authorization",
    patterns: [
      /authorized to work/i,
      /work authorization/i,
      /legally authorized/i,
      /employment authorization/i,
    ],
  },
  {
    category: "sponsorship",
    patterns: [
      /require sponsorship/i,
      /visa sponsorship/i,
      /sponsorship now or in the future/i,
      /need sponsorship/i,
    ],
  },
  {
    category: "relocation",
    patterns: [
      /willing to relocate/i,
      /open to relocation/i,
      /relocate/i,
    ],
  },
  {
    category: "salary",
    patterns: [
      /salary expectation/i,
      /salary expectations/i,
      /desired salary/i,
      /expected compensation/i,
      /compensation expectation/i,
    ],
  },
  {
    category: "availability",
    patterns: [
      /earliest start date/i,
      /when can you start/i,
      /start date/i,
      /available to start/i,
    ],
  },
];

function normalizePrompt(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function detectCategory(prompt: string): Category | undefined {
  for (const item of CATEGORY_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(prompt))) {
      return item.category;
    }
  }
  return undefined;
}

function findExactSavedAnswer(profile: Profile, prompt: string, length: AnswerLength) {
  const normalizedPrompt = normalizePrompt(prompt);
  const candidates = profile.canonicalProfile.prewrittenAnswers
    .map((entry) => {
      const normalizedCandidate = normalizePrompt(entry.prompt);
      let score = 0;
      if (normalizedPrompt === normalizedCandidate) {
        score += 10;
      }
      if (normalizedPrompt.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedPrompt)) {
        score += 6;
      }
      const promptTerms = new Set(normalizedPrompt.split(" "));
      for (const term of normalizedCandidate.split(" ")) {
        if (promptTerms.has(term)) {
          score += 1;
        }
      }
      if (entry.length === length) {
        score += 2;
      }
      return { entry, score };
    })
    .filter((candidate) => candidate.score >= 5)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.entry;
}

function interpolate(template: string, context: ScreeningAnswerContext) {
  return template
    .replace(/\{companyName\}/g, context.companyName ?? "the company")
    .replace(/\{roleTitle\}/g, context.roleTitle ?? "this role");
}

function getTopProject(profile: Profile): ProjectEntry | undefined {
  return profile.canonicalProfile.projects[0];
}

function getPreferredLanguage(profile: Profile) {
  return profile.canonicalProfile.technicalSkills.languages[0]
    ?? profile.canonicalProfile.technicalSkills.other[0];
}

function trimForShort(answer: string) {
  return answer.length <= 160 ? answer : `${answer.slice(0, 157).trimEnd()}...`;
}

function categoryAnswer(
  profile: Profile,
  category: Category,
  length: AnswerLength,
  context: ScreeningAnswerContext,
): ScreeningAnswerResult {
  const desiredTitle = context.roleTitle ?? profile.canonicalProfile.jobPreferences.desiredTitles[0] ?? "this role";
  const topProject = getTopProject(profile);
  const preferredLanguage = getPreferredLanguage(profile);

  switch (category) {
    case "company-interest": {
      const template =
        length === "short"
          ? "I am interested in {companyName} because the role aligns well with my background and the work seems meaningful."
          : "I am interested in {companyName} because the opportunity aligns closely with my background, technical interests, and the kind of impact I want to have. I am especially drawn to a role where I can contribute thoughtfully, keep learning, and help ship strong engineering work.";
      return {
        answer: interpolate(template, context),
        confidence: 0.76,
        source: "generated",
        category,
        reason: "Generated a safe company-interest answer from saved profile context.",
      };
    }
    case "role-interest": {
      const template =
        length === "short"
          ? "I am interested in {roleTitle} because it matches my strengths and the kind of work I want to keep growing in."
          : "I am interested in {roleTitle} because it matches the direction I want to keep growing in and fits well with my technical background. The role appears to emphasize the kind of problem solving, engineering judgment, and collaboration that I enjoy most.";
      return {
        answer: interpolate(template, context),
        confidence: 0.8,
        source: "generated",
        category,
        reason: "Generated a safe role-interest answer from saved profile context.",
      };
    }
    case "fit": {
      const skillLine = [
        profile.canonicalProfile.technicalSkills.languages.slice(0, 2).join(", "),
        profile.canonicalProfile.technicalSkills.frameworks.slice(0, 2).join(", "),
      ]
        .filter(Boolean)
        .join("; ");
      const template =
        length === "short"
          ? `I am a good fit because my background aligns with ${desiredTitle} work and I can contribute with ${skillLine || "a strong technical foundation"}.`
          : `I believe I am a good fit because my background aligns well with ${desiredTitle} work, and I can contribute with a strong technical foundation, thoughtful execution, and the ability to learn quickly. My profile highlights experience with ${skillLine || "relevant engineering tools and technologies"}, and I would bring a practical, collaborative approach to the role.`;
      return {
        answer: template,
        confidence: 0.82,
        source: "generated",
        category,
        reason: "Generated a fit answer using saved technical background only.",
      };
    }
    case "technical-project": {
      if (!topProject?.name && !topProject?.summary) {
        return {
          answer: undefined,
          confidence: 0.2,
          source: "none",
          category,
          reason: "No saved project details were available.",
        };
      }
      const technologies = topProject.technologies.slice(0, 4).join(", ");
      const longAnswer = `${topProject.name ?? "One project I am proud of"} involved ${topProject.summary ?? "building a technical solution from concept to delivery"}. ${technologies ? `I used ${technologies} to implement it.` : ""}`.trim();
      return {
        answer: length === "short" ? trimForShort(longAnswer) : longAnswer,
        confidence: 0.9,
        source: "generated",
        category,
        reason: "Generated a project answer directly from saved project data.",
      };
    }
    case "preferred-language": {
      if (!preferredLanguage) {
        return {
          answer: undefined,
          confidence: 0.2,
          source: "none",
          category,
          reason: "No saved programming language was available.",
        };
      }
      return {
        answer:
          length === "short"
            ? preferredLanguage
            : `${preferredLanguage} is one of my preferred programming languages because it supports the kind of problem solving and engineering work I enjoy most.`,
        confidence: 0.95,
        source: "generated",
        category,
        reason: "Returned preferred language from saved skills.",
      };
    }
    case "work-authorization": {
      const answer = profile.canonicalProfile.workAuthorization.workAuthorizationStatus;
      return {
        answer,
        confidence: answer ? 0.98 : 0.2,
        source: answer ? "generated" : "none",
        category,
        reason: answer ? "Returned saved work authorization status." : "No saved work authorization status was available.",
      };
    }
    case "sponsorship": {
      const needs = profile.canonicalProfile.workAuthorization.requiresSponsorship;
      return {
        answer: typeof needs === "boolean" ? (needs ? "Yes" : "No") : undefined,
        confidence: typeof needs === "boolean" ? 0.98 : 0.2,
        source: typeof needs === "boolean" ? "generated" : "none",
        category,
        reason:
          typeof needs === "boolean"
            ? "Returned saved sponsorship requirement."
            : "No saved sponsorship preference was available.",
      };
    }
    case "relocation": {
      const open = profile.canonicalProfile.relocationPreferences.openToRelocate;
      return {
        answer: typeof open === "boolean" ? (open ? "Yes" : "No") : undefined,
        confidence: typeof open === "boolean" ? 0.95 : 0.2,
        source: typeof open === "boolean" ? "generated" : "none",
        category,
        reason:
          typeof open === "boolean"
            ? "Returned saved relocation preference."
            : "No saved relocation preference was available.",
      };
    }
    case "salary": {
      const salary = profile.canonicalProfile.salaryPreferences.targetBase
        ?? profile.canonicalProfile.salaryPreferences.minimumBase;
      return {
        answer: salary,
        confidence: salary ? 0.94 : 0.2,
        source: salary ? "generated" : "none",
        category,
        reason: salary ? "Returned saved salary preference." : "No saved salary preference was available.",
      };
    }
    case "availability": {
      const start = profile.canonicalProfile.availability.startDate;
      return {
        answer: start,
        confidence: start ? 0.96 : 0.2,
        source: start ? "generated" : "none",
        category,
        reason: start ? "Returned saved availability start date." : "No saved start date was available.",
      };
    }
  }
}

export class ScreeningAnswerService {
  constructor(private readonly profile: Profile) {}

  answerQuestion(
    prompt: string,
    length: AnswerLength,
    context: ScreeningAnswerContext = {},
  ): ScreeningAnswerResult {
    const saved = findExactSavedAnswer(this.profile, prompt, length);
    if (saved) {
      return {
        answer: saved.answer,
        confidence: 0.98,
        source: "saved",
        reason: "Used an exact or near-exact saved answer from the profile.",
      };
    }

    const category = detectCategory(prompt);
    if (!category) {
      return {
        answer: undefined,
        confidence: 0.2,
        source: "none",
        reason: "No safe centralized match was found for this prompt.",
      };
    }

    const result = categoryAnswer(this.profile, category, length, context);
    if (!result.answer) {
      return result;
    }

    return {
      ...result,
      answer: length === "short" ? trimForShort(sentenceCase(result.answer)) : sentenceCase(result.answer),
    };
  }
}
