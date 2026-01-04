import React from 'react';
import { UserMetrics as UserMetricsType } from '../../../stores/admin/adminUserStore';

interface UserMetricsProps {
  metrics: UserMetricsType;
}

export const UserMetrics: React.FC<UserMetricsProps> = ({ metrics }) => {
  const metricCards = [
    {
      label: 'Messages per Day',
      value: metrics.messages_per_day.toFixed(2),
      icon: '💬',
    },
    {
      label: 'Total Sessions',
      value: metrics.total_sessions.toString(),
      icon: '📊',
    },
    {
      label: 'Total Messages',
      value: metrics.total_messages.toString(),
      icon: '📝',
    },
    {
      label: 'Most Used Agent',
      value: metrics.most_used_agent || 'N/A',
      icon: '🤖',
    },
    {
      label: 'Account Age',
      value: `${metrics.account_age_days} days`,
      icon: '📅',
    },
    {
      label: 'Credit Usage Rate',
      value: `${metrics.credit_usage_rate.toFixed(2)}/day`,
      icon: '💰',
    },
  ];

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        User Activity Metrics
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((metric, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{metric.icon}</span>
              <div>
                <div className="text-sm text-gray-500">{metric.label}</div>
                <div className="text-lg font-semibold text-gray-900">
                  {metric.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
