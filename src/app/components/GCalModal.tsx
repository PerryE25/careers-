import { X, Calendar, Check } from "lucide-react";

interface GCalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GCalModal({ isOpen, onClose }: GCalModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h3>Google Calendar Integration</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-[#f0f4ff] rounded-lg">
            <Calendar className="w-8 h-8 text-[#6366f1]" />
            <div className="flex-1">
              <h4 className="font-medium mb-1">Connect Your Calendar</h4>
              <p className="text-sm text-muted-foreground">
                Sync your interview sessions with Google Calendar automatically
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
              <Check className="w-5 h-5 text-[#16a34a]" />
              <span className="text-sm">Auto-sync interview schedules</span>
            </div>
            <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
              <Check className="w-5 h-5 text-[#16a34a]" />
              <span className="text-sm">Get reminders before interviews</span>
            </div>
            <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
              <Check className="w-5 h-5 text-[#16a34a]" />
              <span className="text-sm">Block time for interview prep</span>
            </div>
          </div>

          <button className="w-full px-4 py-3 bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Connect with Google Calendar</span>
          </button>

          <p className="text-xs text-muted-foreground text-center">
            We'll only access your calendar events. You can disconnect anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
