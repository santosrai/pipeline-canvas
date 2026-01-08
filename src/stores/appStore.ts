import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

export interface SelectionContext {
  pdbId?: string;
  kind: 'residue';
  compId?: string; // residue name, e.g., GLU
  authSeqId?: number | string | null; // residue number; can include insertion code (e.g., 16B)
  insCode?: string | null; // insertion code
  // Chain and residue identifiers in both label and author namespaces
  labelAsymId?: string | null; // preferred chain id for display
  authAsymId?: string | null; // author chain id
  labelSeqId?: number | string | null; // preferred residue index for display
}

export interface StructureOrigin {
  type: 'pdb' | 'rfdiffusion' | 'alphafold' | 'upload';
  pdbId?: string;
  jobId?: string;
  parameters?: any;
  metadata?: any;
  filename?: string;
}

export interface FileMetadata {
  id: string;
  name: string;
  type: 'upload' | 'rfdiffusion' | 'alphafold';
  size: number;
  timestamp: Date;
  sessionId: string;
  jobId?: string;
  filePath: string;
  downloadUrl: string;
}

// Molstar visual selection state (for Chimera-style menus)
export interface MolstarSelectionState {
  count: number;
  lastAction?: {
    type: 'select' | 'color' | 'representation' | 'visibility' | 'label';
    target?: string;
    timestamp: number;
  };
}

interface AppState {
  activePane: 'viewer' | 'editor' | 'files' | 'pipeline';
  plugin: PluginUIContext | null;
  currentCode: string;
  isExecuting: boolean;
  lastLoadedPdb: string | null;
  pendingCodeToRun: string | null;
  selections: SelectionContext[];
  chatPanelWidth: number;
  isViewerVisible: boolean;
  currentStructureOrigin: StructureOrigin | null;
  selectedFile: { id: string; type: string; content: string; filename?: string } | null;
  // Molstar visual selection tracking
  molstarSelection: MolstarSelectionState;
  
  setActivePane: (pane: 'viewer' | 'editor' | 'files' | 'pipeline') => void;
  setPlugin: (plugin: PluginUIContext | null) => void;
  setCurrentCode: (code: string) => void;
  setIsExecuting: (executing: boolean) => void;
  setLastLoadedPdb: (pdb: string | null) => void;
  setPendingCodeToRun: (code: string | null) => void;
  addSelection: (selection: SelectionContext) => void;
  removeSelection: (index: number) => void;
  clearSelections: () => void;
  setSelections: (selections: SelectionContext[]) => void;
  setChatPanelWidth: (width: number) => void;
  setViewerVisible: (visible: boolean) => void;
  setCurrentStructureOrigin: (origin: StructureOrigin | null) => void;
  setSelectedFile: (file: { id: string; type: string; content: string; filename?: string } | null) => void;
  // Molstar selection methods
  setMolstarSelectionCount: (count: number) => void;
  recordMolstarAction: (action: MolstarSelectionState['lastAction']) => void;
  hasMolstarSelection: () => boolean;
  // Backward compatibility
  setSelection: (selection: SelectionContext | null) => void;
  selection: SelectionContext | null;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activePane: 'viewer',
      plugin: null,
      currentCode: '',
      isExecuting: false,
      lastLoadedPdb: null,
      pendingCodeToRun: null,
      selections: [],
      chatPanelWidth: 400, // Default chat panel width (~1/3 of typical screen)
      isViewerVisible: false, // Hidden by default for new chats
      currentStructureOrigin: null,
      selectedFile: null,
      molstarSelection: { count: 0 },
      
      setActivePane: (pane) => set({ activePane: pane }),
      setPlugin: (plugin) => set({ plugin }),
      setCurrentCode: (code) => set({ currentCode: code }),
      setIsExecuting: (executing) => set({ isExecuting: executing }),
      setLastLoadedPdb: (pdb) => set({ lastLoadedPdb: pdb }),
      setPendingCodeToRun: (code) => set({ pendingCodeToRun: code }),
      setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
      setViewerVisible: (visible) => set({ isViewerVisible: visible }),
      setCurrentStructureOrigin: (origin) => set({ currentStructureOrigin: origin }),
      setSelectedFile: (file) => set({ selectedFile: file }),
      
      // Molstar selection methods
      setMolstarSelectionCount: (count) => set((state) => ({
        molstarSelection: { ...state.molstarSelection, count }
      })),
      recordMolstarAction: (action) => set((state) => ({
        molstarSelection: { ...state.molstarSelection, lastAction: action }
      })),
      hasMolstarSelection: () => get().molstarSelection.count > 0,
      
      addSelection: (selection) => set((state) => {
        // Check for duplicates based on key identifying properties
        const isDuplicate = state.selections.some(existing => 
          existing.compId === selection.compId &&
          existing.labelSeqId === selection.labelSeqId &&
          existing.authSeqId === selection.authSeqId &&
          existing.labelAsymId === selection.labelAsymId &&
          existing.pdbId === selection.pdbId
        );
        
        if (!isDuplicate) {
          return { selections: [...state.selections, selection] };
        }
        return state;
      }),
      
      removeSelection: (index) => set((state) => ({
        selections: state.selections.filter((_, i) => i !== index)
      })),
      
      clearSelections: () => set({ selections: [] }),
      
      setSelections: (selections) => set({ selections }),
      
      // Backward compatibility - return first selection or null
      get selection() { return get().selections[0] || null; },
      setSelection: (selection) => {
        if (selection === null) {
          set({ selections: [] });
        } else {
          set({ selections: [selection] });
        }
      },
    }),
    {
      name: 'novoprotein-app-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activePane: state.activePane,
        currentCode: state.currentCode,
        lastLoadedPdb: state.lastLoadedPdb,
        chatPanelWidth: state.chatPanelWidth,
        // isViewerVisible is now per-session, stored in chatHistoryStore
        // selection is session state; do not persist to avoid stale highlights
        // Do not persist transient execution code
      }),
    }
  )
);