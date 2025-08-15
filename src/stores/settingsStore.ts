import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AppSettings {
  codeEditor: {
    enabled: boolean;           // Main toggle - default: false
    autoExecution: boolean;     // Auto-run generated code
    defaultCode: string;        // Startup code template
  };
  ui: {
    theme: 'light' | 'dark';    // Theme preference
    messageHistoryLimit: number; // Chat history limit
    showQuickPrompts: boolean;   // Show/hide quick start buttons
  };
  performance: {
    debugMode: boolean;         // Enhanced logging
    enableAnalytics: boolean;   // Usage tracking (for future use)
  };
}

interface SettingsState {
  settings: AppSettings;
  isSettingsDialogOpen: boolean;
  
  // Actions
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateCodeEditorSettings: (updates: Partial<AppSettings['codeEditor']>) => void;
  updateUISettings: (updates: Partial<AppSettings['ui']>) => void;
  updatePerformanceSettings: (updates: Partial<AppSettings['performance']>) => void;
  resetSettings: () => void;
  setSettingsDialogOpen: (open: boolean) => void;
}

// Default settings
const defaultSettings: AppSettings = {
  codeEditor: {
    enabled: false,           // Hide editor by default
    autoExecution: true,      // Auto-run generated code by default
    defaultCode: `// Welcome to NovoProtein AI Code Editor
// Your generated code will appear here
try {
  await builder.loadStructure('1HHO'); // Hemoglobin
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
} catch (e) { 
  console.error('Failed to load structure:', e); 
}`,
  },
  ui: {
    theme: 'light',           // Light theme by default
    messageHistoryLimit: 50,  // Keep last 50 messages
    showQuickPrompts: true,   // Show quick start buttons
  },
  performance: {
    debugMode: false,         // Disable debug logging by default
    enableAnalytics: false,   // Privacy-first approach
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      isSettingsDialogOpen: false,
      
      updateSettings: (updates) => set((state) => ({
        settings: {
          ...state.settings,
          ...updates,
          // Deep merge nested objects
          codeEditor: { ...state.settings.codeEditor, ...updates.codeEditor },
          ui: { ...state.settings.ui, ...updates.ui },
          performance: { ...state.settings.performance, ...updates.performance },
        }
      })),
      
      updateCodeEditorSettings: (updates) => set((state) => ({
        settings: {
          ...state.settings,
          codeEditor: { ...state.settings.codeEditor, ...updates }
        }
      })),
      
      updateUISettings: (updates) => set((state) => ({
        settings: {
          ...state.settings,
          ui: { ...state.settings.ui, ...updates }
        }
      })),
      
      updatePerformanceSettings: (updates) => set((state) => ({
        settings: {
          ...state.settings,
          performance: { ...state.settings.performance, ...updates }
        }
      })),
      
      resetSettings: () => set({
        settings: defaultSettings
      }),
      
      setSettingsDialogOpen: (open) => set({
        isSettingsDialogOpen: open
      }),
    }),
    {
      name: 'novoprotein-settings-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        // Don't persist dialog state - it should be closed on reload
      }),
    }
  )
);

// Convenience hooks for specific settings
export const useCodeEditorSettings = () => {
  const settings = useSettingsStore((state) => state.settings.codeEditor);
  const updateSettings = useSettingsStore((state) => state.updateCodeEditorSettings);
  return { settings, updateSettings };
};

export const useUISettings = () => {
  const settings = useSettingsStore((state) => state.settings.ui);
  const updateSettings = useSettingsStore((state) => state.updateUISettings);
  return { settings, updateSettings };
};

export const usePerformanceSettings = () => {
  const settings = useSettingsStore((state) => state.settings.performance);
  const updateSettings = useSettingsStore((state) => state.updatePerformanceSettings);
  return { settings, updateSettings };
};