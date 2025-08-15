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

interface AppState {
  activePane: 'viewer' | 'editor';
  plugin: PluginUIContext | null;
  currentCode: string;
  isExecuting: boolean;
  lastLoadedPdb: string | null;
  pendingCodeToRun: string | null;
  selections: SelectionContext[];
  
  setActivePane: (pane: 'viewer' | 'editor') => void;
  setPlugin: (plugin: PluginUIContext | null) => void;
  setCurrentCode: (code: string) => void;
  setIsExecuting: (executing: boolean) => void;
  setLastLoadedPdb: (pdb: string | null) => void;
  setPendingCodeToRun: (code: string | null) => void;
  addSelection: (selection: SelectionContext) => void;
  removeSelection: (index: number) => void;
  clearSelections: () => void;
  setSelections: (selections: SelectionContext[]) => void;
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
      
      setActivePane: (pane) => set({ activePane: pane }),
      setPlugin: (plugin) => set({ plugin }),
      setCurrentCode: (code) => set({ currentCode: code }),
      setIsExecuting: (executing) => set({ isExecuting: executing }),
      setLastLoadedPdb: (pdb) => set({ lastLoadedPdb: pdb }),
      setPendingCodeToRun: (code) => set({ pendingCodeToRun: code }),
      
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
        // selection is session state; do not persist to avoid stale highlights
        // Do not persist transient execution code
      }),
    }
  )
);