import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Pipeline, PipelineNode, PipelineBlueprint, NodeStatus } from '../types/index';
import { topologicalSort } from '../utils/topologicalSort';
import { ApiClient, AuthState } from '../types/dependencies';
import { PipelinePersistenceAdapter, NodeExecutionAdapter, NovoProteinAdapter } from '../types/adapters';
import { PipelineConfig } from '../types/config';

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
  
  // Sidebar state
  isPipelinesSidebarCollapsed: boolean;
  
  // Auto-save state
  lastSavedAt: Date | null;
  isSaving: boolean;
  
  // Actions
  setCurrentPipeline: (pipeline: Pipeline | null) => void;
  setGhostBlueprint: (blueprint: PipelineBlueprint | null) => void;
  approveBlueprint: () => void;
  approveBlueprintWithSelection: (selectedNodeIds: string[], nodeConfigs: Record<string, Record<string, any>>) => Pipeline | null;
  rejectBlueprint: () => void;
  addNode: (node: PipelineNode) => void;
  updateNode: (nodeId: string, updates: Partial<PipelineNode>) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (source: string, target: string) => void;
  deleteEdge: (source: string, target: string) => void;
  savePipeline: (name: string, messageId?: string, conversationId?: string, deps?: { apiClient?: ApiClient; authState?: AuthState; sessionId?: string }) => Promise<void>;
  loadPipeline: (pipelineId: string, deps?: { apiClient?: ApiClient; authState?: AuthState }) => Promise<void>;
  deletePipeline: (pipelineId: string, deps?: { apiClient?: ApiClient; authState?: AuthState }) => Promise<void>;
  syncPipelines: (deps?: { apiClient?: ApiClient; authState?: AuthState }) => Promise<void>;
  startExecution: () => void;
  executeSingleNode: (nodeId: string) => void;
  stopExecution: () => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus, error?: string) => void;
  clearPipeline: () => void;
  
  // View mode actions
  setViewMode: (mode: 'editor' | 'executions') => void;
  setSelectedLogNodeId: (nodeId: string | null) => void;
  
  // Sidebar actions
  setPipelinesSidebarCollapsed: (collapsed: boolean) => void;
  togglePipelinesSidebar: () => void;
  
  // Execution log actions
  addExecutionLog: (entry: Omit<ExecutionLogEntry, 'startedAt'>) => void;
  updateExecutionLog: (nodeId: string, updates: Partial<ExecutionLogEntry>) => void;
}

// Module-level dependency store (set by PipelineProvider)
let globalDependencies: {
  apiClient?: ApiClient;
  authState?: AuthState;
  sessionId?: string;
} = {};

// Module-level adapter store
let globalAdapters: {
  persistence?: PipelinePersistenceAdapter;
  execution?: NodeExecutionAdapter;
} = {};

// Module-level configuration store
// @ts-expect-error - globalConfig is set via setPipelineConfig and may be used in the future
let globalConfig: PipelineConfig | null = null;

/**
 * Set dependencies for the pipeline store
 * Called by PipelineProvider when context is available
 */
export const setPipelineDependencies = (deps: {
  apiClient?: ApiClient;
  authState?: AuthState;
  sessionId?: string;
}) => {
  globalDependencies = deps;
};

/**
 * Set adapters for the pipeline store
 * Called by PipelineProvider when adapters are provided
 */
export const setPipelineAdapters = (adapters: {
  persistence?: PipelinePersistenceAdapter;
  execution?: NodeExecutionAdapter;
}) => {
  globalAdapters = adapters;
};

/**
 * Set configuration for the pipeline store
 * Called by PipelineProvider when config is provided
 */
export const setPipelineConfig = (config: PipelineConfig) => {
  globalConfig = config;
  // Note: getConfig() is currently commented out but may be used in the future
};

/**
 * Get current dependencies
 */
const getDependencies = () => globalDependencies;

/**
 * Helper to get user ID from dependencies
 * Uses dependency injection set via setPipelineDependencies()
 * When used in parent app, authState should be provided via PipelineProvider
 */
