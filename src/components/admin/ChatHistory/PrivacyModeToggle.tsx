import React from 'react';

interface PrivacyModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const PrivacyModeToggle: React.FC<PrivacyModeToggleProps> = ({
  enabled,
  onToggle,
}) => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="chat-privacy-mode"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
        />
        <label htmlFor="chat-privacy-mode" className="ml-2 text-sm font-medium text-gray-700">
          Privacy Mode
        </label>
      </div>
      {enabled && (
        <div className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
          ⚠️ Message content is hidden. Click to view full content (requires explicit opt-in).
        </div>
      )}
    </div>
  );
};
