import { X, Building, User, MessageCircle, Code, Mail, Sparkles } from "lucide-react";

type SessionActionType = "prep" | "follow-up";

interface FollowUpDraft {
  label: string;
  subject: string;
  body: string;
}

export interface SessionModalData {
  id: number;
  name: string;
  avatar: string;
  role: string;
  company: string;
  time?: string;
  status?: string;
  location: string;
  isLive: boolean;
  actionType?: SessionActionType;
  conversationSummary?: string;
  personalDetails?: string[];
  nextSteps?: string[];
  followUpDrafts?: FollowUpDraft[];
}

interface PrepModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionModalData;
}

const companyData: Record<string, {
  mission: string;
  values: string[];
  leetcodeTopics: string[];
}> = {
  "The Walt Disney Company": {
    mission: "To entertain, inform and inspire people around the globe through the power of unparalleled storytelling, reflecting the iconic brands, creative minds and innovative technologies.",
    values: ["Innovation", "Quality", "Community", "Storytelling", "Optimism", "Decency"],
    leetcodeTopics: ["Dynamic Programming", "Graph Algorithms", "System Design"],
  },
  "eBay": {
    mission: "To be the world's favorite destination for discovering great value and unique selection.",
    values: ["We are bold", "We are inclusive", "We are customer-focused", "We are innovative"],
    leetcodeTopics: ["Arrays & Strings", "Hash Tables", "Database Design"],
  },
  "Google": {
    mission: "To organize the world's information and make it universally accessible and useful.",
    values: ["Focus on the user", "Democracy on the web", "Fast is better than slow", "Innovation"],
    leetcodeTopics: ["Trees & Graphs", "Recursion", "Algorithm Optimization"],
  },
};

const interviewerFacts: Record<string, string[]> = {
  "Kristin Watson": [
    "Previously led engineering teams at Netflix",
    "Published speaker on tech leadership at 3 major conferences",
    "Active contributor to open-source React libraries",
  ],
};

const interviewQuestions = [
  "How does this role align with the company's mission to innovate in user experience?",
  "What are the biggest technical challenges the team is currently tackling?",
  "How does the team balance maintaining legacy systems while building new features?",
];

export function PrepModal({ isOpen, onClose, session }: PrepModalProps) {
  if (!isOpen) return null;

  const isFollowUp = session.actionType === "follow-up";
  const companyInfo = companyData[session.company] || companyData["The Walt Disney Company"];
  const interviewerInfo = interviewerFacts[session.name] || interviewerFacts["Kristin Watson"];
  const followUpDrafts = session.followUpDrafts ?? [];
  const personalDetails = session.personalDetails ?? [];
  const nextSteps = session.nextSteps ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2>{isFollowUp ? "Personalized Follow-Up" : "Interview Prep"}</h2>
            <p className="text-sm text-muted-foreground">
              {session.role} at {session.company}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {isFollowUp ? (
            <>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle className="w-5 h-5 text-[#0f766e]" />
                  <h3>Conversation Recap</h3>
                </div>
                <div className="rounded-lg bg-[#ecfeff] p-4 space-y-4">
                  <p className="text-sm text-slate-700">
                    {session.conversationSummary ||
                      `Your conversation with ${session.name} gave you enough detail to send a warm, specific note instead of a generic thank-you.`}
                  </p>
                  {nextSteps.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">What to reinforce</p>
                      <ul className="space-y-2">
                        {nextSteps.map((step) => (
                          <li key={step} className="flex items-start gap-2 text-sm text-slate-700">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0f766e]" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-[#7c3aed]" />
                  <h3>Personal Details to Weave In</h3>
                </div>
                <div className="rounded-lg bg-[#f5f3ff] p-4">
                  <ul className="space-y-2">
                    {personalDetails.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#7c3aed]" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-5 h-5 text-[#2563eb]" />
                  <h3>Mock Follow-Up Emails</h3>
                </div>
                <div className="space-y-4">
                  {followUpDrafts.map((draft) => (
                    <div key={draft.subject} className="rounded-xl border border-[#dbeafe] bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{draft.label}</p>
                          <p className="text-xs text-muted-foreground">Subject: {draft.subject}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-medium text-[#2563eb]">
                          <Sparkles className="h-3.5 w-3.5" />
                          Personalized draft
                     