const getUserId = (): string => {
  const deps = getDependencies();
  return deps.authState?.user?.id || 'anonymous';
};

/**
 * Get persistence adapter (with fallback to default)
 */
const getPersistenceAdapter = (): PipelinePersistenceAdapter | null => {
  if (globalAdapters.persistence) {
    return globalAdapters.persistence;
  }
  
  // Fallback: create default adapter if apiClient is available
  const deps = getDependencies();
  if (deps.apiClient) {
    return new NovoProteinAdapter(deps.apiClient);
  }
  
  return null;
};

/**
 * Get execution adapter
 */
// const getExecutionAdapter = (): NodeExecutionAdapter | null => {
//   return globalAdapters.execution || null;
// };

/**
 * Get merged configuration
 */
// const getConfig = (): Required<PipelineConfig> => {
//   return mergeConfig(globalConfig ?? undefined);
// };

// Debounce timer for auto-save (shared across store instances)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const getDraftKey = () => {
  const userId = getUserId();
  return `novoprotein-pipeline-draft-${userId}`;
};
const UNNAMED_PIPELINE_NAME = 'Unnamed Pipeline';

const debouncedAutoSave = (get: () => PipelineState, set: (partial: Partial<PipelineState>) => void) => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  autoSaveTimer = setTimeout(async () => {
    const { currentPipeline } = get();
    if (!currentPipeline) return;
    
    set({ isSaving: true });
    
    try {
      // Save draft to localStorage (including unnamed pipelines)
      const draft = {
        ...currentPipeline,
        updatedAt: new Date(),
      };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      
      // Also save draft to backend if dependencies are available
      const deps = getDependencies();
      const user = deps.authState?.user;
      const apiClient = deps.apiClient;
      
      if (user && apiClient) {
        try {
          // Save as draft pipeline (status='draft')
          await apiClient.post('/pipelines', {
            ...draft,
            status: 'draft',
          });
          console.log('[debouncedAutoSave] Draft pipeline saved to backend');
        } catch (error: any) {
          console.error('[debouncedAutoSave] Failed to save draft to backend:', error);
          // Don't throw - localStorage save succeeded
        }
      }
      
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
      isPipelinesSidebarCollapsed: false,
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
        if (!ghostBlueprint) {
          console.warn('[PipelineStore] approveBlueprint called but ghostBlueprint is null');
          return;
        }
        
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
        // Add to saved pipelines list (will be persisted via persist middleware)
        const updatedSavedPipelines = [...savedPipelines, pipeline];
        console.log('[PipelineStore] approveBlueprint: Adding pipeline to savedPipelines', {
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          nodeCount: pipeline.nodes.length,
          currentSavedCount: savedPipelines.length,
          newSavedCount: updatedSavedPipelines.length,
        });
        set({ 
          currentPipeline: pipeline,
          ghostBlueprint: null,
          savedPipelines: updatedSavedPipelines,
        });
        debouncedAutoSave(get, set);
      },
      
      approveBlueprintWithSelection: (selectedNodeIds: string[], nodeConfigs: Record<string, Record<string, any>>) => {
        const { ghostBlueprint } = get();
        if (!ghostBlueprint) {
          console.warn('[PipelineStore] approveBlueprintWithSelection called but ghostBlueprint is null');
          return null;
        }
        
        // Filter nodes to only selected ones
        const selectedNodes = ghostBlueprint.nodes.filter(node => selectedNodeIds.includes(node.id));
        
        // Create nodes with updated configs
        const nodes: PipelineNode[] = selectedNodes.map((node, index) => ({
          ...node,
          config: { ...node.config, ...(nodeConfigs[node.id] || {}) },
          status: 'idle' as NodeStatus,
          position: { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 200 },
        }));
        
        // Filter edges to only include edges between selected nodes
        const selectedNodeIdSet = new Set(selectedNodeIds);
        const edges = ghostBlueprint.edges.filter(
          edge => selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target)
        );
        
        const pipeline: Pipeline = {
          id: `pipeline_${Date.now()}`,
          name: UNNAMED_PIPELINE_NAME,
          nodes,
          edges,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'draft',
        };
        
        const { savedPipelines } = get();
        const updatedSavedPipelines = [...savedPipelines, pipeline];
        console.log('[PipelineStore] approveBlueprintWithSelection: Adding pipeline', {
          pipelineId: pipeline.id,
          selectedNodeCount: nodes.length,
          totalNodeCount: ghostBlueprint.nodes.length,
        });
        set({ 
          currentPipeline: pipeline,
          ghostBlueprint: null,
          savedPipelines: updatedSavedPipelines,
        });
        debouncedAutoSave(get, set);
        return pipeline;
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
      
      savePipeline: async (name, messageId?: string, conversationId?: string, deps?: { apiClient?: ApiClient; authState?: AuthState; sessionId?: string }) => {
        const { currentPipeline, savedPipelines } = get();
        if (!currentPipeline) return;
        
        const pipelineToSave: Pipeline = {
          ...currentPipeline,
          name,
          updatedAt: new Date(),
        };
        
        // Get dependencies from parameter or global store
        const effectiveDeps = deps || getDependencies();
        const user = effectiveDeps.authState?.user;
        const sessionId = effectiveDeps.sessionId;
        
        // Try to use adapter for backend save
        const adapter = getPersistenceAdapter();
        if (user && adapter) {
          try {
            await adapter.save(pipelineToSave, {
              messageId,
              conversationId,
              sessionId,
            });
            console.log('Pipeline saved to backend', messageId ? `(linked to message ${messageId})` : '');
          } catch (error: any) {
            console.error('Failed to save pipeline to backend:', error);
            // Continue with local save even if backend fails
          }
        }
        
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
          localStorage.setItem(getDraftKey(), JSON.stringify(pipelineToSave));
        } catch (error) {
          console.error('Failed to save draft:', error);
        }
      },
      
      loadPipeline: async (pipelineId, deps?: { apiClient?: ApiClient; authState?: AuthState }) => {
        const { savedPipelines } = get();
        
        // Get dependencies from parameter or global store
        const effectiveDeps = deps || getDependencies();
        const user = effectiveDeps.authState?.user;
        
        // Try to use adapter for backend load
        const adapter = getPersistenceAdapter();
        if (user && adapter) {
          try {
            const backendPipeline = await adapter.load(pipelineId);
            
            // Update local storage
            const existingIndex = savedPipelines.findIndex((p) => p.id === pipelineId);
            if (existingIndex >= 0) {
              const updated = [...savedPipelines];
              updated[existingIndex] = backendPipeline;
              set({ savedPipelines: updated });
            } else {
              set({ savedPipelines: [...savedPipelines, backendPipeline] });
            }
            
            set({ 
              currentPipeline: { ...backendPipeline },
              lastSavedAt: backendPipeline.updatedAt || new Date(),
            });
            return;
          } catch (error: any) {
            console.warn('Failed to load pipeline from backend, using local:', error);
            // Fall through to local load
          }
        }
        
        // Fallback to local storage
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
      
      deletePipeline: async (pipelineId, deps?: { apiClient?: ApiClient; authState?: AuthState }) => {
        // Get dependencies from parameter or global store
        const effectiveDeps = deps || getDependencies();
        const user = effectiveDeps.authState?.user;
        
        // Try to use adapter for backend delete
        const adapter = getPersistenceAdapter();
        if (user && adapter) {
          try {
            await adapter.delete(pipelineId);
            console.log('Pipeline deleted from backend');
          } catch (error: any) {
            console.warn('Failed to delete pipeline from backend:', error);
            // Continue with local delete even if backend fails
          }
        }
        
        const { savedPipelines, currentPipeline } = get();
        set({
          savedPipelines: savedPipelines.filter((p) => p.id !== pipelineId),
          currentPipeline: currentPipeline?.id === pipelineId ? null : currentPipeline,
        });
      },
      
      syncPipelines: async (deps?: { apiClient?: ApiClient; authState?: AuthState }) => {
        // Get dependencies from parameter or global store
        const effectiveDeps = deps || getDependencies();
        const user = effectiveDeps.authState?.user;
        
        if (!user) {
          console.log('[syncPipelines] User not authenticated, skipping pipeline sync');
          return;
        }
        
        // Try to use adapter for sync
        const adapter = getPersistenceAdapter();
        if (!adapter) {
          console.log('[syncPipelines] No persistence adapter available, skipping pipeline sync');
          return;
        }
        
        try {
          console.log('[syncPipelines] Syncing pipelines from backend for user:', user.id);
          
          // Use adapter's sync method if available, otherwise use list
          const validPipelines = adapter.sync 
            ? await adapter.sync()
            : await adapter.list();
          
          console.log(`[syncPipelines] Found ${validPipelines.length} pipelines in backend`);
          
          // REPLACE all pipelines (don't merge) - ensures user-specific data
          // If backend returns empty array, initialize with empty pipelines
          if (validPipelines.length === 0) {
            console.log('[syncPipelines] No pipelines in backend, initializing with empty array');
            set({ savedPipelines: [], currentPipeline: null });
            return;
          }
          
          set({ savedPipelines: validPipelines });
          console.log(`[syncPipelines] Synced ${validPipelines.length} pipelines from backend`);
          
          // Also try to load draft pipeline from backend
          // Look for a pipeline with status='draft' and most recent updated_at
          const draftPipelines = validPipelines.filter(p => p.status === 'draft');
          if (draftPipelines.length > 0) {
            // Get most recent draft
            const latestDraft = draftPipelines.reduce((latest, current) => {
              const latestTime = latest.updatedAt?.getTime() || 0;
              const currentTime = current.updatedAt?.getTime() || 0;
              return currentTime > latestTime ? current : latest;
            });
            
            // Only load if it's newer than localStorage draft
            try {
              const localDraft = localStorage.getItem(getDraftKey());
              if (localDraft) {
                const parsedLocal = JSON.parse(localDraft);
                const localTime = parsedLocal.updatedAt ? new Date(parsedLocal.updatedAt).getTime() : 0;
                const backendTime = latestDraft.updatedAt?.getTime() || 0;
                
                if (backendTime > localTime) {
                  console.log('[syncPipelines] Loading draft from backend (newer than local)');
                  set({ currentPipeline: latestDraft });
                }
              } else {
                // No local draft, load from backend
                console.log('[syncPipelines] Loading draft from backend (no local draft)');
                set({ currentPipeline: latestDraft });
              }
            } catch (error) {
              console.error('[syncPipelines] Failed to compare drafts:', error);
              // Fallback: load backend draft
              set({ currentPipeline: latestDraft });
            }
          }
        } catch (error: any) {
          console.error('[syncPipelines] Failed to sync pipelines from backend:', error);
          if (error.response) {
            console.error('[syncPipelines] Response status:', error.response.status);
            console.error('[syncPipelines] Response data:', error.response.data);
          }
        }
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
              status: (node.status === 'success' || node.status === 'completed') ? node.status : 'pending',
            })),
          },
        });
        
        // Emit pipeline started event so ChatPanel can create initial progress message
        window.dispatchEvent(new CustomEvent('pipeline-started', {
          detail: {
            pipelineId: currentPipeline.id,
            status: 'running',
            nodes: currentPipeline.nodes.map(node => ({
              id: node.id,
              label: node.label,
              status: (node.status === 'success' || node.status === 'completed') ? node.status : 'pending',
            })),
          }
        }));
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
        // Don't overwrite result_metadata if it already exists - it will be updated separately
        // Only initialize it if it doesn't exist and status is completed/success
        if ((status === 'success' || status === 'completed') && !node?.result_metadata) {
          updates.result_metadata = {}; // Will be populated by execution
        }
        
        // Always update execution logs to keep them in sync with node status
        // This ensures the execution panel reflects real-time node execution status
        if (currentExecution && node) {
          const existingLogIndex = currentExecution.logs.findIndex(l => l.nodeId === nodeId);
          const now = new Date();
          
          if (existingLogIndex >= 0) {
            // Update existing log - preserve all existing fields (request, response, input, output, etc.)
            // and only update status-related fields
            const existingLog = currentExecution.logs[existingLogIndex];
            const updatedLog: ExecutionLogEntry = {
              ...existingLog, // Preserve all existing fields (request, response, input, output, etc.)
              status,
              error: error || existingLog.error, // Update error if provided, otherwise keep existing
              completedAt: (status === 'success' || status === 'error') 
                ? (existingLog.completedAt || now) // Preserve existing completedAt if already set
                : undefined,
              duration: existingLog.startedAt && (status === 'success' || status === 'error')
                ? (existingLog.duration || now.getTime() - new Date(existingLog.startedAt).getTime())
                : existingLog.duration, // Preserve existing duration if not completed
            };
            const updatedLogs = [...currentExecution.logs];
            updatedLogs[existingLogIndex] = updatedLog;
            set({
              currentExecution: {
                ...currentExecution,
                logs: updatedLogs,
              },
            });
          } else if (status === 'running' || status === 'pending') {
            // Add new log if it doesn't exist and node is starting execution
            const newLog: ExecutionLogEntry = {
              nodeId,
              nodeLabel: node.label,
              nodeType: node.type,
              status,
              startedAt: now,
            };
            set({
              currentExecution: {
                ...currentExecution,
                logs: [...currentExecution.logs, newLog],
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
          localStorage.removeItem(getDraftKey());
        } catch (error) {
          console.error('Failed to clear draft:', error);
        }
      },
      
      setViewMode: (mode) => set({ viewMode: mode }),
      
      setSelectedLogNodeId: (nodeId) => set({ selectedLogNodeId: nodeId }),
      
      setPipelinesSidebarCollapsed: (collapsed) => set({ isPipelinesSidebarCollapsed: collapsed }),
      togglePipelinesSidebar: () => set((state) => ({ isPipelinesSidebarCollapsed: !state.isPipelinesSidebarCollapsed })),
      
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
      name: 'novoprotein-pipeline-storage', // Base name, will be user-scoped
      version: 1,
      storage: createJSONStorage(() => {
        // Create user-scoped storage adapter
        return {
          getItem: (_key: string) => {
            const userId = getUserId();
            const userKey = `novoprotein-pipeline-storage-${userId}`;
            return localStorage.getItem(userKey);
          },
          setItem: (_key: string, value: string) => {
            const userId = getUserId();
            const userKey = `novoprotein-pipeline-storage-${userId}`;
            localStorage.setItem(userKey, value);
          },
          removeItem: (_key: string) => {
            const userId = getUserId();
            const userKey = `novoprotein-pipeline-storage-${userId}`;
            localStorage.removeItem(userKey);
          },
        };
      }),
      partialize: (state) => ({
        // Persist all pipelines including unnamed ones
        savedPipelines: state.savedPipelines,
        // Don't persist currentPipeline or execution state - it's saved as draft separately
      }),
      // Load draft on initialization
      onRehydrateStorage: () => (state) => {
        if (state) {
          try {
            // Check if user is authenticated via dependency injection
            const deps = getDependencies();
            const user = deps.authState?.user;
            
            if (!user) {
              console.log('[PipelineStore] No user authenticated, clearing pipeline data');
              state.clearPipeline();
              // Use store's setState method
              usePipelineStore.setState({ savedPipelines: [] });
              return;
            }
            
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
            
            const draft = localStorage.getItem(getDraftKey());
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
          
          // Sync with backend after rehydration (if user is authenticated)
          setTimeout(() => {
            const deps = getDependencies();
            const user = deps.authState?.user;
            const apiClient = deps.apiClient;
            if (user && apiClient && state.syncPipelines) {
              // Clear local pipelines first, then sync from backend to ensure user-specific data
              console.log('[PipelineStore] Clearing pipelines and syncing from backend...');
              usePipelineStore.setState({ savedPipelines: [] });
              state.syncPipelines({ apiClient, authState: deps.authState }).catch(console.error);
            } else if (!user) {
              // If no user, clear all pipeline data
              state.clearPipeline();
              usePipelineStore.setState({ savedPipelines: [] });
            }
          }, 1000); // Delay to ensure auth is loaded
        }
      },
    }
  )
);

