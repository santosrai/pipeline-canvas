import React from 'react';
import { usePipelineStore, ExecutionLogEntry } from '../store/pipelineStore';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  ChevronDown,
  ExternalLink,
  FileInput,
  Sparkles,
  Dna,
  Atom
} from 'lucide-react';

// Get icon for node type
const getNodeIcon = (type: string) => {
  switch (type) {
    case 'input_node':
      return <FileInput className="w-4 h-4" />;
    case 'rfdiffusion_node':
      return <Sparkles className="w-4 h-4" />;
    case 'proteinmpnn_node':
      return <Dna className="w-4 h-4" />;
    case 'alphafold_node':
      return <Atom className="w-4 h-4" />;
    default:
      return <div className="w-4 h-4 rounded bg-gray-600" />;
  }
};

// Get color class for node type
const getNodeColor = (type: string) => {
  switch (type) {
    case 'input_node':
      return 'text-blue-400';
    case 'rfdiffusion_node':
      return 'text-purple-400';
    case 'proteinmpnn_node':
      return 'text-green-400';
    case 'alphafold_node':
      return 'text-orange-400';
    default:
      return 'text-gray-400';
  }
};

// Format duration
const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

// Format time
const formatTime = (date: Date) => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

interface LogNodeItemProps {
  log: ExecutionLogEntry;
  isSelected: boolean;
  onSelect: () => void;
}

