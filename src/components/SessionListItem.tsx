import React, { useState } from 'react';
import { Star, Edit2, Trash2, Copy, MoreHorizontal, Check, X } from 'lucide-react';
import { ChatSession, useChatHistoryStore, useSessionManagement } from '../stores/chatHistoryStore';

interface SessionListItemProps {
  session: ChatSession;
  onSelect: () => void;
}

export const SessionListItem: React.FC<SessionListItemProps> = ({ session, onSelect }) => {
  const {
    activeSessionId,
    selectedSessionIds,
    toggleSessionSelection,
    switchToSession,
    deleteSession,
  } = useChatHistoryStore();
  
  const { updateSessionTitle, starSession, duplicateSession } = useSessionManagement();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [showActions, setShowActions] = useState(false);

  const isActive = activeSessionId === session.id;
  const isSelected = selectedSessionIds.includes(session.id);
  const isStarred = session.metadata.starred;

  // Format relative time
  const formatRelativeTime = (date: Date | string) => {
    const dateObj = new Date(date);
    const now = new Date();
    const diffInMs = now.getTime() - dateObj.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInHours / 24;

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return diffInMinutes < 1 ? 'Just now' : `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)}d ago`;
    } else {
      return dateObj.toLocaleDateString();
    }
  };

  // Get message preview (first user message or first AI message)
  const getMessagePreview = () => {
    const firstUserMessage = session.messages.find(m => m.type === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      return content.length > 60 ? content.substring(0, 60) + '...' : content;
    }
    
    const firstAiMessage = session.messages.find(m => m.type === 'ai');
    if (firstAiMessage) {
      const content = firstAiMessage.content.trim();
      return content.length > 60 ? content.substring(0, 60) + '...' : content;
    }
    
    return 'Empty conversation';
  };

  const handleSelect = () => {
    switchToSession(session.id);
    onSelect();
  };


  const handleEditStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditTitle(session.title);
    setShowActions(false);
  };

  const handleEditSave = () => {
    updateSessionTitle(session.id, editTitle.trim());
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    starSession(session.id, !isStarred);
    setShowActions(false);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateSession(session.id);
    setShowActions(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${session.title}"? This cannot be undone.`)) {
      deleteSession(session.id);
    }
    setShowActions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  return (
    <div
      className={`relative p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
        isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
      } ${isSelected ? 'bg-blue-25' : ''}`}
      onClick={handleSelect}
    >
      {/* Selection Checkbox */}
      <div className="absolute top-3 left-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSessionSelection(session.id)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="ml-8">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Title */}
            {isEditing ? (
              <div className="flex items-center space-x-2 mb-1">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditSave(); }}
                  className="p-1 text-green-600 hover:text-green-800"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditCancel(); }}
                  className="p-1 text-red-600 hover:text-red-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 mb-1">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {session.title}
                </h3>
                {isStarred && (
                  <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                )}
                {isActive && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Active
                  </span>
                )}
              </div>
            )}

            {/* Message Preview */}
            <p className="text-xs text-gray-500 mb-2 leading-relaxed">
              {getMessagePreview()}
            </p>

            {/* Metadata */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 text-xs text-gray-400">
                <span>{session.metadata.messageCount} messages</span>
                <span>•</span>
                <span>{formatRelativeTime(session.lastModified)}</span>
              </div>
            </div>
          </div>

          {/* Actions Menu */}
          <div className="relative flex-shrink-0 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showActions && (
              <div className="absolute right-0 top-6 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  <button
                    onClick={handleEditStart}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Rename</span>
                  </button>
                  
                  <button
                    onClick={handleToggleStar}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Star className={`w-4 h-4 ${isStarred ? 'text-yellow-500 fill-current' : ''}`} />
                    <span>{isStarred ? 'Unstar' : 'Star'}</span>
                  </button>
                  
                  <button
                    onClick={handleDuplicate}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicate</span>
                  </button>
                  
                  <div className="border-t border-gray-200 my-1"></div>
                  
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close actions menu */}
      {showActions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowActions(false)}
        />
      )}
    </div>
  );
};