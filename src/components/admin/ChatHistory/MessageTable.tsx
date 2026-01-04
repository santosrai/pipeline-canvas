import React from 'react';
import { DataTable, Column } from '../shared/DataTable';
import { ChatMessage } from '../../../stores/admin/adminChatStore';

interface MessageTableProps {
  messages: ChatMessage[];
  loading: boolean;
  privacyMode: boolean;
}

export const MessageTable: React.FC<MessageTableProps> = ({
  messages,
  loading,
  privacyMode,
}) => {
  const columns: Column<ChatMessage>[] = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (msg) => (
        <div className="text-sm text-gray-500">
          {new Date(msg.created_at).toLocaleString()}
        </div>
      ),
    },
    {
      key: 'sender_username',
      header: 'Sender',
      render: (msg) => (
        <div className="text-sm text-gray-900">
          {msg.sender_username || msg.message_type || 'Unknown'}
        </div>
      ),
    },
    {
      key: 'message_type',
      header: 'Type',
      render: (msg) => (
        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
          {msg.message_type}
        </span>
      ),
    },
    {
      key: 'content',
      header: 'Content',
      render: (msg) => (
        <div className="text-sm text-gray-700 max-w-md truncate">
          {privacyMode ? (
            <span className="italic text-gray-500">[Content hidden]</span>
          ) : (
            msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
          )}
        </div>
      ),
    },
    {
      key: 'session_id',
      header: 'Session',
      render: (msg) => (
        <div className="text-xs text-gray-500 font-mono">
          {msg.session_id?.substring(0, 8)}...
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={messages}
      columns={columns}
      loading={loading}
      emptyMessage="No messages found"
      highlightRow={(msg) => {
        // Highlight messages with job IDs or sensitive data
        if (privacyMode) return false;
        const metadata = msg.metadata;
        if (typeof metadata === 'string') {
          try {
            const parsed = JSON.parse(metadata);
            return !!(parsed?.jobId || parsed?.job_id);
          } catch {
            return false;
          }
        }
        return !!(metadata?.jobId || metadata?.job_id);
      }}
    />
  );
};
