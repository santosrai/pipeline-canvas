import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../utils/api';
import { ErrorDetails } from '../utils/errorHandler';

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'processing' | 'completed';
  timestamp?: Date;
}

export interface ThinkingProcess {
  steps: ThinkingStep[];
  isComplete: boolean;
  totalSteps: number;
}

export interface Message {
  id: string;
  content: string;
  type: 'user' | 'ai';
  timestamp: Date;
  // Job tracking for async operations
  jobId?: string;
  jobType?: 'rfdiffusion' | 'alphafold' | 'proteinmpnn';
  // Extended fields for AI messages
  thinkingProcess?: ThinkingProcess;
  alphafoldResult?: {
    pdbContent?: string;
    filename?: string;
    sequence?: string;
    parameters?: any;
    metadata?: any;
  };
  proteinmpnnResult?: {
    jobId: string;
    sequences: Array<{
      id: string;
      sequence: string;
      length: number;
      metadata?: Record<string, any>;
    }>;
    downloads: {
      json: string;
      fasta: string;
      raw?: string;
    };
    metadata?: Record<string, any>;
  };
  // File attachment for user messages
  uploadedFile?: {
    file_id: string;
    filename: string;
    file_url: string;
    atoms: number;
    chains: string[];
  };
  error?: ErrorDetails;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  lastModified: Date;
  messages: Message[];
  visualizationCode?: string; // Code for this session's 3D visualization
  isViewerVisible?: boolean; // Whether 3D viewer is visible for this session
  metadata: {
    messageCount: number;
    lastActivity: Date;
    starred?: boolean;
    agentContext?: string; // Last agent used, PDB context, etc.
    tags?: string[];
    // Model settings per session
    selectedAgentId?: string | null; // null = auto-route
    selectedModel?: string | null; // null = use agent default
  };
}

interface ChatHistoryState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  recentSessionIds: string[]; // Quick access to recent sessions (max 5)
  isHistoryPanelOpen: boolean;
  isSidebarCollapsed: boolean; // New sidebar state
  searchQuery: string;
  selectedSessionIds: string[]; // For bulk operations
  
  // Core Session Actions
  createSession: (title?: string, messages?: Message[]) => string;
  switchToSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  deleteSessions: (sessionIds: string[]) => void;
  addMessageToSession: (sessionId: string, message: Message) => void;
  updateSessionMessages: (sessionId: string, messages: Message[]) => void;
  
  // Session Management
  updateSessionTitle: (sessionId: string, title: string) => void;
  starSession: (sessionId: string, starred: boolean) => void;
  duplicateSession: (sessionId: string) => string;
  
  // UI State Management
  setHistoryPanelOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSearchQuery: (query: string) => void;
  toggleSessionSelection: (sessionId: string) => void;
  selectAllSessions: () => void;
  clearSelection: () => void;
  
  // Visualization Code Management
  saveVisualizationCode: (sessionId: string, code: string) => void;
  getVisualizationCode: (sessionId: string) => string | undefined;
  
  // Viewer Visibility Management
  saveViewerVisibility: (sessionId: string, visible: boolean) => void;
  getViewerVisibility: (sessionId: string) => boolean | undefined;
  
  // Model Settings Management (per session)
  saveModelSettings: (sessionId: string, selectedAgentId: string | null, selectedModel: string | null) => void;
  getModelSettings: (sessionId: string) => { selectedAgentId: string | null; selectedModel: string | null } | undefined;
  
  // Utility Actions
  getActiveSession: () => ChatSession | null;
  getFilteredSessions: () => ChatSession[];
  searchSessions: (query: string) => ChatSession[];
  exportSessions: (sessionIds?: string[]) => string;
  importSessions: (jsonData: string) => boolean;
  clearAllSessions: () => void;
  cleanupOldSessions: (retentionDays: number) => number;
  getStorageStats: () => { totalSessions: number; totalMessages: number; estimatedSize: string };
}

