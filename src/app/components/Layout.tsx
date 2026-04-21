import { Outlet, NavLink } from "react-router";
import { Settings } from "lucide-react";
import { useState } from "react";
import { PreferencesModal } from "./PreferencesModal";
import logoImage from "../../imports/careers_plus_logo.png";

export function Layout() {
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d4f1f4] via-[#e5d9f2] to-[#d4c5f9]">
      <nav className="bg-white/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <img
              src={logoImage}
              alt="Careers+ Job Assistant"
              className="h-16 object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
            <div className="flex gap-8">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `text-sm transition-colors ${
                    isActive
                      ? "text-[#6366f1] font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/job-tracker"
                className={({ isActive }) =>
                  `text-sm transition-colors ${
                    isActive
                      ? "text-[#6366f1] font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                JobTracker
              </NavLink>
              <NavLink
                to="/upload-resume"
                className={({ isActive }) =>
                  `text-sm transition-colors ${
                    isActive
                      ? "text-[#6366f1] font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                Upload Resume
              </NavLink>
            </div>
          </div>
          <button
            onClick={() => setIsPreferencesOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Edit Preferences
          </button>
        </div>
      </nav>
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
      />
      <Outlet />
    </div>
  );
}
