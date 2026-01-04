import React from 'react';
import { ChatMessage } from '../../../stores/admin/adminChatStore';

interface MessageThreadProps {
  messages: ChatMessage[];
  loading: boolean;
  privacyMode: boolean;
}

export const MessageThread: React.FC<MessageThreadProps> = ({
  messages,
  loading,
  privacyMode,
}) => {
  if (loading && messages.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">No messages found</div>
    );
  }

  // Group messages by session/conversation for thread view
  const groupedMessages = messages.reduce((acc, msg) => {
    const key = msg.session_id || msg.conversation_id || 'unknown';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(msg);
    return acc;
  }, {} as Record<string, ChatMessage[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedMessages).map(([sessionId, sessionMessages]) => (
        <div key={sessionId} className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-4">
            Session: {sessionId}
          </div>
          <div className="space-y-4">
            {sessionMessages
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((message) => (
                <div
                  key={message.id}
                  className={`p-3 rounded-lg ${
                    message.message_type === 'user' || message.role === 'user'
                      ? 'bg-blue-50 ml-8'
                      : 'bg-gray-50 mr-8'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium text-gray-900">
                      {message.sender_username || message.message_type || 'Unknown'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(message.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700">
                    {privacyMode ? (
                      <span className="italic text-gray-500">
                        [Content hidden - privacy mode]
                      </span>
                    ) : (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    )}
                  </div>
                  {message.metadata && !privacyMode && (
                    <div className="mt-2 text-xs text-gray-500">
                      {JSON.stringify(message.metadata, null, 2)}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};
