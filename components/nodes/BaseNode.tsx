import React, { useState, useRef, useEffect } from 'react';
import { Position } from 'reactflow';
import { NodeStatus } from '../../types/index';
import { CustomHandle } from '../CustomHandle';
import { useNodeCompletionStatus, useStatusIcon } from '../../hooks';
import { getStatusClasses } from '../../utils/nodeUtils';
import { CheckCircle2 } from 'lucide-react';

// Editable label component for node labels
export const EditableLabel: React.FC<{
  label: string;
  nodeId: string;
  onUpdate: (nodeId: string, label: string) => void;
}> = ({ label, nodeId, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(label);
  }, [label]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (editValue.trim() !== label) {
      onUpdate(nodeId, editValue.trim() || label);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditValue(label);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full text-center text-xs font-medium bg-[hsl(var(--pc-muted))] text-[hsl(var(--pc-foreground))] border border-gray-200 rounded px-2 py-1 outline-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="text-center text-xs font-medium text-[hsl(var(--pc-text-secondary))] cursor-text hover:text-[hsl(var(--pc-text-primary))] transition-colors px-1 py-0.5 rounded hover:bg-[hsl(var(--pc-muted)/0.5)]"
      title="Double-click to edit"
    >
      {label || 'Unnamed'}
    </div>
  );
};

// Completion badge component
const CompletionBadge: React.FC = () => (
  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
    <CheckCircle2 className="w-3 h-3 text-white" />
  </div>
);

// Node icon badge component
const NodeIconBadge: React.FC<{
  status: NodeStatus;
  isCompleted: boolean;
  defaultBg: string;
  defaultColor: string;
  children: React.ReactNode;
}> = ({ status, isCompleted, defaultBg, defaultColor, children }) => {
  const bgClass =
    status === 'running'
      ? 'bg-blue-100'
      : isCompleted
        ? 'bg-green-100'
        : status === 'error'
          ? 'bg-red-100'
          : defaultBg;

  const colorClass =
    status === 'running'
      ? 'text-blue-600'
      : isCompleted
        ? 'text-green-600'
        : status === 'error'
          ? 'text-red-600'
          : defaultColor;

  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bgClass}`}>
      <div className={colorClass}>{children}</div>
    </div>
  );
};

// Base node component props
export interface BaseNodeProps {
  data: {
    id: string;
    status?: NodeStatus;
    isExecuting?: boolean;
    result_metadata?: Record<string, any>;
    label?: string;
    error?: string;
    config?: any;
    onUpdateLabel?: (nodeId: string, label: string) => void;
    [key: string]: any;
  };
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  defaultLabel: string;
  handles: Array<{ type: 'source' | 'target'; position: Position }>;
  content: React.ReactNode;
  defaultIconBg?: string;
  defaultIconColor?: string;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

/**
 * Base component for all pipeline nodes
 * Provides consistent structure, status handling, and styling
 */
export const BaseNode: React.FC<BaseNodeProps> = ({
  data,
  icon: Icon,
  label,
  defaultLabel,
  handles,
  content,
  defaultIconBg = 'bg-blue-100',
  defaultIconColor = 'text-blue-600',
  onClick,
  onDoubleClick,
}) => {
  const status = (data.status as NodeStatus) || 'idle';
  const isExecuting = data.isExecuting || false;
  const isCompleted = useNodeCompletionStatus(data);
  const statusIcon = useStatusIcon(status, isCompleted, data.result_metadata);
  const statusClasses = getStatusClasses(status, isExecuting, !!data.result_metadata);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
      // Don't stop propagation - let React Flow handle node selection
      // The custom handler can stop propagation if needed
    }
    // If no custom onClick, let the event propagate to React Flow's onNodeClick
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (onDoubleClick) {
      onDoubleClick(e);
      // Don't stop propagation - let React Flow handle node selection
      // The custom handler can stop propagation if needed
    }
    // If no custom onDoubleClick, let the event propagate to React Flow's onNodeDoubleClick
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          px-4 py-3 bg-[hsl(var(--pc-node-bg))] border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${statusClasses}
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {handles.map((handle, idx) => (
          <CustomHandle key={idx} type={handle.type} position={handle.position} />
        ))}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <NodeIconBadge
              status={status}
              isCompleted={isCompleted}
              defaultBg={defaultIconBg}
              defaultColor={defaultIconColor}
            >
              <Icon className="w-4 h-4" />
            </NodeIconBadge>
            <span className="font-semibold text-sm text-[hsl(var(--pc-text-primary))]">{label}</span>
          </div>
          {statusIcon}
        </div>
        {content}
        {isCompleted && <CompletionBadge />}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel
          label={data.label || defaultLabel}
          nodeId={data.id}
          onUpdate={data.onUpdateLabel || (() => {})}
        />
      </div>
    </div>
  );
};
