import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { usePipelineStore } from '../store/pipelineStore';
import { PipelineNode, NodeStatus } from '../types/index';
import { PipelineNodeConfig } from './PipelineNodeConfig';
import { PipelineNodePalette } from './PipelineNodePalette';
import { SavedPipelinesList } from './SavedPipelinesList';
import { SavePipelineDialog } from './SavePipelineDialog';
import { ExecutionLogsPanel } from './ExecutionLogsPanel';
import { CustomHandle } from './CustomHandle';
import { NodeContextMenu } from './NodeContextMenu';
import { 
  Play, 
  Square, 
  Trash2, 
  Save, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Plus,
  FileInput,
  Sparkles,
  Dna,
  Atom,
  MessageSquare,
  Globe
} from 'lucide-react';

// Get status class for node border glow
const getStatusClasses = (status: NodeStatus, isExecuting: boolean, hasResultMetadata?: boolean) => {
  // If node has result_metadata, treat it as completed even if status is not explicitly set
  if (hasResultMetadata) {
    return 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
  }
  
  switch (status) {
    case 'running':
      return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse-glow';
    case 'success':
    case 'completed':
      return 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
    case 'error':
      return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
    case 'pending':
      return isExecuting ? 'border-gray-300 opacity-60' : 'border-gray-300';
    default:
      return 'border-gray-300';
  }
};

// Editable label component for node labels
const EditableLabel: React.FC<{ 
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
        className="w-full text-center text-xs font-medium text-white bg-gray-700/80 border border-gray-500 rounded px-2 py-1 outline-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="text-center text-xs font-medium text-gray-200 cursor-text hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-gray-800/50"
      title="Double-click to edit"
    >
      {label || 'Unnamed'}
    </div>
  );
};

