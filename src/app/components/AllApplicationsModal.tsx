import { X, Search, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { TrackerItem } from "../lib/api";

interface AllApplicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TrackerItem[];
}

const statusConfig = {
  "Not Started": { color: "bg-slate-500 text-white" },
  "In Progress": { color: "bg-[#f59e0b] text-white" },
  Applied: { color: "bg-[#16a34a] text-white" },
  "Needs Review": { color: "bg-[#d97706] text-white" },
  Failed: { color: "bg-[#ef4444] text-white" },
  Duplicate: { color: "bg-[#7c3aed] text-white" },
};

function formatDate(value?: string) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AllApplicationsModal({ isOpen, onClose, items }: AllApplicationsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 100;

  const filteredApplications = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }

    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      [
        item.application.companyName,
        item.application.roleTitle,
        item.application.status,
        item.application.atsProvider,
        item.application.location,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [items, searchQuery]);

  const totalPages = Math.ceil(filteredApplications.length / itemsPerPage);
  const currentApplications = filteredApplications.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage,
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2>All Applications</h2>
            <p className="text-sm text-muted-foreground">
              {filteredApplications.length} total applications
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by company, role, provider, location, or status..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(0);
              }}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full">
            <thead className="bg-[#fafbfc] sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Provider</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Applied</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {currentApplications.map((item, index) => {
                const status =
                  statusConfig[item.application.status as keyof typeof statusConfig] ??
                  statusConfig["Not Started"];
                return (
                  <tr key={item.application.id} className="hover:bg-[#fafbfc] transition-colors align-top">
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {currentPage * itemsPerPage + index + 1}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div>{item.application.companyName || item.job?.company || "Unknown company"}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.application.location || item.job?.location || "Location unavailable"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{item.application.roleTitle || item.job?.title || "Untitled role"}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.application.salary
                          ? `${item.application.lastCompletedStep || "No completed step yet"} · ${item.application.salary}`
                          : item.application.lastCompletedStep || "No completed step yet"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {item.application.atsProvider || item.job?.provider || "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(item.application.applicationDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${status.color}`}
                        >
                          {item.application.status}
                        </span>
                        {item.application.duplicate && item.application.duplicateReasons?.[0] && (
                          <div className="text-xs text-muted-foreground max-w-[220px]">
                            {item.application.duplicateReasons[0].message}
                          </div>
                        )}
                        {!item.application.duplicate && item.application.reviewSummary?.blockingReasons[0] && (
                          <div className="text-xs text-muted-foreground max-w-[220px]">
                            {item.application.reviewSummary.blockingReasons[0]}
                          </div>
                        )}
                        {item.application.lastError?.readableMessage && (
                          <div className="text-xs text-muted-foreground max-w-[220px]">
                            {item.application.lastError.readableMessage}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-muted-foreground">
            Showing {filteredApplications.length === 0 ? 0 : currentPage * itemsPerPage + 1} -{" "}
            {Math.min((currentPage + 1) * itemsPerPage, filteredApplications.length)} of {filteredApplications.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}
              disabled={currentPage >= totalPages - 1 || totalPages === 0}
              className="px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
