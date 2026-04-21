import { X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type WorkType = "remote" | "hybrid" | "on-site";
type ExperienceTarget = "new-grad" | "entry-level";
type ApplyMode = "conservative" | "balanced" | "aggressive";

const DEFAULT_PREFERENCES = {
  desiredRoles: [
    "Software Engineer",
    "New Grad Software Engineer",
    "Associate Software Engineer",
    "Backend Engineer",
    "Frontend Engineer",
    "Full Stack Engineer",
  ],
  locations: ["Remote", "Austin", "Houston", "Dallas"],
  workType: "remote" as WorkType,
  experienceLevel: "new-grad" as ExperienceTarget,
  startWindow: "Dec 2026 - Jan 2027",
  salaryRange: [90000, 140000] as [number, number],
  techStack: ["React", "TypeScript", "JavaScript", "Node.js", "Java", "Python"],
  preferredCompanies: "",
  excludedCompanies: "",
  applyMode: "balanced" as ApplyMode,
  requiredKeywords: "software engineer, new grad, full-time",
};

export function PreferencesModal({ isOpen, onClose }: PreferencesModalProps) {
  const [desiredRoles, setDesiredRoles] = useState<string[]>(DEFAULT_PREFERENCES.desiredRoles);
  const [locations, setLocations] = useState<string[]>(DEFAULT_PREFERENCES.locations);
  const [workType, setWorkType] = useState<WorkType>(DEFAULT_PREFERENCES.workType);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceTarget>(DEFAULT_PREFERENCES.experienceLevel);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [salaryRange, setSalaryRange] = useState<[number, number]>(DEFAULT_PREFERENCES.salaryRange);
  const [techStack, setTechStack] = useState<string[]>(DEFAULT_PREFERENCES.techStack);
  const [applyMode, setApplyMode] = useState<ApplyMode>(DEFAULT_PREFERENCES.applyMode);
  const [newRole, setNewRole] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [preferredCompanies, setPreferredCompanies] = useState(DEFAULT_PREFERENCES.preferredCompanies);
  const [excludedCompanies, setExcludedCompanies] = useState(DEFAULT_PREFERENCES.excludedCompanies);
  const [requiredKeywords, setRequiredKeywords] = useState(DEFAULT_PREFERENCES.requiredKeywords);
  const [startWindow, setStartWindow] = useState(DEFAULT_PREFERENCES.startWindow);

  useEffect(() => {
    const saved = localStorage.getItem("careers_plus_preferences");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setDesiredRoles(parsed.desiredRoles ?? DEFAULT_PREFERENCES.desiredRoles);
      setLocations(parsed.locations ?? DEFAULT_PREFERENCES.locations);
      setWorkType(parsed.workType ?? DEFAULT_PREFERENCES.workType);
      setExperienceLevel(parsed.experienceLevel ?? DEFAULT_PREFERENCES.experienceLevel);
      setShowAdvanced(parsed.showAdvanced ?? false);
      setSalaryRange(parsed.salaryRange ?? DEFAULT_PREFERENCES.salaryRange);
      setTechStack(parsed.techStack ?? DEFAULT_PREFERENCES.techStack);
      setApplyMode(parsed.applyMode ?? DEFAULT_PREFERENCES.applyMode);
      setPreferredCompanies(parsed.preferredCompanies ?? DEFAULT_PREFERENCES.preferredCompanies);
      setExcludedCompanies(parsed.excludedCompanies ?? DEFAULT_PREFERENCES.excludedCompanies);
      setRequiredKeywords(parsed.requiredKeywords ?? DEFAULT_PREFERENCES.requiredKeywords);
      setStartWindow(parsed.startWindow ?? DEFAULT_PREFERENCES.startWindow);
    } catch {
      // ignore malformed localStorage
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const addRole = () => {
    const value = newRole.trim();
    if (!value || desiredRoles.includes(value)) return;
    setDesiredRoles([...desiredRoles, value]);
    setNewRole("");
  };

  const removeRole = (role: string) => {
    setDesiredRoles(desiredRoles.filter((r) => r !== role));
  };

  const addLocation = () => {
    const value = newLocation.trim();
    if (!value || locations.includes(value)) return;
    setLocations([...locations, value]);
    setNewLocation("");
  };

  const removeLocation = (location: string) => {
    setLocations(locations.filter((l) => l !== location));
  };

  const handleSave = () => {
    const payload = {
      desiredRoles,
      locations,
      workType,
      experienceLevel,
      startWindow,
      showAdvanced,
      salaryRange,
      techStack,
      preferredCompanies,
      excludedCompanies,
      applyMode,
      requiredKeywords,
      employmentType: "full-time",
      roleFamily: "software_engineering",
      preferredStartWindowStart: "2026-12-01",
      preferredStartWindowEnd: "2027-01-31",
    };

    localStorage.setItem("careers_plus_preferences", JSON.stringify(payload));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2>Edit Job Preferences</h2>
            <p className="text-sm text-muted-foreground">
              Full-time software engineering roles starting Dec 2026 to Jan 2027
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
          <div className="rounded-xl border border-[#e0e7ff] bg-[#f8faff] p-4">
            <p className="text-sm font-medium text-[#3730a3]">Current Target</p>
            <p className="mt-1 text-sm text-muted-foreground">
              SWE / New Grad / Full-Time / Dec 2026–Jan 2027
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block mb-2 font-medium">Desired Roles</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {desiredRoles.map((role) => (
                  <div
                    key={role}
                    className="flex items-center gap-2 px-3 py-1 bg-[#eef2ff] text-[#6366f1] rounded-full"
                  >
                    <span className="text-sm">{role}</span>
                    <button
                      onClick={() => removeRole(role)}
                      className="hover:bg-[#6366f1] hover:text-white rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a role..."
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRole()}
                  className="flex-1 px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
                <button
                  onClick={addRole}
                  className="px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block mb-2 font-medium">Locations</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {locations.map((location) => (
                  <div
                    key={location}
                    className="flex items-center gap-2 px-3 py-1 bg-[#f0fdf4] text-[#16a34a] rounded-full"
                  >
                    <span className="text-sm">{location}</span>
                    <button
                      onClick={() => removeLocation(location)}
                      className="hover:bg-[#16a34a] hover:text-white rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a location..."
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLocation()}
                  className="flex-1 px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
                <button
                  onClick={addLocation}
                  className="px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block mb-2 font-medium">Work Type</label>
              <div className="flex gap-2">
                {["remote", "hybrid", "on-site"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setWorkType(type as WorkType)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      workType === type
                        ? "bg-[#6366f1] border-[#6366f1] text-white"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block mb-2 font-medium">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value as ExperienceTarget)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
              >
                <option value="new-grad">New Grad</option>
                <option value="entry-level">Entry Level (0–2 years)</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-medium">Preferred Start Window</label>
              <input
                type="text"
                value={startWindow}
                onChange={(e) => setStartWindow(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                placeholder="Dec 2026 - Jan 2027"
              />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-[#6366f1] hover:text-[#5558e3] transition-colors mb-4"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span className="font-medium">Advanced Preferences</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 font-medium">Salary Range (USD)</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={salaryRange[0]}
                      onChange={(e) =>
                        setSalaryRange([Number.parseInt(e.target.value || "0", 10), salaryRange[1]])
                      }
                      className="flex-1 px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      value={salaryRange[1]}
                      onChange={(e) =>
                        setSalaryRange([salaryRange[0], Number.parseInt(e.target.value || "0", 10)])
                      }
                      className="flex-1 px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-2 font-medium">Tech Stack</label>
                  <div className="flex flex-wrap gap-2">
                    {techStack.map((tech) => (
                      <div
                        key={tech}
                        className="flex items-center gap-2 px-3 py-1 bg-[#fef3c7] text-[#b45309] rounded-full"
                      >
                        <span className="text-sm">{tech}</span>
                        <button
                          onClick={() => setTechStack(techStack.filter((t) => t !== tech))}
                          className="hover:bg-[#f59e0b] hover:text-white rounded-full p-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block mb-2 font-medium">Preferred Companies</label>
                  <input
                    type="text"
                    value={preferredCompanies}
                    onChange={(e) => setPreferredCompanies(e.target.value)}
                    placeholder="e.g. Google, Microsoft, Stripe"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-medium">Excluded Companies</label>
                  <input
                    type="text"
                    value={excludedCompanies}
                    onChange={(e) => setExcludedCompanies(e.target.value)}
                    placeholder="Companies to avoid"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="mb-4 font-medium">Automation Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-medium">Apply Mode</label>
                <div className="flex gap-2">
                  {[
                    { value: "conservative", label: "Conservative" },
                    { value: "balanced", label: "Balanced" },
                    { value: "aggressive", label: "Aggressive" },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setApplyMode(mode.value as ApplyMode)}
                      className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                        applyMode === mode.value
                          ? "bg-[#6366f1] border-[#6366f1] text-white"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block mb-2 font-medium">Required Keywords</label>
                <input
                  type="text"
                  value={requiredKeywords}
                  onChange={(e) => setRequiredKeywords(e.target.value)}
                  placeholder="e.g. software engineer, new grad, full-time"
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Jobs should strongly match SWE, full-time, and new-grad/entry-level intent.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-border px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-6 py-3 border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}