// Generate smart title from first user message
const generateSessionTitle = (messages: Message[]): string => {
  const firstUserMessage = messages.find(m => m.type === 'user');
  if (!firstUserMessage) return 'New Chat';
  
  const content = firstUserMessage.content.trim();
  if (content.length <= 50) return content;
  
  // Extract meaningful keywords for title
  const words = content.split(' ').slice(0, 8);
  return words.join(' ') + (content.length > words.join(' ').length ? '...' : '');
};

// Generate AI-powered title from messages
const generateAITitle = async (messages: Message[]): Promise<string> => {
  try {
    console.log('[Title Generation] Calling API with messages:', messages.length);
    const response = await api.post('/chat/generate-title', {
      messages: messages.map(m => ({
        type: m.type,
        content: m.content,
      })),
    });
    console.log('[Title Generation] API response:', response.data);
    return response.data.title || 'New Chat';
  } catch (error: any) {
    console.error('[Title Generation] Failed to generate AI title:', error);
    if (error.response) {
      console.error('[Title Generation] API error response:', error.response.data);
    }
    return 'New Chat';
  }
};

// Calculate estimated storage size
const calculateStorageSize = (sessions: ChatSession[]): string => {
  const jsonString = JSON.stringify(sessions);
  const sizeInBytes = new Blob([jsonString]).size;
  const sizeInKB = sizeInBytes / 1024;
  const sizeInMB = sizeInKB / 1024;
  
  if (sizeInMB >= 1) {
    return `${sizeInMB.toFixed(2)} MB`;
  }
  return `${sizeInKB.toFixed(1)} KB`;
};

// Ensure date objects are properly converted
const ensureDate = (value: any): Date => {
  if (value instanceof Date) return value;
  return new Date(value);
};

