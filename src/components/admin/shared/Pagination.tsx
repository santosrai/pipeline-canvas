import React from 'react';

interface PaginationProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  limit: number;
  totalShown?: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  hasMore,
  loading,
  onLoadMore,
  limit: _limit,
  totalShown,
}) => {
  if (!hasMore && (!totalShown || totalShown === 0)) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        )}
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{totalShown || 0}</span> results
            {hasMore && ' (more available)'}
          </p>
        </div>
        <div>
          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={loading}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
