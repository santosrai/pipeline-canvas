import React, { useEffect, useRef } from 'react';
import { Edit2, Trash2, Settings, Copy, X } from 'lucide-react';

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  nodeLabel: string;
  onRename: () => void;
  onDelete: () => void;
  onConfigure: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  x,
  y,
  nodeId: _nodeId,
  nodeLabel,
  onRename,
  onDelete,
  onConfigure,
  onDuplicate,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Add listeners after a short delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Prevent context menu from appearing on right-click within the menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[#1e1e32] border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700/50 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300 truncate max-w-[140px]" title={nodeLabel}>
          {nodeLabel}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        <button
          onClick={() => handleAction(onRename)}
          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/50 flex items-center gap-2 transition-colors"
        >
          <Edit2 className="w-4 h-4" />
          <span>Rename</span>
        </button>

        <button
          onClick={() => handleAction(onConfigure)}
          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/50 flex items-center gap-2 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Configure</span>
        </button>

        <button
          onClick={() => handleAction(onDuplicate)}
          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/50 flex items-center gap-2 transition-colors"
        >
          <Copy className="w-4 h-4" />
          <span>Duplicate</span>
        </button>

        <div className="my-1 border-t border-gray-700/50" />

        <button
          onClick={() => handleAction(onDelete)}
          className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
};