// Custom node components with enhanced animations
const InputNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  const lastClickTimeRef = useRef<number>(0);
  
  // Determine if node is completed (either by status or by having result_metadata)
  const isCompleted = status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0);
  
  // Debug logging to help troubleshoot
  React.useEffect(() => {
    if (data.id && (status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0))) {
      console.log('[InputNode] Status check:', {
        nodeId: data.id,
        status,
        hasResultMetadata: !!(data.result_metadata && Object.keys(data.result_metadata).length > 0),
        isCompleted,
        resultMetadataKeys: data.result_metadata ? Object.keys(data.result_metadata) : []
      });
    }
  }, [data.id, status, data.result_metadata, isCompleted]);
  
  const getStatusIcon = () => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (data.result_metadata && Object.keys(data.result_metadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;
    
    // If this click is part of a double-click (within 300ms), don't stop propagation
    // This allows React Flow's onNodeDoubleClick to fire
    if (timeSinceLastClick > 300) {
      e.stopPropagation();
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`
          px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${getStatusClasses(status, isExecuting, !!(data.result_metadata && Object.keys(data.result_metadata).length > 0))}
        `}
        onClick={handleClick}
        onDoubleClick={() => {
          // Allow double-click to bubble up to React Flow's onNodeDoubleClick
          // Don't stop propagation so the panel opens
        }}
      >
        <CustomHandle type="source" position={Position.Right} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              status === 'running' ? 'bg-blue-100' : 
              isCompleted ? 'bg-green-100' : 
              status === 'error' ? 'bg-red-100' : 'bg-blue-100'
            }`}>
              <FileInput className={`w-4 h-4 ${
                status === 'running' ? 'text-blue-600' : 
                isCompleted ? 'text-green-600' : 
                status === 'error' ? 'text-red-600' : 'text-blue-600'
              }`} />
            </div>
            <span className="font-semibold text-sm text-gray-900">Input</span>
          </div>
          {getStatusIcon()}
        </div>
        <div className="text-xs text-gray-500 pl-10">
          {data.config?.filename || 'No file selected'}
        </div>
        {(status === 'success' || status === 'completed' || (data.result_metadata && Object.keys(data.result_metadata).length > 0)) && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel 
          label={data.label || 'Input'} 
          nodeId={data.id} 
          onUpdate={data.onUpdateLabel || (() => {})} 
        />
      </div>
    </div>
  );
};

const RFdiffusionNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  // Determine if node is completed (either by status or by having result_metadata)
  const isCompleted = status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0);
  
  const getStatusIcon = () => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (data.result_metadata && Object.keys(data.result_metadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`
          px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${getStatusClasses(status, isExecuting, !!(data.result_metadata && Object.keys(data.result_metadata).length > 0))}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <CustomHandle type="target" position={Position.Left} />
        <CustomHandle type="source" position={Position.Right} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              status === 'running' ? 'bg-blue-100' : 
              isCompleted ? 'bg-green-100' : 
              status === 'error' ? 'bg-red-100' : 'bg-purple-100'
            }`}>
              <Sparkles className={`w-4 h-4 ${
                status === 'running' ? 'text-blue-600' : 
                isCompleted ? 'text-green-600' : 
                status === 'error' ? 'text-red-600' : 'text-purple-600'
              }`} />
            </div>
            <span className="font-semibold text-sm text-gray-900">RFdiffusion</span>
          </div>
          {getStatusIcon()}
        </div>
        <div className="text-xs text-gray-500 space-y-1 pl-10">
          <div>Contigs: {data.config?.contigs || 'N/A'}</div>
          {data.error && (
            <div className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {data.error}
            </div>
          )}
        </div>
        {(status === 'success' || status === 'completed' || (data.result_metadata && Object.keys(data.result_metadata).length > 0)) && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel 
          label={data.label || 'RFdiffusion'} 
          nodeId={data.id} 
          onUpdate={data.onUpdateLabel || (() => {})} 
        />
      </div>
    </div>
  );
};

const ProteinMPNNNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  // Determine if node is completed (either by status or by having result_metadata)
  const isCompleted = status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0);
  
  const getStatusIcon = () => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (data.result_metadata && Object.keys(data.result_metadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`
          px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${getStatusClasses(status, isExecuting, !!(data.result_metadata && Object.keys(data.result_metadata).length > 0))}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <CustomHandle type="target" position={Position.Left} />
        <CustomHandle type="source" position={Position.Right} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              status === 'running' ? 'bg-blue-100' : 
              isCompleted ? 'bg-green-100' : 
              status === 'error' ? 'bg-red-100' : 'bg-green-100'
            }`}>
              <Dna className={`w-4 h-4 ${
                status === 'running' ? 'text-blue-600' : 
                isCompleted ? 'text-green-600' : 
                status === 'error' ? 'text-red-600' : 'text-green-600'
              }`} />
            </div>
            <span className="font-semibold text-sm text-gray-900">ProteinMPNN</span>
          </div>
          {getStatusIcon()}
        </div>
        <div className="text-xs text-gray-500 space-y-1 pl-10">
          <div>Sequences: {data.config?.num_sequences || 'N/A'}</div>
          {data.error && (
            <div className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {data.error}
            </div>
          )}
        </div>
        {(status === 'success' || status === 'completed' || (data.result_metadata && Object.keys(data.result_metadata).length > 0)) && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel 
          label={data.label || 'ProteinMPNN'} 
          nodeId={data.id} 
          onUpdate={data.onUpdateLabel || (() => {})} 
        />
      </div>
    </div>
  );
};

const AlphaFoldNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  // Determine if node is completed (either by status or by having result_metadata)
  const isCompleted = status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0);
  
  const getStatusIcon = () => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (data.result_metadata && Object.keys(data.result_metadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`
          px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${getStatusClasses(status, isExecuting, !!(data.result_metadata && Object.keys(data.result_metadata).length > 0))}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <CustomHandle type="target" position={Position.Left} />
        <CustomHandle type="source" position={Position.Right} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              status === 'running' ? 'bg-blue-100' : 
              isCompleted ? 'bg-green-100' : 
              status === 'error' ? 'bg-red-100' : 'bg-orange-100'
            }`}>
              <Atom className={`w-4 h-4 ${
                status === 'running' ? 'text-blue-600' : 
                isCompleted ? 'text-green-600' : 
                status === 'error' ? 'text-red-600' : 'text-orange-600'
              }`} />
            </div>
            <span className="font-semibold text-sm text-gray-900">AlphaFold</span>
          </div>
          {getStatusIcon()}
        </div>
        <div className="text-xs text-gray-500 space-y-1 pl-10">
          <div>Recycles: {data.config?.recycle_count || 'N/A'}</div>
          {data.error && (
            <div className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {data.error}
            </div>
          )}
        </div>
        {(status === 'success' || status === 'completed' || (data.result_metadata && Object.keys(data.result_metadata).length > 0)) && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel 
          label={data.label || 'AlphaFold'} 
          nodeId={data.id} 
          onUpdate={data.onUpdateLabel || (() => {})} 
        />
      </div>
    </div>
  );
};

const MessageInputNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  // Determine if node is completed (either by status or by having result_metadata)
  const isCompleted = status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0);
  
  const getStatusIcon = () => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (data.result_metadata && Object.keys(data.result_metadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  };

  const codePreview = data.config?.code 
    ? (data.config.code.length > 40 
        ? data.config.code.substring(0, 40).replace(/\n/g, ' ') + '...' 
        : data.config.code.replace(/\n/g, ' '))
    : 'No code';

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`
          px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${getStatusClasses(status, isExecuting, !!(data.result_metadata && Object.keys(data.result_metadata).length > 0))}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <CustomHandle type="source" position={Position.Right} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              status === 'running' ? 'bg-blue-100' : 
              isCompleted ? 'bg-green-100' : 
              status === 'error' ? 'bg-red-100' : 'bg-green-100'
            }`}>
              <MessageSquare className={`w-4 h-4 ${
                status === 'running' ? 'text-blue-600' : 
                isCompleted ? 'text-green-600' : 
                status === 'error' ? 'text-red-600' : 'text-green-600'
              }`} />
            </div>
            <span className="font-semibold text-sm text-gray-900">Code Execution</span>
          </div>
          {getStatusIcon()}
        </div>
        <div className="text-xs text-gray-500 pl-10 font-mono">
          {codePreview}
        </div>
        {(status === 'success' || status === 'completed' || (data.result_metadata && Object.keys(data.result_metadata).length > 0)) && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel 
          label={data.label || 'Code Execution'} 
          nodeId={data.id} 
          onUpdate={data.onUpdateLabel || (() => {})} 
        />
      </div>
    </div>
  );
};

const HttpRequestNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  // Determine if node is completed (either by status or by having result_metadata)
  const isCompleted = status === 'completed' || status === 'success' || (data.result_metadata && Object.keys(data.result_metadata).length > 0);
  
  const getStatusIcon = () => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (data.result_metadata && Object.keys(data.result_metadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  };

  const urlPreview = data.config?.url 
    ? (data.config.url.length > 30 
        ? data.config.url.substring(0, 30) + '...' 
        : data.config.url)
    : 'No URL';

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`
          px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
          ${getStatusClasses(status, isExecuting, !!(data.result_metadata && Object.keys(data.result_metadata).length > 0))}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <CustomHandle type="target" position={Position.Left} />
        <CustomHandle type="source" position={Position.Right} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              status === 'running' ? 'bg-blue-100' : 
              isCompleted ? 'bg-green-100' : 
              status === 'error' ? 'bg-red-100' : 'bg-blue-100'
            }`}>
              <Globe className={`w-4 h-4 ${
                status === 'running' ? 'text-blue-600' : 
                isCompleted ? 'text-green-600' : 
                status === 'error' ? 'text-red-600' : 'text-blue-600'
              }`} />
            </div>
            <span className="font-semibold text-sm text-gray-900">HTTP Request</span>
          </div>
          {getStatusIcon()}
        </div>
        <div className="text-xs text-gray-500 space-y-1 pl-10">
          <div className="flex items-center gap-2">
            <span className="font-medium">{data.config?.method || 'GET'}</span>
            <span className="text-gray-400">•</span>
            <span className="truncate">{urlPreview}</span>
          </div>
          {data.error && (
            <div className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {data.error}
            </div>
          )}
        </div>
        {(status === 'success' || status === 'completed' || (data.result_metadata && Object.keys(data.result_metadata).length > 0)) && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
        <EditableLabel 
          label={data.label || 'HTTP Request'} 
          nodeId={data.id} 
          onUpdate={data.onUpdateLabel || (() => {})} 
        />
      </div>
    </div>
  );
};

// Define nodeTypes outside component to ensure stable reference
// Using Object.freeze to prevent accidental mutations
const nodeTypes = Object.freeze({
  input_node: InputNode,
  rfdiffusion_node: RFdiffusionNode,
  proteinmpnn_node: ProteinMPNNNode,
  alphafold_node: AlphaFoldNode,
  message_input_node: MessageInputNode,
  http_request_node: HttpRequestNode,
});

export const PipelineCanvas: React.FC = () => {
  const {
    currentPipeline,
    ghostBlueprint,
    isExecuting,
    viewMode,
    setViewMode,
    approveBlueprint,
    rejectBlueprint,
    updateNode,
    deleteNode,
    addNode,
    addEdge: addPipelineEdge,
    startExecution,
    stopExecution,
    clearPipeline,
    lastSavedAt,
    isSaving,
    setCurrentPipeline,
  } = usePipelineStore();

  // Memoize nodeTypes to ensure stable reference for React Flow
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [showPalette, setShowPalette] = React.useState(false);
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  
  // Auto-select first node when a new pipeline is created from blueprint (for configuration)
  // This helps users immediately see the configuration panel after approving a blueprint
  // But NOT when loading an existing pipeline from the sidebar
  const previousPipelineIdRef = React.useRef<string | null>(null);
  const shouldAutoSelectRef = React.useRef<boolean>(false);
  
  React.useEffect(() => {
    const currentPipelineId = currentPipeline?.id || null;
    const pipelineChanged = currentPipelineId !== previousPipelineIdRef.current;
    
    // Only auto-select if:
    // 1. We have a pipeline with nodes
    // 2. The pipeline ID changed (new pipeline created)
    // 3. We should auto-select (set when blueprint is approved)
    // 4. No node is currently selected
    // 5. We're in editor mode
    if (
      currentPipeline && 
      currentPipeline.nodes.length > 0 && 
      pipelineChanged &&
      shouldAutoSelectRef.current &&
      !selectedNodeId && 
      viewMode === 'editor'
    ) {
      // Find the first input_node, or fall back to the first node
      const firstInputNode = currentPipeline.nodes.find(n => n.type === 'input_node');
      const nodeToSelect = firstInputNode || currentPipeline.nodes[0];
      if (nodeToSelect) {
        console.log('[PipelineCanvas] Auto-selecting first node for configuration:', nodeToSelect.id, nodeToSelect.type);
        // Small delay to ensure the canvas is rendered
        setTimeout(() => {
          setSelectedNodeId(nodeToSelect.id);
        }, 100);
      }
      // Reset the flag after auto-selecting
      shouldAutoSelectRef.current = false;
    } else if (pipelineChanged && !shouldAutoSelectRef.current) {
      // Pipeline changed but we shouldn't auto-select (e.g., loaded from sidebar)
      // Clear any selected node to ensure clean state
      if (selectedNodeId) {
        setSelectedNodeId(null);
      }
    }
    
    // Update the ref to track pipeline changes
    previousPipelineIdRef.current = currentPipelineId;
  }, [currentPipeline?.id, currentPipeline?.nodes.length, selectedNodeId, viewMode]);
  
  // Listen for blueprint approval events to enable auto-selection
  React.useEffect(() => {
    const handleBlueprintApproved = () => {
      console.log('[PipelineCanvas] Blueprint approved, will auto-select first node');
      shouldAutoSelectRef.current = true;
    };
    
    // Listen for custom event when blueprint is approved
    window.addEventListener('blueprint-approved', handleBlueprintApproved);
    
    return () => {
      window.removeEventListener('blueprint-approved', handleBlueprintApproved);
    };
  }, []);
  
  // Context menu state
  const [contextMenu, setContextMenu] = React.useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  
  // Draggable panel state
  const [panelPosition, setPanelPosition] = React.useState({ right: 16, top: 80 }); // Default: right-4 (16px), top-20 (80px)
  const [panelSize, setPanelSize] = React.useState({ width: 900, height: 600 }); // Default panel size
  const [isDragging, setIsDragging] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const [resizeType, setResizeType] = React.useState<'width-right' | 'width-left' | 'height-bottom' | 'height-top' | 'both-bottom-right' | 'both-bottom-left' | 'both-top-right' | 'both-top-left' | null>(null);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = React.useState({ x: 0, y: 0, width: 0, height: 0, right: 0, top: 0 });
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't start dragging if clicking on interactive elements or resize handles
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea') ||
      target.closest('[role="button"]') ||
      target.closest('[class*="cursor-col-resize"]') ||
      target.closest('[class*="cursor-row-resize"]') ||
      target.closest('[class*="cursor-nwse-resize"]') ||
      target.closest('[class*="cursor-nesw-resize"]')
    ) {
      return;
    }
    
    if (panelRef.current) {
      setIsDragging(true);
      const rect = panelRef.current.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      e.preventDefault(); // Prevent text selection
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing && panelRef.current) {
      const parentRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (parentRect) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newRight = resizeStart.right;
        let newTop = resizeStart.top;
        
        // Handle width resizing - natural behavior: fix the opposite edge
        if (resizeType?.includes('width-right') || resizeType?.includes('both-bottom-right') || resizeType?.includes('both-top-right')) {
          // Resizing from right edge - left edge stays fixed
          // deltaX: positive = dragging right (increases width), negative = dragging left (decreases width)
          newWidth = Math.max(400, Math.min(1200, resizeStart.width + deltaX));
        } else if (resizeType?.includes('width-left') || resizeType?.includes('both-bottom-left') || resizeType?.includes('both-top-left')) {
          // Resizing from left edge - right edge stays fixed
          // deltaX: positive = dragging right (should decrease width), negative = dragging left (should increase width)
          // So we invert: newWidth = oldWidth - deltaX
          // But if user says it's opposite, maybe the coordinate system is different
          // Let's try: dragging left edge left (negative deltaX) = increase width, dragging right (positive deltaX) = decrease width
          newWidth = Math.max(400, Math.min(1200, resizeStart.width - deltaX));
          // Adjust right position to keep right edge fixed
          // When width changes, right position must change by the same amount in opposite direction
          newRight = resizeStart.right + (resizeStart.width - newWidth);
          // Constrain to parent bounds
          newRight = Math.max(0, Math.min(parentRect.width - newWidth, newRight));
        }
        
        // Handle height resizing - natural behavior: fix the opposite edge
        if (resizeType?.includes('height-bottom') || resizeType?.includes('both-bottom-right') || resizeType?.includes('both-bottom-left')) {
          // Resizing from bottom edge - top edge stays fixed
          // deltaY: positive = dragging down (increases height), negative = dragging up (decreases height)
          newHeight = Math.max(300, Math.min(parentRect.height - resizeStart.top, resizeStart.height + deltaY));
        } else if (resizeType?.includes('height-top') || resizeType?.includes('both-top-right') || resizeType?.includes('both-top-left')) {
          // Resizing from top edge - bottom edge stays fixed
          // deltaY: positive = dragging down (decreases height), negative = dragging up (increases height)
          // The bottom edge position: top + height
          // To keep bottom fixed: newTop = oldTop + (oldHeight - newHeight)
          newHeight = Math.max(300, Math.min(parentRect.height - resizeStart.top, resizeStart.height - deltaY));
          // Adjust top to keep bottom edge fixed
          newTop = resizeStart.top + (resizeStart.height - newHeight);
          // Constrain to parent bounds
          newTop = Math.max(0, Math.min(parentRect.height - newHeight, newTop));
        }
        
        setPanelSize({ width: newWidth, height: newHeight });
        setPanelPosition({ right: newRight, top: newTop });
      }
    } else if (isDragging && panelRef.current) {
      const parentRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (parentRect) {
        // Calculate new position relative to parent
        const newLeft = e.clientX - parentRect.left - dragStart.x;
        const newTop = e.clientY - parentRect.top - dragStart.y;
        
        // Convert left to right (for absolute positioning with right property)
        const newRight = parentRect.width - newLeft - panelSize.width;
        
        // Constrain to parent bounds
        const minRight = 0;
        const maxRight = parentRect.width - panelSize.width;
        const minTop = 0;
        const maxTop = parentRect.height - 100; // minimum panel height
        
        setPanelPosition({
          right: Math.max(minRight, Math.min(newRight, maxRight)),
          top: Math.max(minTop, Math.min(newTop, maxTop)),
        });
      }
    }
  }, [isDragging, isResizing, dragStart, resizeStart, resizeType, panelSize.width]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeType(null);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent, type: 'width-right' | 'width-left' | 'height-bottom' | 'height-top' | 'both-bottom-right' | 'both-bottom-left' | 'both-top-right' | 'both-top-left') => {
    e.preventDefault();
    e.stopPropagation();
    if (panelRef.current) {
      setIsResizing(true);
      setResizeType(type);
      const rect = panelRef.current.getBoundingClientRect();
      const parentRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (parentRect) {
        // For left edge, capture the left edge position, not mouse position
        // For right edge, capture the right edge position
        let startX = e.clientX;
        if (type.includes('width-left') || type.includes('both-bottom-left') || type.includes('both-top-left')) {
          // Use the left edge of the panel as reference
          startX = rect.left;
        } else if (type.includes('width-right') || type.includes('both-bottom-right') || type.includes('both-top-right')) {
          // Use the right edge of the panel as reference
          startX = rect.right;
        }
        
        setResizeStart({
          x: startX,
          y: e.clientY,
          width: panelSize.width,
          height: panelSize.height,
          right: panelPosition.right,
          top: panelPosition.top,
        });
      }
    }
  }, [panelSize, panelPosition]);

  // Attach global mouse event listeners for dragging and resizing
  React.useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Convert pipeline nodes to React Flow nodes
  const reactFlowNodes = useMemo(() => {
    const nodes: PipelineNode[] = [];
    
    // Add ghost nodes if blueprint exists
    if (ghostBlueprint) {
      ghostBlueprint.nodes.forEach((node, index) => {
        nodes.push({
          ...node,
          status: 'idle',
          position: { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 200 },
        });
      });
    }
    
    // Add current pipeline nodes
    if (currentPipeline) {
      currentPipeline.nodes.forEach((node) => {
        nodes.push(node);
      });
    }
    
    return nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      position: node.position || { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 200 },
      data: {
        ...node,
        label: node.label,
        config: node.config,
        status: node.status,
        error: node.error,
        result_metadata: node.result_metadata,
        isExecuting,
        onUpdateLabel: (nodeId: string, newLabel: string) => {
          updateNode(nodeId, { label: newLabel });
        },
      },
      style: {
        opacity: ghostBlueprint && !currentPipeline ? 0.5 : 1,
        borderStyle: ghostBlueprint && !currentPipeline ? 'dashed' : 'solid',
      },
    })) as Node[];
  }, [currentPipeline, ghostBlueprint, isExecuting]);

  // Convert pipeline edges to React Flow edges with enhanced styling
  const reactFlowEdges = useMemo(() => {
    const edges: Array<{ source: string; target: string }> = [];
    
    if (ghostBlueprint) {
      edges.push(...ghostBlueprint.edges);
    }
    
    if (currentPipeline) {
      edges.push(...currentPipeline.edges);
    }
    
    return edges.map((edge) => {
      // Check if source node is running or complete
      const sourceNode = currentPipeline?.nodes.find(n => n.id === edge.source);
      const isSourceRunning = sourceNode?.status === 'running';
      const isSourceComplete = sourceNode?.status === 'success' || sourceNode?.status === 'completed';
      
      return {
        id: `e${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: isExecuting && (isSourceRunning || isSourceComplete),
        style: {
          stroke: isSourceComplete ? '#22c55e' : isSourceRunning ? '#3b82f6' : '#9ca3af',
          strokeWidth: isSourceRunning ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isSourceComplete ? '#22c55e' : isSourceRunning ? '#3b82f6' : '#9ca3af',
        },
      };
    }) as Edge[];
  }, [currentPipeline, ghostBlueprint, isExecuting]);

  const [nodes, setNodes, onNodesChange] = useNodesState(reactFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(reactFlowEdges);

  // Update nodes/edges when pipeline changes - use ref to prevent infinite loops
  const prevNodesRef = React.useRef<string>('');
  const prevEdgesRef = React.useRef<string>('');

  React.useEffect(() => {
    const nodesKey = JSON.stringify(reactFlowNodes.map(n => ({ id: n.id, data: n.data, position: n.position })));
    if (nodesKey !== prevNodesRef.current) {
      prevNodesRef.current = nodesKey;
      setNodes(reactFlowNodes);
    }
  }, [reactFlowNodes, setNodes]);

  React.useEffect(() => {
    const edgesKey = JSON.stringify(reactFlowEdges.map(e => ({ id: e.id, source: e.source, target: e.target })));
    if (edgesKey !== prevEdgesRef.current) {
      prevEdgesRef.current = edgesKey;
      setEdges(reactFlowEdges);
    }
  }, [reactFlowEdges, setEdges]);

  // Auto-save when node positions change (debounced to avoid excessive saves during dragging)
  const positionUpdateTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  React.useEffect(() => {
    if (nodes.length > 0 && currentPipeline) {
      // Clear previous timer
      if (positionUpdateTimerRef.current) {
        clearTimeout(positionUpdateTimerRef.current);
      }
      
      // Debounce position updates (only save after user stops dragging)
      positionUpdateTimerRef.current = setTimeout(() => {
        const updatedNodes = currentPipeline.nodes.map((pipelineNode) => {
          const reactFlowNode = nodes.find((n) => n.id === pipelineNode.id);
          if (reactFlowNode && reactFlowNode.position) {
            return {
              ...pipelineNode,
              position: reactFlowNode.position,
            };
          }
          return pipelineNode;
        });
        
        // Only update if positions actually changed
        const positionsChanged = updatedNodes.some((node) => {
          const original = currentPipeline.nodes.find(n => n.id === node.id);
          return original && (
            original.position?.x !== node.position?.x ||
            original.position?.y !== node.position?.y
          );
        });
        
        if (positionsChanged) {
          setCurrentPipeline({
            ...currentPipeline,
            nodes: updatedNodes,
            updatedAt: new Date(),
          });
        }
      }, 500); // Wait 500ms after last position change
    }
    
    return () => {
      if (positionUpdateTimerRef.current) {
        clearTimeout(positionUpdateTimerRef.current);
      }
    };
  }, [nodes, currentPipeline, setCurrentPipeline]);

  const onConnect = useCallback(
    (params: Connection | null) => {
      if (!params || !params.source || !params.target) {
        console.warn('[PipelineCanvas] Invalid connection params:', params);
        return;
      }
      try {
        addPipelineEdge(params.source, params.target);
        setEdges((eds: Edge[]) => addEdge(params, eds));
        setEdges((eds) => addEdge(params as Connection, eds));
      } catch (error) {
        console.error('[PipelineCanvas] Error adding edge:', error);
      }
    },
    [addPipelineEdge, setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Get mouse position relative to viewport
    setContextMenu({
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId);
      setSelectedNodeId(null);
    },
    [deleteNode]
  );

  // Context menu handlers
  const handleContextMenuRename = useCallback(() => {
    if (!contextMenu) return;
    const node = currentPipeline?.nodes.find(n => n.id === contextMenu.nodeId);
    if (node) {
      setSelectedNodeId(contextMenu.nodeId);
      // Trigger rename by focusing the EditableLabel (handled by the node component)
    }
  }, [contextMenu, currentPipeline]);

  const handleContextMenuDelete = useCallback(() => {
    if (!contextMenu) return;
    if (confirm('Are you sure you want to delete this node?')) {
      handleNodeDelete(contextMenu.nodeId);
    }
  }, [contextMenu, handleNodeDelete]);

  const handleContextMenuConfigure = useCallback(() => {
    if (!contextMenu) return;
    setSelectedNodeId(contextMenu.nodeId);
  }, [contextMenu]);

  const handleContextMenuDuplicate = useCallback(() => {
    if (!contextMenu || !currentPipeline) return;
    const node = currentPipeline.nodes.find(n => n.id === contextMenu.nodeId);
    if (!node) return;

    const newNode: PipelineNode = {
      ...node,
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: `${node.label} (Copy)`,
      position: {
        x: (node.position?.x || 0) + 50,
        y: (node.position?.y || 0) + 50,
      },
      status: 'idle',
      error: undefined,
      result_metadata: undefined,
    };

    addNode(newNode);
  }, [contextMenu, currentPipeline, addNode]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleSavePipeline = () => {
    setShowSaveDialog(true);
  };

  const hasGhostNodes = !!ghostBlueprint && !currentPipeline;
  const hasNodes = (currentPipeline?.nodes.length || 0) > 0;

  // Format last saved time
  const formatLastSaved = (date: Date | string | null) => {
    if (!date) return '';
    // Convert string to Date if needed (from localStorage)
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return '';
    
    const now = new Date();
    const diff = now.getTime() - dateObj.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e]">
      {/* Toolbar with Editor/Executions toggle */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-700/50 bg-[#1e1e32]">
        {/* Left side - View toggle */}
        <div className="flex items-center gap-4">
          {/* Auto-save indicator (like n8n) */}
          {currentPipeline && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : lastSavedAt ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="text-gray-300">Saved</span>
                  <span className="text-gray-500">•</span>
                  <span>{formatLastSaved(lastSavedAt)}</span>
                </>
              ) : null}
            </div>
          )}
          
          {/* n8n-style Editor/Executions toggle */}
          <div className="flex bg-gray-800/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('editor')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'editor'
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Editor
            </button>
            <button
              onClick={() => setViewMode('executions')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'executions'
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Executions
              {isExecuting && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </button>
          </div>
          
          {hasGhostNodes && (
            <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
              Review Blueprint
            </span>
          )}
        </div>
        
        {/* Right side - Action buttons */}
        <div className="flex items-center gap-2">
          {!hasGhostNodes && viewMode === 'editor' && (
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="px-3 py-1.5 text-xs bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 flex items-center gap-1.5 transition-colors"
              title="Toggle node palette"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Node
            </button>
          )}
          {hasGhostNodes ? (
            <>
              <button
                onClick={approveBlueprint}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-500 flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve
              </button>
              <button
                onClick={rejectBlueprint}
                className="px-3 py-1.5 text-xs bg-red-600/80 text-white rounded-lg hover:bg-red-500 flex items-center gap-1.5 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            </>
          ) : (
            <>
              {hasNodes && (
                <>
                  {isExecuting ? (
                    <button
                      onClick={stopExecution}
                      className="px-3 py-1.5 text-xs bg-red-600/80 text-white rounded-lg hover:bg-red-500 flex items-center gap-1.5 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={startExecution}
                      className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-500 flex items-center gap-1.5 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Run All
                    </button>
                  )}
                  <button
                    onClick={handleSavePipeline}
                    className="px-3 py-1.5 text-xs bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 flex items-center gap-1.5 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                </>
              )}
              {hasNodes && (
                <button
                  onClick={clearPipeline}
                  className="px-3 py-1.5 text-xs bg-gray-700 text-red-400 rounded-lg hover:bg-red-600/20 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main content area with Editor/Executions views */}
      <div className="flex-1 relative flex min-h-0">
        {viewMode === 'editor' ? (
          // Editor View - Canvas with saved pipelines on left and palette on right
          <>
            {/* Left side - Saved Pipelines List */}
            <SavedPipelinesList />
            
            {/* Center - Canvas */}
            <div className="flex-1 relative">
              {reactFlowNodes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center bg-[#1a1a2e]">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-gray-500" />
                    </div>
                    <p className="text-gray-400 mb-2">No pipeline nodes yet</p>
                    <p className="text-sm text-gray-500">
                      Ask the agent to create a pipeline, or click "Add Node" to build one manually
                    </p>
                  </div>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onNodeDoubleClick={onNodeDoubleClick}
                  onNodeContextMenu={onNodeContextMenu}
                  nodeTypes={memoizedNodeTypes}
                  fitView
                  className="bg-[#1a1a2e]"
                >
                  <Background 
                    variant={BackgroundVariant.Dots} 
                    gap={20} 
                    size={1} 
                    color="#374151"
                  />
                  <Controls className="bg-gray-800 border-gray-700 rounded-lg" />
                  <MiniMap 
                    className="bg-gray-800/50 rounded-lg"
                    nodeColor={(node: Node) => {
                      switch (node.data?.status) {
                        case 'running': return '#3b82f6';
                        case 'success': return '#22c55e';
                        case 'error': return '#ef4444';
                        default: return '#6b7280';
                      }
                    }}
                  />
                </ReactFlow>
              )}
            </div>
            
            {/* Right side - Node Palette */}
            {showPalette && !hasGhostNodes && (
              <PipelineNodePalette />
            )}
          </>
        ) : (
          // Executions View - Split canvas and logs
          <div className="flex-1 flex min-h-0">
            {/* Left: Mini canvas view */}
            <div className="w-1/2 border-r border-gray-700/50 relative">
              {reactFlowNodes.length === 0 ? (
                <div className="h-full flex items-center justify-center bg-[#1a1a2e]">
                  <p className="text-gray-500">No nodes to display</p>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onNodeDoubleClick={onNodeDoubleClick}
                  onNodeContextMenu={onNodeContextMenu}
                  nodeTypes={memoizedNodeTypes}
                  fitView
                  className="bg-[#1a1a2e]"
                  nodesDraggable={!isExecuting}
                  nodesConnectable={!isExecuting}
                  elementsSelectable={!isExecuting}
                >
                  <Background 
                    variant={BackgroundVariant.Dots} 
                    gap={20} 
                    size={1} 
                    color="#374151"
                  />
                  <Controls className="bg-gray-800 border-gray-700 rounded-lg" />
                </ReactFlow>
              )}
              
              {/* Canvas overlay controls */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <button className="p-2 bg-gray-800/80 rounded-lg text-gray-400 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
                <button className="p-2 bg-gray-800/80 rounded-lg text-gray-400 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </button>
                <button className="p-2 bg-gray-800/80 rounded-lg text-gray-400 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                  </svg>
                </button>
                <button className="p-2 bg-gray-800/80 rounded-lg text-gray-400 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              
           
            </div>
            
            {/* Right: Execution logs panel */}
            <div className="w-1/2 bg-[#1e1e32]">
              <ExecutionLogsPanel />
            </div>
          </div>
        )}
      </div>

      {/* Save Pipeline Dialog */}
      <SavePipelineDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
      />

      {/* Node Configuration Panel (only in editor view) */}
      {selectedNodeId && viewMode === 'editor' && (
        <div
          ref={panelRef}
          className="absolute bg-[#1e1e32] border border-gray-700/50 rounded-xl shadow-2xl z-10 flex flex-col"
          style={{
            right: `${panelPosition.right}px`,
            top: `${panelPosition.top}px`,
            width: `${panelSize.width}px`,
            height: `${panelSize.height}px`,
            maxHeight: 'calc(100vh - 100px)', // Constrain height
            cursor: isDragging 
              ? 'grabbing' 
              : isResizing 
                ? (resizeType?.includes('both-top-left') || resizeType?.includes('both-bottom-right') 
                    ? 'nwse-resize' 
                    : resizeType?.includes('both-top-right') || resizeType?.includes('both-bottom-left')
                      ? 'nesw-resize'
                      : resizeType?.includes('width')
                        ? 'col-resize'
                        : 'row-resize')
                : 'grab',
            userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto">
            <PipelineNodeConfig
              nodeId={selectedNodeId}
              onUpdate={(updates) => updateNode(selectedNodeId, updates)}
              onDelete={() => handleNodeDelete(selectedNodeId)}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
          
          {/* Resize Handles */}
          {/* Top edge resize handle */}
          <div
            className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors z-20"
            onMouseDown={(e) => handleResizeStart(e, 'height-top')}
            style={{ height: '4px' }}
          />
          
          {/* Right edge resize handle */}
          <div
            className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
            onMouseDown={(e) => handleResizeStart(e, 'width-right')}
            style={{ width: '4px' }}
          />
          
          {/* Bottom edge resize handle */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors z-20"
            onMouseDown={(e) => handleResizeStart(e, 'height-bottom')}
            style={{ height: '4px' }}
          />
          
          {/* Left edge resize handle */}
          <div
            className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-20"
            onMouseDown={(e) => handleResizeStart(e, 'width-left')}
            style={{ width: '4px' }}
          />
          
          {/* Top-left corner resize handle */}
          <div
            className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-30"
            onMouseDown={(e) => handleResizeStart(e, 'both-top-left')}
          />
          
          {/* Top-right corner resize handle */}
          <div
            className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize z-30"
            onMouseDown={(e) => handleResizeStart(e, 'both-top-right')}
          />
          
          {/* Bottom-right corner resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-30"
            onMouseDown={(e) => handleResizeStart(e, 'both-bottom-right')}
          />
          
          {/* Bottom-left corner resize handle */}
          <div
            className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-30"
            onMouseDown={(e) => handleResizeStart(e, 'both-bottom-left')}
          />
        </div>
      )}

      {/* Node Context Menu */}
      {contextMenu && (() => {
        const node = currentPipeline?.nodes.find(n => n.id === contextMenu.nodeId) || 
                     ghostBlueprint?.nodes.find(n => n.id === contextMenu.nodeId);
        if (!node) return null;
        
        return (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            nodeId={contextMenu.nodeId}
            nodeLabel={node.label || node.type}
            onRename={handleContextMenuRename}
            onDelete={handleContextMenuDelete}
            onConfigure={handleContextMenuConfigure}
            onDuplicate={handleContextMenuDuplicate}
            onClose={handleCloseContextMenu}
          />
        );
      })()}
    </div>
  );
};
