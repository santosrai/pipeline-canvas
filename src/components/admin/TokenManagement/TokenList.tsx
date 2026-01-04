import React, { useEffect } from 'react';
import { useAdminTokenStore } from '../../../stores/admin/adminTokenStore';
import { DataTable, Column } from '../shared/DataTable';
import { Pagination } from '../shared/Pagination';
import { SearchBar } from '../shared/SearchBar';

export const TokenList: React.FC = () => {
  const {
    tokens,
    loading,
    error,
    hasMore,
    limit,
    filters,
    loadTokens,
    revokeToken,
    setFilters,
    setLimit,
  } = useAdminTokenStore();

  useEffect(() => {
    loadTokens(true);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadTokens(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (window.confirm('Are you sure you want to revoke this token?')) {
      try {
        await revokeToken(tokenId);
      } catch (error) {
        // Error handled by store
      }
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'token_masked',
      header: 'Token',
      render: (token) => (
        <div className="font-mono text-sm text-gray-900">{token.token_masked}</div>
      ),
    },
    {
      key: 'token_type',
      header: 'Type',
      render: (token) => (
        <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
          {token.token_type}
        </span>
      ),
    },
    {
      key: 'username',
      header: 'User',
      render: (token) => (
        <div className="text-sm text-gray-900">
          {token.username || token.user_id?.substring(0, 8)}
        </div>
      ),
    },
    {
      key: 'expires_at',
      header: 'Expires',
      render: (token) => (
        <div className="text-sm text-gray-500">
          {token.expires_at
            ? new Date(token.expires_at).toLocaleString()
            : 'N/A'}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (token) => (
        <div className="text-sm text-gray-500">
          {token.created_at
            ? new Date(token.created_at).toLocaleString()
            : 'N/A'}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (token) => (
        <button
          onClick={() => handleRevoke(token.token_masked)}
          className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
        >
          Revoke
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Token Management</h2>
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

      <div className="bg-white shadow rounded-lg">
        <div className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <SearchBar
                value={filters.user_id || ''}
                onChange={(value) => setFilters({ user_id: value || undefined })}
                placeholder="Search by user ID..."
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filters.token_type || ''}
                onChange={(e) => setFilters({ token_type: e.target.value || undefined })}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Types</option>
                <option value="refresh">Refresh</option>
                <option value="email_verification">Email Verification</option>
                <option value="password_reset">Password Reset</option>
              </select>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.active_only || false}
                  onChange={(e) => setFilters({ active_only: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Active Only</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <DataTable
            data={tokens}
            columns={columns}
            loading={loading}
            emptyMessage="No tokens found"
          />

          <Pagination
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
            limit={limit}
            totalShown={tokens.length}
          />
        </div>
      </div>
    </div>
  );
};
