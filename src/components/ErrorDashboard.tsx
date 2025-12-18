import React, { useState, useEffect } from 'react';
import { AlertTriangle, Activity, Users, Clock, Download, RefreshCw } from 'lucide-react';
import { getErrorDashboardData } from '../utils/errorLogger';

interface ErrorDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ErrorDashboard: React.FC<ErrorDashboardProps> = ({ isOpen, onClose }) => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  const refreshData = async () => {
    setRefreshing(true);
    try {
      const data = getErrorDashboardData();
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to load error dashboard data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const exportLogs = () => {
    // This would export logs in CSV format for analysis
    const csvData = dashboardData?.recentLogs?.map((log: any) => ({
      timestamp: log.timestamp,
      code: log.error.code,
      category: log.error.category,
      severity: log.error.severity,
      message: log.error.userMessage,
      url: log.url
    })) || [];

    const headers = ['timestamp', 'code', 'category', 'severity', 'message', 'url'];
    const csvContent = [
      headers.join(','),
      ...csvData.map((row: any) => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alphafold-errors-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <span>Error Dashboard</span>
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={exportLogs}
                className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {dashboardData && (
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
            {/* Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Total Errors</p>
                    <p className="text-2xl font-bold text-red-700">{dashboardData.metrics.totalErrors}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </div>

              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-600">Error Rate</p>
                    <p className="text-2xl font-bold text-orange-700">{dashboardData.metrics.errorRate}/min</p>
                  </div>
                  <Activity className="w-8 h-8 text-orange-500" />
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-600">Affected Users</p>
                    <p className="text-2xl font-bold text-yellow-700">{dashboardData.insights.userImpact.affectedUsers}</p>
                  </div>
                  <Users className="w-8 h-8 text-yellow-500" />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Recent Errors</p>
                    <p className="text-2xl font-bold text-blue-700">{dashboardData.metrics.recentErrors.length}</p>
                  </div>
                  <Clock className="w-8 h-8 text-blue-500" />
                </div>
              </div>
            </div>

            {/* Error Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* By Category */}
              <div className="bg-white border rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Errors by Category</h3>
                <div className="space-y-2">
                  {Object.entries(dashboardData.metrics.errorsByCategory).map(([category, count]) => (
                    <div key={category} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 capitalize">{category}</span>
                      <span className="text-sm font-medium text-gray-900">{count as React.ReactNode}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By Severity */}
              <div className="bg-white border rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Errors by Severity</h3>
                <div className="space-y-2">
                  {Object.entries(dashboardData.metrics.errorsBySeverity).map(([severity, count]) => (
                    <div key={severity} className="flex justify-between items-center">
                      <span className={`text-sm capitalize ${
                        severity === 'critical' ? 'text-red-600' :
                        severity === 'high' ? 'text-orange-600' :
                        severity === 'medium' ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {severity}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{count as React.ReactNode}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Most Common Errors */}
            <div className="bg-white border rounded-lg p-4 mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Most Common Errors</h3>
              <div className="space-y-2">
                {dashboardData.insights.mostCommonErrors.slice(0, 10).map((error: any) => (
                  <div key={error.code} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{error.code}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{error.count} occurrences</span>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-red-600 h-2 rounded-full"
                          style={{ 
                            width: `${Math.min(100, (error.count / dashboardData.insights.mostCommonErrors[0].count) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Error Log */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Errors (Last Hour)</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {dashboardData.recentLogs.slice(0, 20).map((log: any) => (
                  <div key={log.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.error.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          log.error.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                          log.error.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.error.severity}
                        </span>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{log.error.code}</span>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{log.error.userMessage}</p>
                    <p className="text-xs text-gray-500 truncate">{log.error.technicalMessage}</p>
                    {log.additionalContext && Object.keys(log.additionalContext).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-600 cursor-pointer">Show context</summary>
                        <pre className="text-xs text-gray-600 mt-1 p-2 bg-gray-50 rounded overflow-x-auto">
                          {JSON.stringify(log.additionalContext, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!dashboardData && (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading error dashboard...</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Hook to toggle error dashboard (for development)
export const useErrorDashboard = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+E to open error dashboard
      if (event.ctrlKey && event.shiftKey && event.key === 'E') {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    openDashboard: () => setIsOpen(true),
    closeDashboard: () => setIsOpen(false)
  };
};