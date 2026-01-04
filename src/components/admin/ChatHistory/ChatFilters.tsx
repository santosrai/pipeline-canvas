import React from 'react';
import { ChatFilters as ChatFiltersType } from '../../../stores/admin/adminChatStore';
import { SearchBar } from '../shared/SearchBar';

interface ChatFiltersProps {
  filters: ChatFiltersType;
  onFiltersChange: (filters: Partial<ChatFiltersType>) => void;
}

export const ChatFilters: React.FC<ChatFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <SearchBar
            value={filters.search || ''}
            onChange={(value) => onFiltersChange({ search: value || undefined })}
            placeholder="Search message content..."
          />
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => onFiltersChange({ date_from: e.target.value || undefined })}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => onFiltersChange({ date_to: e.target.value || undefined })}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="To"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.message_type || ''}
          onChange={(e) => onFiltersChange({ message_type: e.target.value || undefined })}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          <option value="user">User</option>
          <option value="ai">AI</option>
          <option value="tool_call">Tool Call</option>
          <option value="tool_result">Tool Result</option>
        </select>
        <input
          type="text"
          value={filters.user_id || ''}
          onChange={(e) => onFiltersChange({ user_id: e.target.value || undefined })}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          placeholder="User ID"
        />
        <input
          type="text"
          value={filters.session_id || ''}
          onChange={(e) => onFiltersChange({ session_id: e.target.value || undefined })}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          placeholder="Session ID"
        />
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={filters.include_deleted || false}
            onChange={(e) => onFiltersChange({ include_deleted: e.target.checked })}
            className="mr-2"
          />
          <span className="text-sm text-gray-700">Include Deleted</span>
        </label>
      </div>
    </div>
  );
};
