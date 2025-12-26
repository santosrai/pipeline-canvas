import React, { useCallback, useMemo } from 'react';
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
import { ExecutionLogsPanel } from './ExecutionLogsPanel';
import { CustomHandle } from './CustomHandle';
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
  Atom
} from 'lucide-react';

// Get status class for node border glow
const getStatusClasses = (status: NodeStatus, isExecuting: boolean) => {
  switch (status) {
    case 'running':
      return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse-glow';
    case 'success':
      return 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
    case 'error':
      return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
    case 'pending':
      return isExecuting ? 'border-gray-300 opacity-60' : 'border-gray-300';
    default:
      return 'border-gray-300';
  }
};

// Custom node components with enhanced animations
const InputNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className={`
      px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
      ${getStatusClasses(status, isExecuting)}
    `}>
      <CustomHandle type="source" position={Position.Right} />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            status === 'running' ? 'bg-blue-100' : 
            status === 'success' ? 'bg-green-100' : 
            status === 'error' ? 'bg-red-100' : 'bg-blue-100'
          }`}>
            <FileInput className={`w-4 h-4 ${
              status === 'running' ? 'text-blue-600' : 
              status === 'success' ? 'text-green-600' : 
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
      {status === 'success' && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
};

const RFdiffusionNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className={`
      px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
      ${getStatusClasses(status, isExecuting)}
    `}>
      <CustomHandle type="target" position={Position.Left} />
      <CustomHandle type="source" position={Position.Right} />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            status === 'running' ? 'bg-blue-100' : 
            status === 'success' ? 'bg-green-100' : 
            status === 'error' ? 'bg-red-100' : 'bg-purple-100'
          }`}>
            <Sparkles className={`w-4 h-4 ${
              status === 'running' ? 'text-blue-600' : 
              status === 'success' ? 'text-green-600' : 
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
      {status === 'success' && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
};

const ProteinMPNNNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className={`
      px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
      ${getStatusClasses(status, isExecuting)}
    `}>
      <CustomHandle type="target" position={Position.Left} />
      <CustomHandle type="source" position={Position.Right} />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            status === 'running' ? 'bg-blue-100' : 
            status === 'success' ? 'bg-green-100' : 
            status === 'error' ? 'bg-red-100' : 'bg-green-100'
          }`}>
            <Dna className={`w-4 h-4 ${
              status === 'running' ? 'text-blue-600' : 
              status === 'success' ? 'text-green-600' : 
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
      {status === 'success' && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
};

const AlphaFoldNode: React.FC<{ data: any }> = ({ data }) => {
  const status = data.status as NodeStatus;
  const isExecuting = data.isExecuting;
  
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className={`
      px-4 py-3 bg-white border-2 rounded-xl min-w-[220px] relative transition-all duration-300
      ${getStatusClasses(status, isExecuting)}
    `}>
      <CustomHandle type="target" position={Position.Left} />
      <CustomHandle type="source" position={Position.Right} />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            status === 'running' ? 'bg-blue-100' : 
            status === 'success' ? 'bg-green-100' : 
            status === 'error' ? 'bg-red-100' : 'bg-orange-100'
          }`}>
            <Atom className={`w-4 h-4 ${
              status === 'running' ? 'text-blue-600' : 
              status === 'success' ? 'text-green-600' : 
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
      {status === 'success' && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  input_node: InputNode,
  rfdiffusion_node: RFdiffusionNode,
  proteinmpnn_node: ProteinMPNNNode,
  alphafold_node: AlphaFoldNode,
};

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
    addEdge: addPipelineEdge,
    startExecution,
    stopExecution,
    clearPipeline,
  } = usePipelineStore();

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [showPalette, setShowPalette] = React.useState(false);

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
        isExecuting,
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
      const isSourceComplete = sourceNode?.status === 'success';
      
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

  // Update nodes/edges when pipeline changes
  React.useEffect(() => {
    setNodes(reactFlowNodes);
  }, [reactFlowNodes, setNodes]);

  React.useEffect(() => {
    setEdges(reactFlowEdges);
  }, [reactFlowEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        addPipelineEdge(params.source, params.target);
        setEdges((eds: Edge[]) => addEdge(params, eds));
      }
    },
    [addPipelineEdge, setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId);
      setSelectedNodeId(null);
    },
    [deleteNode]
  );

  const handleSavePipeline = () => {
    const name = prompt('Enter pipeline name:');
    if (name) {
      usePipelineStore.getState().savePipeline(name);
    }
  };

  const hasGhostNodes = !!ghostBlueprint && !currentPipeline;
  const hasNodes = (currentPipeline?.nodes.length || 0) > 0;

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e]">
      {/* Toolbar with Editor/Executions toggle */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-700/50 bg-[#1e1e32]">
        {/* Left side - View toggle */}
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-200">
            {currentPipeline?.name || 'Pipeline Canvas'}
          </h2>
          
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
          // Editor View - Canvas with optional palette
          <>
            {showPalette && !hasGhostNodes && (
              <PipelineNodePalette />
            )}
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
                  nodeTypes={nodeTypes}
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
                  nodeTypes={nodeTypes}
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

      {/* Node Configuration Panel (only in editor view) */}
      {selectedNodeId && viewMode === 'editor' && (
        <div className="absolute right-4 top-20 bottom-4 w-80 bg-[#1e1e32] border border-gray-700/50 rounded-xl shadow-2xl z-10 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between bg-gray-800/30">
            <h3 className="text-sm font-semibold text-gray-200">Node Configuration</h3>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <PipelineNodeConfig
              nodeId={selectedNodeId}
              onUpdate={(updates) => updateNode(selectedNodeId, updates)}
              onDelete={() => handleNodeDelete(selectedNodeId)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
