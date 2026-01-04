import React, { useEffect } from 'react';
import { useAdminAuditStore } from '../../../stores/admin/adminAuditStore';
import { DataTable, Column } from '../shared/DataTable';
import { Pagination } from '../shared/Pagination';

export const AuditLogView: React.FC = () => {
  const {
    logs,
    loading,
    error,
    hasMore,
    limit,
    filters,
    loadLogs,
    setFilters,
    setLimit,
  } = useAdminAuditStore();

  useEffect(() => {
    loadLogs(true);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadLogs(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (log) => (
        <div className="text-sm text-gray-500">
          {new Date(log.created_at).toLocaleString()}
        </div>
      ),
    },
    {
      key: 'admin_username',
      header: 'Admin',
      render: (log) => (
        <div className="text-sm text-gray-900">
          {log.admin_username || log.admin_id?.substring(0, 8)}
        </div>
      ),
    },
    {
      key: 'action_type',
      header: 'Action',
      render: (log) => (
        <span className="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-800">
          {log.action_type}
        </span>
      ),
    },
    {
      key: 'target_type',
      header: 'Target',
      render: (log) => (
        <div className="text-sm text-gray-700">
          {log.target_type || 'N/A'}
        </div>
      ),
    },
    {
      key: 'target_id',
      header: 'Target ID',
      render: (log) => (
        <div className="text-xs text-gray-500 font-mono">
          {log.target_id?.substring(0, 8) || 'N/A'}
        </div>
      ),
    },
    {
      key: 'ip_address',
      header: 'IP Address',
      render: (log) => (
        <div className="text-xs text-gray-500">
          {log.ip_address || 'N/A'}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Audit Log</h2>
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
            <input
              type="text"
              value={filters.admin_id || ''}
              onChange={(e) => setFilters({ admin_id: e.target.value || undefined })}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Filter by admin ID..."
            />
            <select
              value={filters.action_type || ''}
              onChange={(e) => setFilters({ action_type: e.target.value || undefined })}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Actions</option>
              <option value="view_user">View User</option>
              <option value="update_user_role">Update Role</option>
              <option value="adjust_credits">Adjust Credits</option>
              <option value="revoke_token">Revoke Token</option>
              <option value="export_users">Export Users</option>
            </select>
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={(e) => setFilters({ date_from: e.target.value || undefined })}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="From"
            />
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={(e) => setFilters({ date_to: e.target.value || undefined })}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="To"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <DataTable
            data={logs}
            columns={columns}
            loading={loading}
            emptyMessage="No audit logs found"
          />

          <Pagination
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
            limit={limit}
            totalShown={logs.length}
          />
        </div>
      </div>
    </div>
  );
};