const LogNodeItem: React.FC<LogNodeItemProps> = ({ log, isSelected, onSelect }) => {
  const getStatusIndicator = () => {
    switch (log.status) {
      case 'running':
        return (
          <div className="relative">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            </div>
            <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping" />
          </div>
        );
      case 'success':
        return (
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-3 h-3 text-green-400" />
          </div>
        );
      case 'error':
        return (
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
            <XCircle className="w-3 h-3 text-red-400" />
          </div>
        );
      case 'pending':
        return (
          <div className="w-5 h-5 rounded-full bg-gray-600/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-gray-600/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
          </div>
        );
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`
        group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all animate-slide-in
        ${isSelected 
          ? 'bg-blue-500/10 border-l-2 border-blue-400' 
          : 'hover:bg-gray-700/30 border-l-2 border-transparent'
        }
      `}
    >
      {/* Status indicator */}
      {getStatusIndicator()}
      
      {/* Node icon and label */}
      <div className={`${getNodeColor(log.nodeType)}`}>
        {getNodeIcon(log.nodeType)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${isSelected ? 'text-gray-100' : 'text-gray-300'}`}>
            {log.nodeLabel}
          </span>
        </div>
      </div>
      
      {/* Duration badge */}
      {log.duration !== undefined && (
        <span className="text-xs text-gray-500 font-mono">
          {formatDuration(log.duration)}
        </span>
      )}
      
      {/* Expand indicator */}
      <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
    </div>
  );
};

interface LogDetailsPanelProps {
  log: ExecutionLogEntry;
}

const LogDetailsPanel: React.FC<LogDetailsPanelProps> = ({ log }) => {
  return (
    <div className="border-l border-gray-200 pc-bg-canvas flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 pc-bg-panel">
        <div className="flex items-center gap-2">
          <div className={getNodeColor(log.nodeType)}>
            {getNodeIcon(log.nodeType)}
          </div>
          <h3 className="text-sm font-semibold text-[hsl(var(--pc-text-primary))]">{log.nodeLabel}</h3>
        </div>
        
        {/* Timing info */}
        <div className="flex items-center gap-4 mt-2 text-xs text-[hsl(var(--pc-text-muted))]">
          {log.duration !== undefined && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatDuration(log.duration)}</span>
            </div>
          )}
          {log.startedAt && (
            <span>Started at {formatTime(log.startedAt)}</span>
          )}
        </div>
        
        {/* View sub-execution link */}
        {(log.status === 'success' || log.status === 'completed') && (
          <button className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLink className="w-3 h-3" />
            View sub-execution
          </button>
        )}
      </div>
      
      {/* Input section */}
      <div className="px-4 py-3 border-b border-gray-200">
        <button className="flex items-center gap-2 w-full">
          <ChevronDown className="w-4 h-4 text-[hsl(var(--pc-text-muted))]" />
          <span className="text-sm font-medium text-[hsl(var(--pc-text-secondary))]">Input</span>
        </button>
        <div className="mt-3 bg-[hsl(var(--pc-muted)/0.3)] rounded-lg p-3 text-xs font-mono text-[hsl(var(--pc-text-secondary))] overflow-x-auto border border-gray-200">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(log.input || { query: { message: "..." } }, null, 2)}
          </pre>
        </div>
      </div>
      
      {/* Output section */}
      <div className="px-4 py-3 flex-1 overflow-y-auto">
        <button className="flex items-center gap-2 w-full">
          <ChevronDown className="w-4 h-4 text-[hsl(var(--pc-text-muted))]" />
          <span className="text-sm font-medium text-[hsl(var(--pc-text-secondary))]">Output</span>
        </button>
        <div className="mt-3 bg-[hsl(var(--pc-muted)/0.3)] rounded-lg p-3 text-xs font-mono text-[hsl(var(--pc-text-secondary))] overflow-x-auto border border-gray-200">
          <pre className="whitespace-pre-wrap">
            {log.error 
              ? <span className="text-red-400">{JSON.stringify({ error: log.error }, null, 2)}</span>
              : JSON.stringify(log.output || { message: "..." }, null, 2)
            }
          </pre>
        </div>
      </div>
    </div>
  );
};

export const ExecutionLogsPanel: React.FC = () => {
  const { 
    currentPipeline, 
    currentExecution, 
    selectedLogNodeId, 
    setSelectedLogNodeId,
    isExecuting 
  } = usePipelineStore();

  // Build execution tree from logs
  const executionLogs = currentExecution?.logs || [];
  
  // If not executing and no logs, show pending nodes
  const displayLogs: ExecutionLogEntry[] = executionLogs.length > 0 
    ? executionLogs 
    : (currentPipeline?.nodes.map(node => ({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: node.status,
      })) || []);

  const selectedLog = displayLogs.find(l => l.nodeId === selectedLogNodeId);

  // Calculate execution summary
  const completedCount = displayLogs.filter(l => l.status === 'success' || l.status === 'completed').length;
  const totalDuration = displayLogs.reduce((acc, l) => acc + (l.duration || 0), 0);

  return (
    <div className="h-full flex flex-col pc-bg-panel">
      {/* Header with execution summary */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-[hsl(var(--pc-canvas-bg))] to-[hsl(var(--pc-panel-bg))]">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-[hsl(var(--pc-text-primary))]">
              {isExecuting ? 'Running...' : currentExecution ? 'Execution Complete' : 'Logs from Pipeline'}
            </span>
            {totalDuration > 0 && (
              <span className="ml-2 text-xs text-[hsl(var(--pc-text-muted))]">
                | {formatDuration(totalDuration)}
              </span>
            )}
            {currentExecution?.startedAt && (
              <span className="ml-2 text-xs text-[hsl(var(--pc-text-muted))]">
                | Started at {formatTime(currentExecution.startedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[hsl(var(--pc-text-muted))]">
              {completedCount} / {displayLogs.length} nodes
            </span>
            {isExecuting && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            )}
          </div>
        </div>
        
        {/* Progress bar */}
        {displayLogs.length > 0 && (
          <div className="mt-3 w-full bg-[hsl(var(--pc-muted)/0.5)] rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full transition-all duration-500 ${
                isExecuting ? 'bg-blue-500 animate-shimmer' : 'bg-green-500'
              }`}
              style={{ width: `${(completedCount / displayLogs.length) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Execution tree */}
        <div className="w-64 border-r border-gray-200 flex flex-col bg-[hsl(var(--pc-canvas-bg)/0.5)]">
          <div className="px-3 py-2.5 bg-[hsl(var(--pc-muted)/0.3)] border-b border-gray-200">
            <span className="text-xs font-medium text-[hsl(var(--pc-text-muted))] uppercase tracking-wider">
              Latest Logs from {currentPipeline?.name || 'Pipeline'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Pipeline root */}
            <div className="px-3 py-2.5 flex items-center gap-2 bg-[hsl(var(--pc-muted)/0.2)] border-b border-gray-200">
              <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center">
                {isExecuting ? (
                  <Loader2 className="w-3 h-3 animate-spin text-green-400" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                )}
              </div>
              <span className="text-sm font-medium text-[hsl(var(--pc-text-secondary))]">
                {currentPipeline?.name || 'Pipeline'}
              </span>
            </div>
            
            {/* Node logs - indented like a tree */}
            <div className="pl-2">
              {displayLogs.map((log) => (
                <LogNodeItem
                  key={log.nodeId}
                  log={log}
                  isSelected={selectedLogNodeId === log.nodeId}
                  onSelect={() => setSelectedLogNodeId(
                    selectedLogNodeId === log.nodeId ? null : log.nodeId
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Log details */}
        <div className="flex-1 min-w-0">
          {selectedLog ? (
            <LogDetailsPanel log={selectedLog} />
          ) : (
            <div className="h-full flex items-center justify-center pc-bg-canvas">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[hsl(var(--pc-muted)/0.5)] flex items-center justify-center mx-auto mb-3">
                  <FileInput className="w-5 h-5 text-[hsl(var(--pc-text-muted))]" />
                </div>
                <p className="text-sm text-[hsl(var(--pc-text-muted))]">Select a node to view execution details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

