import { X } from "lucide-react";
import { useState } from "react";

interface DatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (startDate: string, endDate: string) => void;
}

export function DatePicker({ isOpen, onClose, onSelect }: DatePickerProps) {
  const [startDate, setStartDate] = useState("2023-06-13");
  const [endDate, setEndDate] = useState("2023-07-14");

  if (!isOpen) return null;

  const handleApply = () => {
    onSelect(startDate, endDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md m-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3>Select Date Range</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
          </div>
          <div>
            <label className="block text-sm mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#5558e3] transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
