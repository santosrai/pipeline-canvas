import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Pipeline, PipelineNode, PipelineBlueprint, NodeStatus } from '../types/index';
import { topologicalSort } from '../utils/topologicalSort';

// Execution log entry for tracking node execution history
export interface ExecutionLogEntry {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: NodeStatus;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number; // in ms
  error?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
}

// Execution session for tracking full pipeline runs
export interface ExecutionSession {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  logs: ExecutionLogEntry[];
}

interface PipelineState {
  // Current active pipeline
  currentPipeline: Pipeline | null;
  
  // Saved pipelines library
  savedPipelines: Pipeline[];
  
  // Ghost blueprint (from agent)
  ghostBlueprint: PipelineBlueprint | null;
  
  // Execution state
  isExecuting: boolean;
  executionOrder: string[]; // Topologically sorted node IDs
  
  // Execution logs and history
  currentExecution: ExecutionSession | null;
  executionHistory: ExecutionSession[];
  
  // View mode
  viewMode: 'editor' | 'executions';
  selectedLogNodeId: string | null;
  
  // Actions
  setCurrentPipeline: (pipeline: Pipeline | null) => void;
  setGhostBlueprint: (blueprint: PipelineBlueprint | null) => void;
  approveBlueprint: () => void;
  rejectBlueprint: () => void;
  addNode: (node: PipelineNode) => void;
  updateNode: (nodeId: string, updates: Partial<PipelineNode>) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (source: string, target: string) => void;
  deleteEdge: (source: string, target: string) => void;
  savePipeline: (name: string) => void;
  loadPipeline: (pipelineId: string) => void;
  deletePipeline: (pipelineId: string) => void;
  startExecution: () => void;
  stopExecution: () => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus, error?: string) => void;
  clearPipeline: () => void;
  
  // View mode actions
  setViewMode: (mode: 'editor' | 'executions') => void;
  setSelectedLogNodeId: (nodeId: string | null) => void;
  
  // Execution log actions
  addExecutionLog: (entry: Omit<ExecutionLogEntry, 'startedAt'>) => void;
  updateExecutionLog: (nodeId: string, updates: Partial<ExecutionLogEntry>) => void;
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set, get) => ({
      currentPipeline: null,
      savedPipelines: [],
      ghostBlueprint: null,
      isExecuting: false,
      executionOrder: [],
      currentExecution: null,
      executionHistory: [],
      viewMode: 'editor',
      selectedLogNodeId: null,
      
      setCurrentPipeline: (pipeline) => set({ currentPipeline: pipeline }),
      
      setGhostBlueprint: (blueprint) => set({ ghostBlueprint: blueprint }),
      
      approveBlueprint: () => {
        const { ghostBlueprint } = get();
        if (!ghostBlueprint) return;
        
        const nodes: PipelineNode[] = ghostBlueprint.nodes.map((node, index) => ({
          ...node,
          status: 'idle' as NodeStatus,
          position: { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 200 },
        }));
        
        const pipeline: Pipeline = {
          id: `pipeline_${Date.now()}`,
          name: 'New Pipeline',
          nodes,
          edges: ghostBlueprint.edges,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'draft',
        };
        
        set({ 
          currentPipeline: pipeline,
          ghostBlueprint: null,
        });
      },
      
      rejectBlueprint: () => set({ ghostBlueprint: null }),
      
      addNode: (node) => {
        const { currentPipeline } = get();
        if (!currentPipeline) {
          const newPipeline: Pipeline = {
            id: `pipeline_${Date.now()}`,
            name: 'New Pipeline',
            nodes: [node],
            edges: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'draft',
          };
          set({ currentPipeline: newPipeline });
        } else {
          set({
            currentPipeline: {
              ...currentPipeline,
              nodes: [...currentPipeline.nodes, node],
              updatedAt: new Date(),
            },
          });
        }
      },
      
      updateNode: (nodeId, updates) => {
        const { currentPipeline } = get();
        if (!currentPipeline) return;
        
        set({
          currentPipeline: {
            ...currentPipeline,
            nodes: currentPipeline.nodes.map((node) =>
              node.id === nodeId ? { ...node, ...updates } : node
            ),
            updatedAt: new Date(),
          },
        });
      },
      
      deleteNode: (nodeId) => {
        const { currentPipeline } = get();
        if (!currentPipeline) return;
        
        set({
          currentPipeline: {
            ...currentPipeline,
            nodes: currentPipeline.nodes.filter((node) => node.id !== nodeId),
            edges: currentPipeline.edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            updatedAt: new Date(),
          },
        });
      },
      
      addEdge: (source, target) => {
        const { currentPipeline } = get();
        if (!currentPipeline) return;
        
        // Check if edge already exists
        const edgeExists = currentPipeline.edges.some(
          (edge) => edge.source === source && edge.target === target
        );
        
        if (edgeExists) return;
        
        set({
          currentPipeline: {
            ...currentPipeline,
            edges: [...currentPipeline.edges, { source, target }],
            updatedAt: new Date(),
          },
        });
      },
      
      deleteEdge: (source, target) => {
        const { currentPipeline } = get();
        if (!currentPipeline) return;
        
        set({
          currentPipeline: {
            ...currentPipeline,
            edges: currentPipeline.edges.filter(
              (edge) => !(edge.source === source && edge.target === target)
            ),
            updatedAt: new Date(),
          },
        });
      },
      
      savePipeline: (name) => {
        const { currentPipeline, savedPipelines } = get();
        if (!currentPipeline) return;
        
        const pipelineToSave: Pipeline = {
          ...currentPipeline,
          name,
          updatedAt: new Date(),
        };
        
        const existingIndex = savedPipelines.findIndex((p) => p.id === pipelineToSave.id);
        
        if (existingIndex >= 0) {
          // Update existing
          const updated = [...savedPipelines];
          updated[existingIndex] = pipelineToSave;
          set({ savedPipelines: updated });
        } else {
          // Add new
          set({ savedPipelines: [...savedPipelines, pipelineToSave] });
        }
      },
      
      loadPipeline: (pipelineId) => {
        const { savedPipelines } = get();
        const pipeline = savedPipelines.find((p) => p.id === pipelineId);
        if (pipeline) {
          set({ currentPipeline: { ...pipeline } });
        }
      },
      
      deletePipeline: (pipelineId) => {
        const { savedPipelines, currentPipeline } = get();
        set({
          savedPipelines: savedPipelines.filter((p) => p.id !== pipelineId),
          currentPipeline: currentPipeline?.id === pipelineId ? null : currentPipeline,
        });
      },
      
      startExecution: () => {
        const { currentPipeline } = get();
        if (!currentPipeline) return;
        
        // Topological sort for execution order
        const executionOrder = topologicalSort(currentPipeline.nodes, currentPipeline.edges);
        
        // Create new execution session
        const newExecution: ExecutionSession = {
          id: `exec_${Date.now()}`,
          startedAt: new Date(),
          status: 'running',
          logs: [],
        };
        
        set({
          isExecuting: true,
          executionOrder,
          currentExecution: newExecution,
          viewMode: 'executions', // Auto-switch to executions view
          currentPipeline: {
            ...currentPipeline,
            status: 'running',
            nodes: currentPipeline.nodes.map((node) => ({
              ...node,
              status: node.status === 'success' ? 'success' : 'pending',
            })),
          },
        });
      },
      
      stopExecution: () => {
        const { currentPipeline, currentExecution, executionHistory } = get();
        
        // Complete the current execution session
        if (currentExecution) {
          const completedExecution: ExecutionSession = {
            ...currentExecution,
            completedAt: new Date(),
            status: 'stopped',
          };
          set({
            executionHistory: [completedExecution, ...executionHistory].slice(0, 50), // Keep last 50
            currentExecution: null,
          });
        }
        
        set({ isExecuting: false });
        if (currentPipeline) {
          set({
            currentPipeline: {
              ...currentPipeline,
              status: 'draft',
            },
          });
        }
      },
      
      updateNodeStatus: (nodeId, status, error) => {
        const { currentPipeline, currentExecution } = get();
        if (!currentPipeline) return;
        
        const node = currentPipeline.nodes.find(n => n.id === nodeId);
        const updates: Partial<PipelineNode> = { status };
        if (error) {
          updates.error = error;
        }
        if (status === 'success') {
          updates.result_metadata = {}; // Will be populated by execution
        }
        
        // Update execution logs
        if (currentExecution && node) {
          const existingLogIndex = currentExecution.logs.findIndex(l => l.nodeId === nodeId);
          const now = new Date();
          
          if (status === 'running' && existingLogIndex === -1) {
            // Add new running log
            const newLog: ExecutionLogEntry = {
              nodeId,
              nodeLabel: node.label,
              nodeType: node.type,
              status: 'running',
              startedAt: now,
            };
            set({
              currentExecution: {
                ...currentExecution,
                logs: [...currentExecution.logs, newLog],
              },
            });
          } else if (existingLogIndex >= 0) {
            // Update existing log
            const existingLog = currentExecution.logs[existingLogIndex];
            const updatedLog: ExecutionLogEntry = {
              ...existingLog,
              status,
              error,
              completedAt: (status === 'success' || status === 'error') ? now : undefined,
              duration: existingLog.startedAt && (status === 'success' || status === 'error')
                ? now.getTime() - new Date(existingLog.startedAt).getTime()
                : undefined,
            };
            const updatedLogs = [...currentExecution.logs];
            updatedLogs[existingLogIndex] = updatedLog;
            set({
              currentExecution: {
                ...currentExecution,
                logs: updatedLogs,
              },
            });
          }
        }
        
        set({
          currentPipeline: {
            ...currentPipeline,
            nodes: currentPipeline.nodes.map((n) =>
              n.id === nodeId ? { ...n, ...updates } : n
            ),
            updatedAt: new Date(),
          },
        });
      },
      
      clearPipeline: () => {
        set({
          currentPipeline: null,
          ghostBlueprint: null,
          isExecuting: false,
          executionOrder: [],
          currentExecution: null,
        });
      },
      
      setViewMode: (mode) => set({ viewMode: mode }),
      
      setSelectedLogNodeId: (nodeId) => set({ selectedLogNodeId: nodeId }),
      
      addExecutionLog: (entry) => {
        const { currentExecution } = get();
        if (!currentExecution) return;
        
        const newLog: ExecutionLogEntry = {
          ...entry,
          startedAt: new Date(),
        };
        
        set({
          currentExecution: {
            ...currentExecution,
            logs: [...currentExecution.logs, newLog],
          },
        });
      },
      
      updateExecutionLog: (nodeId, updates) => {
        const { currentExecution } = get();
        if (!currentExecution) return;
        
        const logIndex = currentExecution.logs.findIndex(l => l.nodeId === nodeId);
        if (logIndex === -1) return;
        
        const updatedLogs = [...currentExecution.logs];
        updatedLogs[logIndex] = { ...updatedLogs[logIndex], ...updates };
        
        set({
          currentExecution: {
            ...currentExecution,
            logs: updatedLogs,
          },
        });
      },
    }),
    {
      name: 'novoprotein-pipeline-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        savedPipelines: state.savedPipelines,
        // Don't persist currentPipeline or execution state
      }),
    }
  )
);

