import React, { useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { UserManagement } from '../components/admin/UserManagement';
import { UserDetail } from '../components/admin/UserManagement/UserDetail';
import { ChatHistoryView } from '../components/admin/ChatHistory/ChatHistoryView';
import { TokenList } from '../components/admin/TokenManagement/TokenList';
import { AuditLogView } from '../components/admin/AuditLog/AuditLogView';
import { CreditManagement } from '../components/admin/CreditManagement';
import { ReportReview } from '../components/admin/ReportReview';
import { AdminStats } from '../components/admin/AdminStats';

export const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  
  // Determine active tab from route
  const getActiveTab = () => {
    if (location.pathname.includes('/users/') && userId) {
      return 'users';
    }
    if (location.pathname.includes('/chat')) {
      return 'chat';
    }
    if (location.pathname.includes('/tokens')) {
      return 'tokens';
    }
    if (location.pathname.includes('/audit')) {
      return 'audit';
    }
    if (location.pathname.includes('/users')) {
      return 'users';
    }
    return 'stats';
  };
  
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'credits' | 'reports' | 'chat' | 'tokens' | 'audit'>(getActiveTab());
  
  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <a
              href="/app"
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Back to App
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px overflow-x-auto">
              {[
                { id: 'stats', label: 'Statistics', path: '/admin' },
                { id: 'users', label: 'Users', path: '/admin/users' },
                { id: 'chat', label: 'Chat History', path: '/admin/chat' },
                { id: 'tokens', label: 'Tokens', path: '/admin/tokens' },
                { id: 'audit', label: 'Audit Log', path: '/admin/audit' },
                { id: 'credits', label: 'Credits', path: '/admin' },
                { id: 'reports', label: 'Reports', path: '/admin' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.path) {
                      navigate(tab.path);
                    }
                    setActiveTab(tab.id as any);
                  }}
                  className={`px-6 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {location.pathname === '/admin' && <AdminStats />}
            {location.pathname === '/admin/users' && <UserManagement />}
            {location.pathname.startsWith('/admin/users/') && userId && !location.pathname.includes('/chat') && !location.pathname.includes('/tokens') && <UserDetail />}
            {location.pathname.includes('/users/') && location.pathname.includes('/chat') && <div>User Chat History (Coming Soon)</div>}
            {location.pathname.includes('/users/') && location.pathname.includes('/tokens') && <div>User Tokens (Coming Soon)</div>}
            {location.pathname === '/admin/chat' && <ChatHistoryView />}
            {location.pathname === '/admin/tokens' && <TokenList />}
            {location.pathname === '/admin/audit' && <AuditLogView />}
            {/* Fallback for old tab-based navigation */}
            {!location.pathname.startsWith('/admin/users/') && !['/admin/chat', '/admin/tokens', '/admin/audit'].includes(location.pathname) && (
              <>
                {activeTab === 'stats' && <AdminStats />}
                {activeTab === 'users' && <UserManagement />}
                {activeTab === 'credits' && <CreditManagement />}
                {activeTab === 'reports' && <ReportReview />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

