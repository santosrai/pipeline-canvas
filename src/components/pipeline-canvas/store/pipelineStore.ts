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
  // HTTP request/response details (similar to n8n)
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    queryParams?: Record<string, any>;
    body?: any;
  };
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
  };
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
  
  // Auto-save state
  lastSavedAt: Date | null;
  isSaving: boolean;
  
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
  executeSingleNode: (nodeId: string) => void;
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

// Debounce timer for auto-save (shared across store instances)
let autoSaveTimer: NodeJS.Timeout | null = null;
const DRAFT_KEY = 'novoprotein-pipeline-draft';
const UNNAMED_PIPELINE_NAME = 'Unnamed Pipeline';

const debouncedAutoSave = (get: () => PipelineState, set: (partial: Partial<PipelineState>) => void) => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  autoSaveTimer = setTimeout(() => {
    const { currentPipeline } = get();
    if (!currentPipeline) return;
    
    set({ isSaving: true });
    
    try {
      // Save draft to localStorage (including unnamed pipelines)
      const draft = {
        ...currentPipeline,
        updatedAt: new Date(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      set({ 
        lastSavedAt: new Date(),
        isSaving: false 
      });
    } catch (error) {
      console.error('Auto-save failed:', error);
      set({ isSaving: false });
    }
  }, 1000); // 1 second debounce
};

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
      lastSavedAt: null,
      isSaving: false,
      
      setCurrentPipeline: (pipeline) => {
        if (pipeline) {
          const { savedPipelines } = get();
          // Update savedPipelines if this pipeline already exists in the list
          const existingIndex = savedPipelines.findIndex((p) => p.id === pipeline.id);
          if (existingIndex >= 0) {
            const updated = [...savedPipelines];
            updated[existingIndex] = pipeline;
            set({ currentPipeline: pipeline, savedPipelines: updated });
          } else {
            set({ currentPipeline: pipeline });
          }
          debouncedAutoSave(get, set);
        } else {
          set({ currentPipeline: null });
        }
      },
      
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
          name: UNNAMED_PIPELINE_NAME,
          nodes,
          edges: ghostBlueprint.edges,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'draft',
        };
        
        const { savedPipelines } = get();
        // Add to saved pipelines list (but won't be persisted)
        set({ 
          currentPipeline: pipeline,
          ghostBlueprint: null,
          savedPipelines: [...savedPipelines, pipeline],
        });
        debouncedAutoSave(get, set);
      },
      
      rejectBlueprint: () => set({ ghostBlueprint: null }),
      
      addNode: (node) => {
        const { currentPipeline } = get();
        if (!currentPipeline) {
          const newPipeline: Pipeline = {
            id: `pipeline_${Date.now()}`,
            name: UNNAMED_PIPELINE_NAME,
            nodes: [node],
            edges: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'draft',
          };
          const { savedPipelines } = get();
          // Add to saved pipelines list (but won't be persisted)
          set({ 
            currentPipeline: newPipeline,
            savedPipelines: [...savedPipelines, newPipeline],
          });
          debouncedAutoSave(get, set);
        } else {
          const updatedPipeline = {
            ...currentPipeline,
            nodes: [...currentPipeline.nodes, node],
            updatedAt: new Date(),
          };
          const { savedPipelines } = get();
          // Update savedPipelines if this pipeline exists in the list
          const existingIndex = savedPipelines.findIndex((p) => p.id === currentPipeline.id);
          if (existingIndex >= 0) {
            const updated = [...savedPipelines];
            updated[existingIndex] = updatedPipeline;
            set({ 
              currentPipeline: updatedPipeline,
              savedPipelines: updated,
            });
          } else {
            set({ currentPipeline: updatedPipeline });
          }
          debouncedAutoSave(get, set);
        }
      },
      
      updateNode: (nodeId, updates) => {
        const { currentPipeline, savedPipelines } = get();
        if (!currentPipeline) return;
        
        const updatedPipeline = {
          ...currentPipeline,
          nodes: currentPipeline.nodes.map((node) => {
            if (node.id === nodeId) {
              // Deep merge config if it exists in updates
              const mergedNode = { ...node, ...updates };
              if (updates.config && node.config) {
                mergedNode.config = { ...node.config, ...updates.config };
              }
              return mergedNode;
            }
            return node;
          }),
          updatedAt: new Date(),
        };
        
        // Update savedPipelines if this pipeline exists in the list
        const existingIndex = savedPipelines.findIndex((p) => p.id === currentPipeline.id);
        if (existingIndex >= 0) {
          const updated = [...savedPipelines];
          updated[existingIndex] = updatedPipeline;
          set({ 
            currentPipeline: updatedPipeline,
            savedPipelines: updated,
          });
        } else {
          set({ currentPipeline: updatedPipeline });
        }
        debouncedAutoSave(get, set);
      },
      
      deleteNode: (nodeId) => {
        const { currentPipeline, savedPipelines } = get();
        if (!currentPipeline) return;
        
        const updatedPipeline = {
          ...currentPipeline,
          nodes: currentPipeline.nodes.filter((node) => node.id !== nodeId),
          edges: currentPipeline.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
          updatedAt: new Date(),
        };
        
        // Update savedPipelines if this pipeline exists in the list
        const existingIndex = savedPipelines.findIndex((p) => p.id === currentPipeline.id);
        if (existingIndex >= 0) {
          const updated = [...savedPipelines];
          updated[existingIndex] = updatedPipeline;
          set({ 
            currentPipeline: updatedPipeline,
            savedPipelines: updated,
          });
        } else {
          set({ currentPipeline: updatedPipeline });
        }
        debouncedAutoSave(get, set);
      },
      
      addEdge: (source, target) => {
        const { currentPipeline, savedPipelines } = get();
        if (!currentPipeline) return;
        
        // Check if edge already exists
        const edgeExists = currentPipeline.edges.some(
          (edge) => edge.source === source && edge.target === target
        );
        
        if (edgeExists) return;
        
        const updatedPipeline = {
          ...currentPipeline,
          edges: [...currentPipeline.edges, { source, target }],
          updatedAt: new Date(),
        };
        
        // Update savedPipelines if this pipeline exists in the list
        const existingIndex = savedPipelines.findIndex((p) => p.id === currentPipeline.id);
        if (existingIndex >= 0) {
          const updated = [...savedPipelines];
          updated[existingIndex] = updatedPipeline;
          set({ 
            currentPipeline: updatedPipeline,
            savedPipelines: updated,
          });
        } else {
          set({ currentPipeline: updatedPipeline });
        }
        debouncedAutoSave(get, set);
      },
      
      deleteEdge: (source, target) => {
        const { currentPipeline, savedPipelines } = get();
        if (!currentPipeline) return;
        
        const updatedPipeline = {
          ...currentPipeline,
          edges: currentPipeline.edges.filter(
            (edge) => !(edge.source === source && edge.target === target)
          ),
          updatedAt: new Date(),
        };
        
        // Update savedPipelines if this pipeline exists in the list
        const existingIndex = savedPipelines.findIndex((p) => p.id === currentPipeline.id);
        if (existingIndex >= 0) {
          const updated = [...savedPipelines];
          updated[existingIndex] = updatedPipeline;
          set({ 
            currentPipeline: updatedPipeline,
            savedPipelines: updated,
          });
        } else {
          set({ currentPipeline: updatedPipeline });
        }
        debouncedAutoSave(get, set);
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
          set({ 
            savedPipelines: updated,
            lastSavedAt: new Date(),
          });
        } else {
          // Add new
          set({ 
            savedPipelines: [...savedPipelines, pipelineToSave],
            lastSavedAt: new Date(),
          });
        }
        
        // Also update draft
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(pipelineToSave));
        } catch (error) {
          console.error('Failed to save draft:', error);
        }
      },
      
      loadPipeline: (pipelineId) => {
        const { savedPipelines } = get();
        const pipeline = savedPipelines.find((p) => p.id === pipelineId);
        if (pipeline) {
          // Convert updatedAt to Date if it's a string (from localStorage)
          const updatedAt = pipeline.updatedAt instanceof Date 
            ? pipeline.updatedAt 
            : new Date(pipeline.updatedAt);
          
          set({ 
            currentPipeline: { ...pipeline },
            lastSavedAt: isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
          });
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
        
        // Validate input nodes have required configuration
        const inputNodes = currentPipeline.nodes.filter(n => n.type === 'input_node');
        for (const node of inputNodes) {
          if (!node.config?.filename) {
            // Update node status to show error
            const nodeId = node.id;
            set({
              currentPipeline: {
                ...currentPipeline,
                nodes: currentPipeline.nodes.map((n) =>
                  n.id === nodeId
                    ? { ...n, status: 'error' as NodeStatus, error: 'No filename specified for input node' }
                    : n
                ),
              },
            });
            // Don't start execution if validation fails
            return;
          }
        }
        
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
          // Don't auto-switch to executions view - stay in editor so users can see output
          // viewMode: 'executions', // Removed - keep current view mode
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
      
      executeSingleNode: (nodeId: string) => {
        const { currentPipeline, addExecutionLog } = get();
        if (!currentPipeline) return;
        
        const node = currentPipeline.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        
        // For input nodes, validate they have a filename
        if (node.type === 'input_node' && !node.config?.filename) {
          set({
            currentPipeline: {
              ...currentPipeline,
              nodes: currentPipeline.nodes.map((n) =>
                n.id === nodeId
                  ? { ...n, status: 'error' as NodeStatus, error: 'No filename specified for input node' }
                  : n
              ),
            },
          });
          return;
        }
        
        // Create execution order with just this node (and its dependencies if needed)
        // For input nodes, they have no dependencies, so just execute the node
        const executionOrder = [nodeId];
        
        // Create new execution session
        const newExecution: ExecutionSession = {
          id: `exec_${Date.now()}`,
          startedAt: new Date(),
          status: 'running',
          logs: [],
        };
        
        // Create log entry BEFORE execution starts so it shows up immediately
        addExecutionLog({
          nodeId,
          nodeLabel: node.label,
          nodeType: node.type,
          status: 'running',
        });
        
        set({
          isExecuting: true,
          executionOrder,
          currentExecution: newExecution,
          currentPipeline: {
            ...currentPipeline,
            status: 'running',
            nodes: currentPipeline.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, status: 'pending' }
                : n
            ),
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
            // Keep currentExecution so users can view results after execution completes
            // It will be cleared when a new execution starts
            currentExecution: {
              ...completedExecution,
              status: 'completed',
            },
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
        debouncedAutoSave(get, set);
      },
      
      clearPipeline: () => {
        set({
          currentPipeline: null,
          ghostBlueprint: null,
          isExecuting: false,
          executionOrder: [],
          currentExecution: null,
          lastSavedAt: null,
        });
        // Clear draft
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
          console.error('Failed to clear draft:', error);
        }
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
        // Persist all pipelines including unnamed ones
        savedPipelines: state.savedPipelines,
        // Don't persist currentPipeline or execution state - it's saved as draft separately
      }),
      // Load draft on initialization
      onRehydrateStorage: () => (state) => {
        if (state) {
          try {
            // Convert date strings to Date objects for all pipelines
            state.savedPipelines = state.savedPipelines.map((pipeline) => {
              if (pipeline.createdAt && typeof pipeline.createdAt === 'string') {
                pipeline.createdAt = new Date(pipeline.createdAt);
              }
              if (pipeline.updatedAt && typeof pipeline.updatedAt === 'string') {
                pipeline.updatedAt = new Date(pipeline.updatedAt);
              }
              return pipeline;
            });
            
            const draft = localStorage.getItem(DRAFT_KEY);
            if (draft) {
              const parsed = JSON.parse(draft);
              // Restore draft (including unnamed pipelines)
              state.setCurrentPipeline(parsed);
              // Convert updatedAt to Date if it's a string (from localStorage)
              if (parsed.updatedAt) {
                const updatedAt = parsed.updatedAt instanceof Date 
                  ? parsed.updatedAt 
                  : new Date(parsed.updatedAt);
                state.lastSavedAt = isNaN(updatedAt.getTime()) ? new Date() : updatedAt;
              } else {
                state.lastSavedAt = new Date();
              }
            }
          } catch (error) {
            console.error('Failed to load draft:', error);
          }
        }
      },
    }
  )
);

