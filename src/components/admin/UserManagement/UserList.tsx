import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminUserStore } from '../../../stores/admin/adminUserStore';
import { DataTable, Column } from '../shared/DataTable';
import { Pagination } from '../shared/Pagination';
import { SearchBar } from '../shared/SearchBar';
import { PrivacyControls } from '../shared/PrivacyControls';
import { User } from '../../../stores/admin/adminUserStore';

export const UserList: React.FC = () => {
  const navigate = useNavigate();
  const {
    users,
    loading,
    error,
    hasMore,
    limit,
    filters,
    privacyMode,
    loadUsers,
    setFilters,
    setPrivacyMode,
    setLimit,
  } = useAdminUserStore();

  useEffect(() => {
    loadUsers(true);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadUsers(false);
    }
  };

  const handleRowClick = (user: User) => {
    navigate(`/admin/users/${user.id}`);
  };

  const columns: Column<User>[] = [
    {
      key: 'username',
      header: 'Username',
      render: (user) => (
        <div className="font-medium text-gray-900">{user.username}</div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (user) => (
        <div className="text-gray-500">{user.email || 'N/A'}</div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
          {user.role}
        </span>
      ),
    },
    {
      key: 'credits',
      header: 'Credits',
      render: (user) => (
        <div className="text-gray-900">{user.credits || 0}</div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (user) => (
        <span
          className={`px-2 py-1 text-xs rounded ${
            user.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (user) => (
        <div className="text-gray-500">
          {user.created_at
            ? new Date(user.created_at).toLocaleDateString()
            : 'N/A'}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Users</h2>
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

      <PrivacyControls
        enabled={privacyMode}
        onToggle={setPrivacyMode}
        maskedFields={['email', 'username']}
      />

      <div className="bg-white shadow rounded-lg">
        <div className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <SearchBar
                value={filters.search || ''}
                onChange={(value) => setFilters({ search: value || undefined })}
                placeholder="Search by email or username..."
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filters.role || ''}
                onChange={(e) =>
                  setFilters({ role: e.target.value || undefined })
                }
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
              </select>
              <select
                value={
                  filters.is_active === undefined
                    ? ''
                    : filters.is_active
                    ? 'active'
                    : 'inactive'
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setFilters({
                    is_active:
                      value === ''
                        ? undefined
                        : value === 'active'
                        ? true
                        : false,
                  });
                }}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <DataTable
            data={users}
            columns={columns}
            loading={loading}
            onRowClick={handleRowClick}
            emptyMessage="No users found"
          />

          <Pagination
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
            limit={limit}
            totalShown={users.length}
          />
        </div>
      </div>
    </div>
  );
};