export const useChatHistoryStore = create<ChatHistoryState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      recentSessionIds: [],
      isHistoryPanelOpen: false,
      isSidebarCollapsed: false, // Sidebar expanded by default
      searchQuery: '',
      selectedSessionIds: [],
      
      createSession: (title, messages = []) => {
        const sessionId = uuidv4();
        const now = new Date();
        
        // Don't create welcome message - start with empty messages
        const initialMessages = messages.length > 0 ? messages : [];
        
        const sessionTitle = title || generateSessionTitle(initialMessages) || 'New Chat';
        
        const newSession: ChatSession = {
          id: sessionId,
          title: sessionTitle,
          createdAt: now,
          lastModified: now,
          messages: initialMessages,
          metadata: {
            messageCount: initialMessages.length,
            lastActivity: now,
            starred: false,
            tags: [],
          }
        };
        
        set((state) => {
          const updatedRecentIds = [sessionId, ...state.recentSessionIds.filter(id => id !== sessionId)].slice(0, 5);
          return {
            sessions: [newSession, ...state.sessions],
            activeSessionId: sessionId,
            recentSessionIds: updatedRecentIds,
          };
        });
        
        return sessionId;
      },
      
      switchToSession: (sessionId) => {
        const { sessions, recentSessionIds } = get();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        
        // Update recent sessions list
        const updatedRecentIds = [sessionId, ...recentSessionIds.filter(id => id !== sessionId)].slice(0, 5);
        
        set({
          activeSessionId: sessionId,
          recentSessionIds: updatedRecentIds,
          isHistoryPanelOpen: false, // Close panel after selection
        });
      },
      
      saveVisualizationCode: (sessionId, code) => {
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, visualizationCode: code, lastModified: new Date() }
              : session
          )
        }));
      },
      
      getVisualizationCode: (sessionId) => {
        const { sessions } = get();
        const session = sessions.find(s => s.id === sessionId);
        return session?.visualizationCode;
      },
      
      saveViewerVisibility: (sessionId, visible) => {
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, isViewerVisible: visible, lastModified: new Date() }
              : session
          )
        }));
      },
      
      getViewerVisibility: (sessionId) => {
        const { sessions } = get();
        const session = sessions.find(s => s.id === sessionId);
        return session?.isViewerVisible;
      },
      
      saveModelSettings: (sessionId, selectedAgentId, selectedModel) => {
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? {
                  ...session,
                  metadata: {
                    ...session.metadata,
                    selectedAgentId,
                    selectedModel,
                  },
                  lastModified: new Date()
                }
              : session
          )
        }));
      },
      
      getModelSettings: (sessionId) => {
        const { sessions } = get();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return undefined;
        return {
          selectedAgentId: session.metadata.selectedAgentId ?? null,
          selectedModel: session.metadata.selectedModel ?? null,
        };
      },
      
      deleteSession: (sessionId) => {
        set((state) => {
          const updatedSessions = state.sessions.filter(s => s.id !== sessionId);
          const updatedRecentIds = state.recentSessionIds.filter(id => id !== sessionId);
          
          // If deleting active session, switch to most recent or create new one
          let newActiveSessionId = state.activeSessionId;
          if (state.activeSessionId === sessionId) {
            if (updatedSessions.length > 0) {
              newActiveSessionId = updatedRecentIds[0] || updatedSessions[0].id;
            } else {
              // Create a new session if no sessions remain
              newActiveSessionId = null;
            }
          }
          
          return {
            sessions: updatedSessions,
            activeSessionId: newActiveSessionId,
            recentSessionIds: updatedRecentIds,
            selectedSessionIds: state.selectedSessionIds.filter(id => id !== sessionId),
          };
        });
      },
      
      deleteSessions: (sessionIds) => {
        sessionIds.forEach(id => get().deleteSession(id));
        set({ selectedSessionIds: [] });
      },
      
      addMessageToSession: (sessionId, message) => {
        set((state) => {
          const updatedSessions = state.sessions.map(session => {
            if (session.id === sessionId) {
              const updatedMessages = [...session.messages, message];
              
              // Auto-generate title after first AI response
              if (message.type === 'ai') {
                const userMessages = updatedMessages.filter(m => m.type === 'user');
                const aiMessages = updatedMessages.filter(m => m.type === 'ai');
                
                // Only generate title if this is the first AI response and we have at least one user message
                if (aiMessages.length === 1 && userMessages.length >= 1) {
                  const firstUserMsg = userMessages[0];
                  const currentTitle = session.title;
                  
                  // Check if title is default (either "New Chat" or auto-generated from first message)
                  const userContentTrimmed = firstUserMsg.content.trim();
                  const isDefaultTitle = 
                    currentTitle === 'New Chat' || 
                    currentTitle === userContentTrimmed ||
                    (userContentTrimmed.length > 50 && currentTitle.startsWith(userContentTrimmed.slice(0, 8))) ||
                    currentTitle.endsWith('...'); // Auto-generated titles often end with ...
                  
                  console.log('[Title Generation] Checking title generation:', {
                    sessionId,
                    messageCount: updatedMessages.length,
                    userCount: userMessages.length,
                    aiCount: aiMessages.length,
                    currentTitle,
                    isDefaultTitle,
                    firstUserMsgPreview: firstUserMsg.content.slice(0, 50),
                    aiMsgPreview: message.content.slice(0, 50)
                  });
                  
                  // Always generate title for first AI response if it's a default title
                  // This ensures we get a meaningful title even if the auto-generated one is close
                  if (isDefaultTitle) {
                    console.log('[Title Generation] Generating AI title...');
                    // Generate AI title asynchronously
                    generateAITitle(updatedMessages).then(title => {
                      console.log('[Title Generation] Generated title:', title);
                      if (title && title !== 'New Chat') {
                        get().updateSessionTitle(sessionId, title);
                      } else {
                        console.warn('[Title Generation] Received invalid title, keeping current:', currentTitle);
                      }
                    }).catch(err => {
                      console.error('[Title Generation] Error generating AI title:', err);
                    });
                  } else {
                    console.log('[Title Generation] Skipping - title already customized:', currentTitle);
                  }
                }
              }
              
              return {
                ...session,
                messages: updatedMessages,
                lastModified: new Date(),
                metadata: {
                  ...session.metadata,
                  messageCount: updatedMessages.length,
                  lastActivity: new Date(),
                }
              };
            }
            return session;
          });
          
          return { sessions: updatedSessions };
        });
      },
      
      updateSessionMessages: (sessionId, messages) => {
        set((state) => {
          const updatedSessions = state.sessions.map(session => {
            if (session.id === sessionId) {
              return {
                ...session,
                messages,
                lastModified: new Date(),
                metadata: {
                  ...session.metadata,
                  messageCount: messages.length,
                  lastActivity: new Date(),
                }
              };
            }
            return session;
          });
          
          return { sessions: updatedSessions };
        });
      },
      
      updateSessionTitle: (sessionId, title) => {
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, title, lastModified: new Date() }
              : session
          )
        }));
      },
      
      starSession: (sessionId, starred) => {
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? {
                  ...session,
                  metadata: { ...session.metadata, starred },
                  lastModified: new Date()
                }
              : session
          )
        }));
      },
      
      duplicateSession: (sessionId) => {
        const { sessions } = get();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return '';
        
        const newSessionId = uuidv4();
        const now = new Date();
        
        const duplicatedSession: ChatSession = {
          ...session,
          id: newSessionId,
          title: `${session.title} (Copy)`,
          createdAt: now,
          lastModified: now,
          metadata: {
            ...session.metadata,
            lastActivity: now,
          }
        };
        
        set((state) => ({
          sessions: [duplicatedSession, ...state.sessions]
        }));
        
        return newSessionId;
      },
      
      setHistoryPanelOpen: (open) => set({ isHistoryPanelOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      toggleSessionSelection: (sessionId) => {
        set((state) => {
          const isSelected = state.selectedSessionIds.includes(sessionId);
          return {
            selectedSessionIds: isSelected
              ? state.selectedSessionIds.filter(id => id !== sessionId)
              : [...state.selectedSessionIds, sessionId]
          };
        });
      },
      
      selectAllSessions: () => {
        const { sessions } = get();
        set({ selectedSessionIds: sessions.map(s => s.id) });
      },
      
      clearSelection: () => set({ selectedSessionIds: [] }),
      
      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find(s => s.id === activeSessionId) || null;
      },
      
      getFilteredSessions: () => {
        const { sessions, searchQuery } = get();
        if (!searchQuery.trim()) return sessions;
        
        const query = searchQuery.toLowerCase();
        return sessions.filter(session =>
          session.title.toLowerCase().includes(query) ||
          session.messages.some(message =>
            message.content.toLowerCase().includes(query)
          ) ||
          session.metadata.tags?.some(tag => tag.toLowerCase().includes(query))
        );
      },
      
      searchSessions: (query) => {
        const { sessions } = get();
        if (!query.trim()) return sessions;
        
        const searchTerm = query.toLowerCase();
        return sessions.filter(session =>
          session.title.toLowerCase().includes(searchTerm) ||
          session.messages.some(message =>
            message.content.toLowerCase().includes(searchTerm)
          )
        );
      },
      
      exportSessions: (sessionIds) => {
        const { sessions } = get();
        const sessionsToExport = sessionIds
          ? sessions.filter(s => sessionIds.includes(s.id))
          : sessions;
        
        const exportData = {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          sessions: sessionsToExport,
        };
        
        return JSON.stringify(exportData, null, 2);
      },
      
      importSessions: (jsonData) => {
        try {
          const importData = JSON.parse(jsonData);
          if (!importData.sessions || !Array.isArray(importData.sessions)) {
            return false;
          }
          
          const importedSessions = importData.sessions.map((session: any) => ({
            ...session,
            id: uuidv4(), // Generate new IDs to avoid conflicts
            createdAt: new Date(session.createdAt),
            lastModified: new Date(session.lastModified),
            messages: session.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          }));
          
          set((state) => ({
            sessions: [...importedSessions, ...state.sessions]
          }));
          
          return true;
        } catch (error) {
          console.error('Failed to import sessions:', error);
          return false;
        }
      },
      
      clearAllSessions: () => {
        set({
          sessions: [],
          activeSessionId: null,
          recentSessionIds: [],
          selectedSessionIds: [],
        });
      },
      
      cleanupOldSessions: (retentionDays) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        let deletedCount = 0;
        set((state) => {
          const remainingSessions = state.sessions.filter(session => {
            const shouldDelete = session.lastModified < cutoffDate && !session.metadata.starred;
            if (shouldDelete) deletedCount++;
            return !shouldDelete;
          });
          
          return {
            sessions: remainingSessions,
            activeSessionId: remainingSessions.find(s => s.id === state.activeSessionId)
              ? state.activeSessionId
              : (remainingSessions[0]?.id || null),
            recentSessionIds: state.recentSessionIds.filter(id =>
              remainingSessions.some(s => s.id === id)
            ),
            selectedSessionIds: state.selectedSessionIds.filter(id =>
              remainingSessions.some(s => s.id === id)
            ),
          };
        });
        
        return deletedCount;
      },
      
      getStorageStats: () => {
        const { sessions } = get();
        const totalMessages = sessions.reduce((total, session) => total + session.messages.length, 0);
        const estimatedSize = calculateStorageSize(sessions);
        
        return {
          totalSessions: sessions.length,
          totalMessages,
          estimatedSize,
        };
      },
    }),
    {
      name: 'novoprotein-chat-history-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        recentSessionIds: state.recentSessionIds,
        isSidebarCollapsed: state.isSidebarCollapsed, // Persist sidebar state
        // Don't persist UI state like panel open, search query, selections
      }),
      // Custom serialization to handle Date objects
      serialize: (state) => {
        return JSON.stringify(state, (_, value) => {
          if (value instanceof Date) {
            return { __type: 'Date', value: value.toISOString() };
          }
          return value;
        });
      },
      deserialize: (str) => {
        const parsed = JSON.parse(str, (_, value) => {
          if (value && typeof value === 'object' && value.__type === 'Date') {
            return new Date(value.value);
          }
          return value;
        });
        
        // Ensure all dates in sessions are properly converted
        if (parsed.sessions) {
          parsed.sessions = parsed.sessions.map((session: any) => ({
            ...session,
            createdAt: ensureDate(session.createdAt),
            lastModified: ensureDate(session.lastModified),
            metadata: {
              ...session.metadata,
              lastActivity: ensureDate(session.metadata.lastActivity),
            },
            messages: session.messages.map((message: any) => {
              const msg: any = {
                ...message,
                timestamp: ensureDate(message.timestamp),
              };
              // Handle thinkingProcess dates
              if (message.thinkingProcess && message.thinkingProcess.steps) {
                msg.thinkingProcess = {
                  ...message.thinkingProcess,
                  steps: message.thinkingProcess.steps.map((step: any) => ({
                    ...step,
                    timestamp: step.timestamp ? ensureDate(step.timestamp) : undefined,
                  })),
                };
              }
              // Handle error timestamp
              if (message.error && message.error.timestamp) {
                msg.error = {
                  ...message.error,
                  timestamp: ensureDate(message.error.timestamp),
                };
              }
              return msg;
            }),
          }));
        }
        
        return parsed;
      },
    }
  )
);

// Convenience hooks for specific functionality
export const useActiveSession = () => {
  const activeSession = useChatHistoryStore((state) => state.getActiveSession());
  const addMessage = useChatHistoryStore((state) => state.addMessageToSession);
  const updateMessages = useChatHistoryStore((state) => state.updateSessionMessages);
  
  return {
    activeSession,
    addMessage: (message: Message) => {
      if (activeSession) {
        addMessage(activeSession.id, message);
      }
    },
    updateMessages: (messages: Message[]) => {
      if (activeSession) {
        updateMessages(activeSession.id, messages);
      }
    },
  };
};

export const useSessionManagement = () => {
  const {
    createSession,
    switchToSession,
    deleteSession,
    deleteSessions,
    duplicateSession,
    updateSessionTitle,
    starSession,
  } = useChatHistoryStore();
  
  return {
    createSession,
    switchToSession,
    deleteSession,
    deleteSessions,
    duplicateSession,
    updateSessionTitle,
    starSession,
  };
};