import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminUserStore } from '../../../stores/admin/adminUserStore';
import { UserMetrics } from './UserMetrics';

export const UserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const {
    selectedUser,
    userMetrics,
    loading,
    error,
    privacyMode,
    loadUserDetails,
    loadUserMetrics,
    setPrivacyMode,
    updateUserRole,
    updateUserStatus,
    adjustCredits,
  } = useAdminUserStore();

  useEffect(() => {
    if (userId) {
      loadUserDetails(userId);
      loadUserMetrics(userId);
    }
  }, [userId]);

  const handleRoleChange = async (newRole: string) => {
    if (!userId || !selectedUser) return;
    try {
      await updateUserRole(userId, newRole);
    } catch (error) {
      // Error handled by store
    }
  };

  const handleStatusToggle = async () => {
    if (!userId || !selectedUser) return;
    try {
      await updateUserStatus(userId, !selectedUser.is_active);
    } catch (error) {
      // Error handled by store
    }
  };

  const handleCreditAdjustment = async (amount: number, description: string) => {
    if (!userId) return;
    try {
      await adjustCredits(userId, amount, description);
    } catch (error) {
      // Error handled by store
    }
  };

  if (loading && !selectedUser) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !selectedUser) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (!selectedUser) {
    return <div>User not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="text-indigo-600 hover:text-indigo-800"
          >
            ← Back to Users
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            User Details
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={privacyMode}
              onChange={(e) => setPrivacyMode(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Privacy Mode</span>
          </label>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <div className="mt-1 text-sm text-gray-900">{selectedUser.username}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="mt-1 text-sm text-gray-900">
              {selectedUser.email || 'N/A'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              value={selectedUser.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <div className="mt-1">
              <button
                onClick={handleStatusToggle}
                className={`px-3 py-1 rounded text-sm ${
                  selectedUser.is_active
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
              >
                {selectedUser.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Credits
            </label>
            <div className="mt-1 text-sm text-gray-900">
              {selectedUser.credits || 0}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Created At
            </label>
            <div className="mt-1 text-sm text-gray-500">
              {selectedUser.created_at
                ? new Date(selectedUser.created_at).toLocaleString()
                : 'N/A'}
            </div>
          </div>
          {selectedUser.last_login && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Last Login
              </label>
              <div className="mt-1 text-sm text-gray-500">
                {new Date(selectedUser.last_login).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {userMetrics && <UserMetrics metrics={userMetrics} />}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Credit Adjustment
        </h2>
        <CreditAdjustmentForm onAdjust={handleCreditAdjustment} />
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="flex space-x-4">
          <button
            onClick={() => navigate(`/admin/users/${userId}/chat`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            View Chat History
          </button>
          <button
            onClick={() => navigate(`/admin/users/${userId}/tokens`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            View Tokens
          </button>
        </div>
      </div>
    </div>
  );
};

const CreditAdjustmentForm: React.FC<{
  onAdjust: (amount: number, description: string) => void;
}> = ({ onAdjust }) => {
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount && description) {
      onAdjust(Number(amount), description);
      setAmount('');
      setDescription('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Amount
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
      >
        Adjust Credits
      </button>
    </form>
  );
};
