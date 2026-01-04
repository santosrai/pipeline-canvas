import React from 'react';

interface PrivacyControlsProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  maskedFields?: string[];
}

export const PrivacyControls: React.FC<PrivacyControlsProps> = ({
  enabled,
  onToggle,
  maskedFields = ['email', 'username'],
}) => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="privacy-mode"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
        />
        <label htmlFor="privacy-mode" className="ml-2 text-sm font-medium text-gray-700">
          Privacy Mode
        </label>
      </div>
      {enabled && (
        <div className="text-sm text-gray-600">
          Masking: {maskedFields.join(', ')}
        </div>
      )}
      {enabled && (
        <div className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
          ⚠️ Sensitive data is masked. Full content requires explicit opt-in.
        </div>
      )}
    </div>
  );
};
