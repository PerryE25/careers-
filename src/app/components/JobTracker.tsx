import { Users, Calendar, TrendingUp, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarIcon, MapPin, Video, Edit, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { DatePicker } from "./DatePicker";
import { GCalModal } from "./GCalModal";
import { PrepModal } from "./PrepModal";
import { AllApplicationsModal } from "./AllApplicationsModal";
import { fetchApplications, type TrackerItem } from "../lib/api";

const topCompanies = [
  {
    name: "Microsoft",
    logo: "https://logo.clearbit.com/microsoft.com",
    count: 8542,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Apple",
    logo: "https://logo.clearbit.com/apple.com",
    count: 1148,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Amazon",
    logo: "https://logo.clearbit.com/amazon.com",
    count: 6690,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Google",
    logo: "https://logo.clearbit.com/google.com",
    count: 5028,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Xiaomi",
    logo: "https://logo.clearbit.com/mi.com",
    count: 5948,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Huawei",
    logo: "https://logo.clearbit.com/huawei.com",
    count: 4349,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Adidas",
    logo: "https://logo.clearbit.com/adidas.com",
    count: 1784,
    category: "Software, OS, AI, Tech",
  },
  {
    name: "Dell",
    logo: "https://logo.clearbit.com/dell.com",
    count: 8811,
    category: "Software, OS, AI, Tech",
  },
];

const upcomingSessions = [
  {
    id: 1,
    name: "Kristin Watson",
    avatar: "https://i.pravatar.cc/150?img=5",
    role: "Software Engineer",
    company: "The Walt Disney Company",
    time: "7:32 PM, May 18, 2025 (UTC+08:00)",
    location: "Virtual",
    isLive: false,
  },
  {
    id: 2,
    name: "Kristin Watson",
    avatar: "https://i.pravatar.cc/150?img=5",
    role: "Products Designer",
    company: "eBay",
    status: "Interview is Ongoing Virtually",
    location: "Virtual - Zoom",
    isLive: true,
  },
  {
    id: 3,
    name: "Kristin Watson",
    avatar: "https://i.pravatar.cc/150?img=5",
    role: "Junior UX Designer",
    company: "Google",
    status: "Interview is Ongoing Virtually",
    location: "Virtual",
    isLive: true,
  },
];

const statusConfig = {
  "Not Started": { label: "Not Started", color: "bg-slate-500" },
  "In Progress": { label: "In Progress", color: "bg-[#f59e0b]" },
  Applied: { label: "Applied", color: "bg-[#16a34a]" },
  "Needs Review": { label: "Needs review", color: "bg-[#d97706]" },
  Failed: { label: "Failed", color: "bg-[#ef4444]" },
  Duplicate: { label: "Duplicate", color: "bg-[#7c3aed]" },
};

const tabs = ["Upcoming", "Pending", "Recurring", "Past", "Cancelled"];

function formatTrackerDate(value?: string) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function JobTracker() {
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isCompanyDatePickerOpen, setIsCompanyDatePickerOpen] = useState(false);
  const [isGCalModalOpen, setIsGCalModalOpen] = useState(false);
  const [isPrepModalOpen, setIsPrepModalOpen] = useState(false);
  const [isAllAppsModalOpen, setIsAllAppsModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [dateRange, setDateRange] = useState("13 June 2023 - 14 July 2023");
  const [trackerItems, setTrackerItems] = useState<TrackerItem[]>([]);
  const [stats, setStats] = useState([
    {
      label: "Total Applications",
      value: "0",
      subtext: "Synced from backend",
      icon: Users,
    },
    {
      label: "Applied",
      value: "0",
      subtext: "Completed submissions",
      icon: Calendar,
    },
    {
      label: "Applications in Progress",
      value: "0",
      subtext: "Runs still active or queued",
      icon: TrendingUp,
    },
  ]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handlePrepClick = (session: any) => {
    setSelectedSession(session);
    setIsPrepModalOpen(true);
  };

  const handleDateSelect = (startDate: string, endDate: string) => {
    const start = new Date(startDate).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const end = new Date(endDate).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    setDateRange(`${start} - ${end}`);
  };

  useEffect(() => {
    let active = true;
    void fetchApplications()
      .then((result) => {
        if (!active) {
          return;
        }
        setTrackerItems(result.items);
        setStats([
          {
            label: "Total Applications",
            value: String(result.stats.totalApplications),
            subtext: "Saved application records",
            icon: Users,
          },
          {
            label: "Applied",
            value: String(result.stats.applied),
            subtext: "Final stage reached",
            icon: Calendar,
          },
          {
            label: "Applications in Progress",
            value: String(result.stats.inProgress),
            subtext: `${result.stats.needsReview} need review, ${result.stats.failed} failed, ${result.stats.duplicate} duplicates blocked`,
            icon: TrendingUp,
          },
        ]);
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load tracker");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <h1 className="mb-6">Dashboard</h1>
      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onSelect={handleDateSelect}
      />
      <DatePicker
        isOpen={isCompanyDatePickerOpen}
        onClose={() => setIsCompanyDatePickerOpen(false)}
        onSelect={handleDateSelect}
      />
      <GCalModal
        isOpen={isGCalModalOpen}
        onClose={() => setIsGCalModalOpen(false)}
      />
      {selectedSession && (
        <PrepModal
          isOpen={isPrepModalOpen}
          onClose={() => setIsPrepModalOpen(false)}
          session={selectedSession}
        />
      )}
      <AllApplicationsModal
        isOpen={isAllAppsModalOpen}
        onClose={() => setIsAllAppsModalOpen(false)}
        items={trackerItems}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isClickable = stat.label === "Total Applications";
          const CardComponent = isClickable ? "button" : "div";

          return (
            <CardComponent
              key={stat.label}
              onClick={isClickable ? () => setIsAllAppsModalOpen(true) : undefined}
              className={`bg-white rounded-xl border border-border p-6 ${
                isClickable
                  ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all text-left"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mb-1">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.subtext}</p>
            </CardComponent>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Main Application Status */}
        <div className="flex-1 space-y-6">
          <div className="bg-white rounded-xl border border-border">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2>Application Status</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                  />
                </div>
                <button
                  onClick={() => setIsDatePickerOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span>{dateRange}</span>
                </button>
              </div>
            </div>
            <div className="p-6">
              {loadError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loadError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {trackerItems.map((item) => {
                  const status =
                    statusConfig[item.application.status as keyof typeof statusConfig] ??
                    statusConfig["Not Started"];
                  return (
                    <div
                      key={item.application.id}
                      className={`${status.color} rounded-xl p-4 text-white`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <img
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(item.job?.company || "Career Copilot")}&background=ffffff&color=111827`}
                          alt={item.job?.company || "Company"}
                          className="w-10 h-10 rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">
                            {item.application.roleTitle || item.job?.title || "Untitled role"}
                          </p>
                          <p className="text-xs opacity-90 truncate">
                            {item.application.companyName || item.job?.company || "Unknown company"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs opacity-80">Application Date</p>
                          <p className="text-sm">{formatTrackerDate(item.application.applicationDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs opacity-80">Provider</p>
                          <p className="text-sm capitalize">
                            {item.application.atsProvider || item.job?.provider || "unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs opacity-80">Step</p>
                          <p className="text-sm truncate">
                            {item.application.lastCompletedStep || "No completed step yet"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs opacity-80">Location</p>
                          <p className="text-sm truncate">
                            {item.application.location || item.job?.location || "Unknown"}
                          </p>
                        </div>
                        <span className="inline-flex px-3 py-1 bg-white/20 backdrop-blur-sm rounded-md text-xs font-medium">
                          {status.label}
                        </span>
                        {(item.application.unresolvedRequiredFields.length > 0 || item.application.failureScreenshotPaths.length > 0) && (
                          <p className="text-xs opacity-90 line-clamp-2">
                            {item.application.unresolvedRequiredFields.length > 0
                              ? `${item.application.unresolvedRequiredFields.length} unresolved required fields`
                              : `${item.application.failureScreenshotPaths.length} failure screenshots captured`}
                          </p>
                        )}
                        {item.application.salary && (
                          <p className="text-xs opacity-90 truncate">{item.application.salary}</p>
                        )}
                        {item.application.reviewSummary?.blockingReasons[0] && (
                          <p className="text-xs opacity-90 line-clamp-2">
                            {item.application.reviewSummary.blockingReasons[0]}
                          </p>
                        )}
                        {item.application.lastError?.readableMessage && (
                          <p className="text-xs opacity-90 line-clamp-2">
                            {item.application.lastError.readableMessage}
                          </p>
                        )}
                        {(item.application.status === "Failed" || item.application.status === "Needs Review") &&
                          item.application.notes && (
                          <p className="text-xs opacity-90 line-clamp-2">{item.application.notes}</p>
                        )}
                        {item.application.duplicate && item.application.duplicateReasons?.[0] && (
                          <p className="text-xs opacity-90 line-clamp-2">
                            {item.application.duplicateReasons[0].message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {trackerItems.length === 0 && (
                  <div className="col-span-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Your backend tracker is ready. Import profile text and start an automation run to populate this dashboard.
                  </div>
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-center gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronsLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <span className="text-sm text-muted-foreground px-4">
                  Page 1 of 10
                </span>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronsRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                  activeTab === tab
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6366f1]" />
                )}
              </button>
            ))}
          </div>

          {/* Upcoming Session */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2>{activeTab} Session</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                  />
                </div>
                <button
                  onClick={() => setIsGCalModalOpen(true)}
                  className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  Use GCal
                </button>
                <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span>This Week</span>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 border border-border rounded-xl hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={session.avatar}
                      alt={session.name}
                      className="w-12 h-12 rounded-full"
                    />
                    <div>
                      <p className="font-semibold">{session.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.role}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.company}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <CalendarIcon className="w-4 h-4" />
                        <span>{session.time || session.status}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{session.location}</span>
                        {session.location.includes("Zoom") && (
                          <span className="text-[#2D8CFF] font-medium">zoom</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrepClick(session)}
                        className="px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors flex items-center gap-2"
                      >
                        <Lightbulb className="w-4 h-4" />
                        Prep
                      </button>
                      {session.isLive ? (
                        <button className="px-4 py-2 bg-[#f59e0b] text-white rounded-lg hover:bg-[#ea9308] transition-colors flex items-center gap-2">
                          <Video className="w-4 h-4" />
                          Live Now
                        </button>
                      ) : (
                        <button className="px-4 py-2 border border-border rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80">
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3>Top Applicant Company</h3>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
              </div>
              <button
                onClick={() => setIsCompanyDatePickerOpen(true)}
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm whitespace-nowrap hover:bg-gray-50 transition-colors"
              >
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <span>This Month</span>
              </button>
            </div>
            <div className="space-y-3">
              {topCompanies.map((company, index) => (
                <div
                  key={company.name}
                  className="flex items-center gap-3 p-3 bg-[#fafbfc] rounded-lg"
                >
                  <div className="w-7 h-7 bg-white rounded flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0 border border-border">
                    {index + 1}
                  </div>
                  <img
                    src={company.logo}
                    alt={company.name}
                    className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-white p-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm">
                      {company.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {company.category}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm">{company.count}</p>
                    <p className="text-xs text-muted-foreground">
                      Applications
                    </p>
                    <p className="text-xs text-muted-foreground">This Month</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
