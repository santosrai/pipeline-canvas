import React, { useEffect } from 'react';
import { useAdminChatStore } from '../../../stores/admin/adminChatStore';
import { MessageThread } from './MessageThread';
import { MessageTable } from './MessageTable';
import { ChatFilters } from './ChatFilters';
import { PrivacyModeToggle } from './PrivacyModeToggle';
import { Pagination } from '../shared/Pagination';
import { SearchBar } from '../shared/SearchBar';

export const ChatHistoryView: React.FC = () => {
  const {
    messages,
    loading,
    error,
    hasMore,
    limit,
    filters,
    privacyMode,
    viewMode,
    loadMessages,
    setFilters,
    setPrivacyMode,
    setViewMode,
    setLimit,
  } = useAdminChatStore();

  useEffect(() => {
    loadMessages(true);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadMessages(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Chat History</h2>
        <div className="flex items-center space-x-4">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </div>

      <PrivacyModeToggle enabled={privacyMode} onToggle={setPrivacyMode} />

      <div className="bg-white shadow rounded-lg">
        <div className="p-4 space-y-4">
          <ChatFilters filters={filters} onFiltersChange={setFilters} />

          {viewMode === 'both' && (
            <div className="flex space-x-2">
              <button
                onClick={() => setViewMode('thread')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Thread View
              </button>
              <button
                onClick={() => setViewMode('table')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Table View
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {viewMode === 'thread' || viewMode === 'both' ? (
            <MessageThread messages={messages} loading={loading} privacyMode={privacyMode} />
          ) : null}

          {viewMode === 'table' || viewMode === 'both' ? (
            <MessageTable messages={messages} loading={loading} privacyMode={privacyMode} />
          ) : null}

          <Pagination
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
            limit={limit}
            totalShown={messages.length}
          />
        </div>
      </div>
    </div>
  );
};
