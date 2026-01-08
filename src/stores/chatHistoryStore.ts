import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../utils/api';
import { ErrorDetails } from '../utils/errorHandler';
import { useAuthStore } from './authStore';

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
  conversationId?: string; // New: conversation ID (replaces sessionId)
  sessionId?: string; // Keep for backward compatibility
  senderId?: string; // Can be human or AI user_id
  content: string;
  type: 'user' | 'ai'; // Keep for backward compatibility
  messageType?: 'text' | 'tool_call' | 'tool_result'; // New: message type
  role?: 'user' | 'assistant' | 'system';
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
  rfdiffusionResult?: {
    pdbContent?: string;
    fileId?: string;
    filename?: string;
    parameters?: any;
    metadata?: any;
  };
  // File attachment for user messages (deprecated - use attachments array)
  uploadedFile?: {
    file_id: string;
    filename: string;
    file_url: string;
    atoms: number;
    chains: string[];
  };
  // Linked tools (message-scoped)
  threeDCanvas?: {
    id: string;
    sceneData: string; // Molstar code
    previewUrl?: string;
  };
  pipeline?: {
    id: string;
    name: string;
    workflowDefinition: any;
    status: 'draft' | 'running' | 'completed' | 'failed';
  };
  attachments?: Array<{
    id: string;
    fileId: string;
    fileName: string;
    fileType: string;
    fileSizeKb: number;
  }>;
  error?: ErrorDetails;
}

export interface ChatSession {
  id: string;
  title: string;
  userId?: string; // New: user ID
  aiAgentId?: string; // New: AI participant user_id
  createdAt: Date;
  lastModified: Date;
  messages: Message[];
  // visualizationCode removed - now message-scoped in threeDCanvas
  isViewerVisible?: boolean; // Whether 3D viewer is visible for this session (global toggle)
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

interface PendingMessage {
  sessionId: string;
  message: Message;
  retryCount: number;
  lastAttempt: number;
  id: string; // Unique ID for this pending message
}

interface ChatHistoryState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  recentSessionIds: string[]; // Quick access to recent sessions (max 5)
  isHistoryPanelOpen: boolean;
  isSidebarCollapsed: boolean; // New sidebar state
  searchQuery: string;
  selectedSessionIds: string[]; // For bulk operations
  _isSyncing: boolean; // Internal flag to prevent concurrent syncs
  _lastSyncTime: number | null; // Track last sync time to prevent duplicate syncs
  _pendingMessages: PendingMessage[]; // Queue of messages that failed to save
  _isRetrying: boolean; // Flag to prevent concurrent retries
  
  // Core Session Actions
  createSession: (title?: string, messages?: Message[]) => Promise<string>; // Already async
  switchToSession: (sessionId: string) => Promise<void>; // Now async to load messages
  deleteSession: (sessionId: string) => Promise<void>;
  deleteSessions: (sessionIds: string[]) => Promise<void>;
  addMessageToSession: (sessionId: string, message: Message) => Promise<void>;
  updateSessionMessages: (sessionId: string, messages: Message[]) => void;
  syncSessions: () => Promise<void>;
  syncSessionMessages: (sessionId: string) => Promise<void>;
  syncSessionState: (sessionId: string) => Promise<void>;
  
  // Session Management
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
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
  saveVisualizationCode: (sessionId: string, code: string, messageId?: string) => Promise<void>;
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
  
  // Message Save Queue Management
  retryPendingMessages: () => Promise<void>;
  getPendingMessageCount: () => number;
  clearPendingMessages: () => void;
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
  if (!value) return new Date(); // Fallback for null/undefined
  return new Date(value);
};

// Retry with exponential backoff
const retryWithBackoff = async (
  fn: () => Promise<any>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<any> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error; // Last attempt failed
      }
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Save message to backend with retry logic (defined inside store to access get())
const createSaveMessageToBackend = (getSessions: () => ChatSession[]) => async (
  sessionId: string,
  message: Message,
  maxRetries: number = 3
): Promise<boolean> => {
  const user = useAuthStore.getState().user;
  if (!user) {
    return false;
  }

  // Ensure session exists in backend
  try {
    await api.get(`/chat/sessions/${sessionId}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      // Session doesn't exist, create it
      try {
        const sessions = getSessions();
        const session = sessions.find(s => s.id === sessionId);
        await api.post('/chat/sessions', {
          id: sessionId,
          title: session?.title || 'New Chat'
        });
      } catch (createError) {
        console.error('[saveMessageToBackend] Failed to create session:', createError);
        return false;
      }
    }
  }

  // Determine sender_id: use message.senderId if provided, otherwise use user_id for human or find AI agent
  let senderId = message.senderId;
  if (!senderId) {
    if (message.type === 'ai' || message.messageType === 'tool_result') {
      // For AI messages, try to find AI agent user_id
      // This will be set by the backend if not provided
      senderId = user.id; // Fallback - backend will handle AI agent assignment
    } else {
      senderId = user.id;
    }
  }
  
  // Save message with retry
  try {
    await retryWithBackoff(async () => {
      const payload: any = {
        content: message.content,
        type: message.type,
        messageType: message.messageType || (message.type === 'ai' ? 'tool_result' : 'text'),
        role: message.role || (message.type === 'user' ? 'user' : 'assistant'),
        sender_id: senderId,
        metadata: {
          jobId: message.jobId,
          jobType: message.jobType,
          thinkingProcess: message.thinkingProcess,
          alphafoldResult: message.alphafoldResult,
          proteinmpnnResult: message.proteinmpnnResult,
          rfdiffusionResult: message.rfdiffusionResult,
          uploadedFile: message.uploadedFile,
          error: message.error,
        },
      };
      
      // Include 3D canvas data if present
      if (message.threeDCanvas) {
        payload.threeDCanvas = {
          sceneData: message.threeDCanvas.sceneData,
          previewUrl: message.threeDCanvas.previewUrl,
        };
      }
      
      return await api.post(`/chat/sessions/${sessionId}/messages`, payload);
    }, maxRetries);
    
    // If canvas wasn't included in message but exists, save it separately
    if (!message.threeDCanvas && message.id) {
      // This shouldn't happen often, but handle it as fallback
      console.warn('[saveMessageToBackend] Message saved but canvas data not included');
    }
    
    return true;
  } catch (error: any) {
    console.error('[saveMessageToBackend] Failed to save message after retries:', error);
    return false;
  }
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
      _isSyncing: false, // Track if sync is in progress
      _lastSyncTime: null, // Track last sync timestamp
      _pendingMessages: [], // Queue of messages that failed to save
      _isRetrying: false, // Flag to prevent concurrent retries
      
      createSession: async (title, messages = []) => {
        const sessionId = uuidv4();
        const now = new Date();
        
        // Don't create welcome message - start with empty messages
        const initialMessages = messages.length > 0 ? messages : [];
        
        const sessionTitle = title || generateSessionTitle(initialMessages) || 'New Chat';
        
        // Check if user is authenticated and create session in backend FIRST
        const user = useAuthStore.getState().user;
        if (user) {
          try {
            const response = await api.post('/chat/sessions', { title: sessionTitle });
            // Use the session_id from backend if provided, otherwise use generated one
            const backendSessionId = response.data.session_id || sessionId;
            console.log('Session created on backend:', backendSessionId);
            
            // Use backend session ID if different
            const finalSessionId = backendSessionId !== sessionId ? backendSessionId : sessionId;
            
            const newSession: ChatSession = {
              id: finalSessionId,
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
              const updatedRecentIds = [finalSessionId, ...state.recentSessionIds.filter(id => id !== finalSessionId)].slice(0, 5);
              return {
                sessions: [newSession, ...state.sessions],
                activeSessionId: finalSessionId,
                recentSessionIds: updatedRecentIds,
              };
            });
            
            // Save initial messages to backend if any
            if (initialMessages.length > 0) {
              for (const message of initialMessages) {
                try {
                  const payload: any = {
                    content: message.content,
                    type: message.type,
                    role: message.type === 'user' ? 'user' : 'assistant',
                    metadata: {
                      jobId: message.jobId,
                      jobType: message.jobType,
                      thinkingProcess: message.thinkingProcess,
                      alphafoldResult: message.alphafoldResult,
                      proteinmpnnResult: message.proteinmpnnResult,
                    },
                  };
                  
                  // Include 3D canvas data if present
                  if (message.threeDCanvas) {
                    payload.threeDCanvas = {
                      sceneData: message.threeDCanvas.sceneData,
                      previewUrl: message.threeDCanvas.previewUrl,
                    };
                  }
                  
                  await api.post(`/chat/sessions/${finalSessionId}/messages`, payload);
                } catch (error) {
                  console.error('Failed to save initial message to backend:', error);
                }
              }
            }
            
            return finalSessionId;
          } catch (error: any) {
            console.error('Failed to create session on backend:', error);
            // Fall through to local-only creation
          }
        }
        
        // Local-only creation (if not authenticated or backend failed)
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
      
      switchToSession: async (sessionId) => {
        const { sessions, recentSessionIds, syncSessionMessages } = get();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        
        // Update recent sessions list
        const updatedRecentIds = [sessionId, ...recentSessionIds.filter(id => id !== sessionId)].slice(0, 5);
        
        set({
          activeSessionId: sessionId,
          recentSessionIds: updatedRecentIds,
          isHistoryPanelOpen: false, // Close panel after selection
        });
        
        // Load messages from backend if session has no messages or messages might be outdated
        // Check if messages array is empty or if we should refresh from backend
        const user = useAuthStore.getState().user;
        if (user && syncSessionMessages) {
          // Always sync messages when switching to ensure we have the latest from backend
          // This is especially important after login when sessions are synced without messages
          try {
            await syncSessionMessages(sessionId);
          } catch (error) {
            console.error('Failed to sync messages when switching session:', error);
          }
        }
      },
      
      saveVisualizationCode: async (sessionId, code, messageId?: string) => {
        const user = useAuthStore.getState().user;
        if (!user) {
          console.warn('[saveVisualizationCode] User not authenticated, code not saved to backend');
          return;
        }
        
        // If messageId is provided, create message-scoped canvas
        if (messageId) {
          try {
            await api.post(`/conversations/${sessionId}/messages/${messageId}/canvas`, {
              scene_data: code,
            });
            console.log(`[saveVisualizationCode] Canvas created for message ${messageId} in session ${sessionId}`);
            
            // Update local message state
            set((state) => ({
              sessions: state.sessions.map(session => {
                if (session.id === sessionId) {
                  return {
                    ...session,
                    messages: session.messages.map(msg =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            threeDCanvas: {
                              id: messageId, // Temporary ID, will be updated on sync
                              sceneData: code,
                            },
                          }
                        : msg
                    ),
                    lastModified: new Date(),
                  };
                }
                return session;
              }),
            }));
          } catch (error: any) {
            console.error(`[saveVisualizationCode] Failed to create message-scoped canvas:`, error);
            // Fallback to session-scoped for backward compatibility
            try {
              await api.put(`/chat/sessions/${sessionId}/state`, {
                visualization_code: code,
              });
              console.log(`[saveVisualizationCode] Fallback: Visualization code synced to session state`);
            } catch (fallbackError: any) {
              console.error(`[saveVisualizationCode] Fallback also failed:`, fallbackError);
            }
          }
        } else {
          // No messageId - use deprecated session-scoped approach (backward compatibility)
          console.warn('[saveVisualizationCode] No messageId provided, using deprecated session-scoped storage');
          try {
            await api.put(`/chat/sessions/${sessionId}/state`, {
              visualization_code: code,
            });
            console.log(`[saveVisualizationCode] Visualization code synced to session state (deprecated)`);
          } catch (error: any) {
            console.error(`[saveVisualizationCode] Failed to sync visualization code to backend:`, error);
          }
        }
      },
      
      getVisualizationCode: (_sessionId) => {
        // visualizationCode is now message-scoped in threeDCanvas, not session-scoped
        // This method is kept for backward compatibility but returns undefined
        return undefined;
      },
      
      saveViewerVisibility: async (sessionId, visible) => {
        // Update local state immediately
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, isViewerVisible: visible, lastModified: new Date() }
              : session
          )
        }));
        
        // Sync to backend
        const user = useAuthStore.getState().user;
        if (user) {
          try {
            await api.put(`/chat/sessions/${sessionId}/state`, {
              viewer_visible: visible,
            });
            console.log(`[saveViewerVisibility] Visibility synced to backend for session ${sessionId}`);
          } catch (error: any) {
            console.error(`[saveViewerVisibility] Failed to sync visibility to backend:`, error);
            // Don't revert local state - keep optimistic update
          }
        }
      },
      
      getViewerVisibility: (sessionId) => {
        const { sessions } = get();
        const session = sessions.find(s => s.id === sessionId);
        return session?.isViewerVisible;
      },
      
      saveModelSettings: async (sessionId, selectedAgentId, selectedModel) => {
        // Update local state immediately
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
        
        // Sync to backend
        const user = useAuthStore.getState().user;
        if (user) {
          try {
            await api.put(`/chat/sessions/${sessionId}/state`, {
              model_settings: {
                selectedAgentId,
                selectedModel,
              },
            });
            console.log(`[saveModelSettings] Model settings synced to backend for session ${sessionId}`);
          } catch (error: any) {
            console.error(`[saveModelSettings] Failed to sync model settings to backend:`, error);
            // Don't revert local state - keep optimistic update
          }
        }
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
      
      deleteSession: async (sessionId) => {
        // Check if user is authenticated and delete from backend
        const user = useAuthStore.getState().user;
        if (user) {
          try {
            await api.delete(`/chat/sessions/${sessionId}`);
            console.log('Session deleted from backend');
          } catch (error: any) {
            console.warn('Failed to delete session from backend:', error);
            // Continue with local delete even if backend fails
          }
        }
        
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
      
      deleteSessions: async (sessionIds) => {
        await Promise.all(sessionIds.map(id => get().deleteSession(id)));
        set({ selectedSessionIds: [] });
      },
      
      addMessageToSession: async (sessionId, message) => {
        // Check if user is authenticated - require auth for saving
        const user = useAuthStore.getState().user;
        const saveMessageToBackend = createSaveMessageToBackend(() => get().sessions);
        
        if (!user) {
          console.warn('[addMessageToSession] User not authenticated - message will only be saved locally');
          // Still save locally but don't attempt backend save
        } else {
          // Try to save to backend with retry logic
          const saved = await saveMessageToBackend(sessionId, message, 3);
          
          if (!saved) {
            // Save failed, add to pending queue
            const pendingMessage: PendingMessage = {
              id: uuidv4(),
              sessionId,
              message,
              retryCount: 0,
              lastAttempt: Date.now(),
            };
            
            set((state) => ({
              _pendingMessages: [...state._pendingMessages, pendingMessage],
            }));
            
            console.warn('[addMessageToSession] Message saved to pending queue:', pendingMessage.id);
            
            // Dispatch custom event for UI notification
            window.dispatchEvent(new CustomEvent('message-save-failed', {
              detail: { sessionId, messageId: message.id }
            }));
            
            // Try to retry pending messages in background
            get().retryPendingMessages().catch(err => {
              console.error('[addMessageToSession] Failed to retry pending messages:', err);
            });
          } else {
            console.log('[addMessageToSession] Message saved to backend successfully');
          }
        }
        
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
      
      updateSessionTitle: async (sessionId, title) => {
        // Update local state immediately for responsive UI
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, title, lastModified: new Date() }
              : session
          )
        }));

        // Save to backend
        const user = useAuthStore.getState().user;
        if (user) {
          try {
            await api.put(`/chat/sessions/${sessionId}`, {
              title: title
            });
            console.log(`[updateSessionTitle] Successfully saved title "${title}" for session ${sessionId}`);
          } catch (error: any) {
            console.error(`[updateSessionTitle] Failed to save title to backend:`, error);
            // Revert local state on error (optional - you might want to keep optimistic update)
            // For now, we'll keep the optimistic update and log the error
          }
        } else {
          console.warn('[updateSessionTitle] User not authenticated, title not saved to backend');
        }
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
      
      syncSessions: async () => {
        const user = useAuthStore.getState().user;
        const state = get();
        
        // Prevent concurrent syncs - if already syncing, skip
        if (state._isSyncing) {
          console.log('Sync already in progress, skipping duplicate sync');
          return;
        }
        
        // Prevent duplicate syncs within 2 seconds (e.g., from signin + onRehydrateStorage)
        const now = Date.now();
        if (state._lastSyncTime && (now - state._lastSyncTime) < 2000) {
          console.log('Sync called too soon after last sync, skipping duplicate');
          return;
        }
        
        // Mark as syncing
        set({ _isSyncing: true, _lastSyncTime: now });
        
        // IMMEDIATELY clear sessions to prevent duplicates during sync
        set({ 
          sessions: [], 
          activeSessionId: null, 
          recentSessionIds: [],
          selectedSessionIds: [],
        });
        
        if (!user) {
          console.log('User not authenticated, sessions cleared');
          set({ _isSyncing: false });
          return;
        }
        
        try {
          const response = await api.get('/chat/sessions');
          const backendSessions = response.data.sessions || [];
          
          // If no sessions in backend, keep empty array (already cleared above)
          if (backendSessions.length === 0) {
            console.log('No sessions found in backend, initializing with empty chat history');
            set({ _isSyncing: false });
            return;
          }
          
          // Convert dates and ensure unique IDs
          const sessionMap = new Map<string, ChatSession>();
          backendSessions.forEach((bs: any) => {
            // Skip if duplicate ID (shouldn't happen, but safety check)
            if (sessionMap.has(bs.id)) {
              console.warn(`Duplicate session ID found: ${bs.id}, skipping`);
              return;
            }
            
            sessionMap.set(bs.id, {
              id: bs.id,
              title: bs.title || 'New Chat',
              createdAt: new Date(bs.created_at),
              lastModified: new Date(bs.updated_at || bs.created_at),
              messages: [], // Messages will be loaded separately
              metadata: {
                messageCount: 0,
                lastActivity: new Date(bs.updated_at || bs.created_at),
                starred: false,
                tags: [],
              },
            });
          });
          
          // Convert map to array (ensures unique IDs)
          const sessions = Array.from(sessionMap.values());
          
          // REPLACE all sessions (don't merge) - already cleared above, but set again to be explicit
          const newActiveSessionId = sessions.length > 0 ? sessions[0].id : null;
          set({ 
            sessions, 
            activeSessionId: newActiveSessionId,
            recentSessionIds: sessions.slice(0, 5).map(s => s.id),
            selectedSessionIds: [],
          });
          console.log(`Synced ${sessions.length} unique sessions from backend for user ${user.id}`);
          
          // Load messages for ALL sessions (not just active) to ensure messages are available
          // This is important for app refresh - we need to load all messages
          if (sessions.length > 0 && get().syncSessionMessages) {
            console.log(`[syncSessions] Loading messages and state for ${sessions.length} sessions...`);
            
            // Load messages and state for all sessions in parallel (but limit concurrency)
            const sessionPromises = sessions.map(async (session) => {
              try {
                // Load messages first
                await get().syncSessionMessages(session.id);
                // syncSessionMessages already calls syncSessionState, so state will be loaded too
              } catch (error) {
                console.error(`[syncSessions] Failed to load data for session ${session.id}:`, error);
              }
            });
            
            // Wait for all sessions to load
            await Promise.allSettled(sessionPromises);
            console.log(`[syncSessions] Finished loading messages and state for all sessions`);
          }
        } catch (error: any) {
          console.error('Failed to sync sessions from backend:', error);
          // On error, ensure sessions are cleared (already cleared above, but be explicit)
          set({ 
            sessions: [], 
            activeSessionId: null, 
            recentSessionIds: [],
            selectedSessionIds: [],
          });
        } finally {
          // Always clear syncing flag
          set({ _isSyncing: false });
        }
      },
      
      syncSessionMessages: async (sessionId: string) => {
        const user = useAuthStore.getState().user;
        if (!user) {
          console.log('[syncSessionMessages] User not authenticated, skipping message sync');
          return;
        }
        
        try {
          console.log(`[syncSessionMessages] Fetching messages for session ${sessionId}`);
          const response = await api.get(`/chat/sessions/${sessionId}/messages`);
          console.log(`[syncSessionMessages] API response:`, {
            status: response.status,
            dataKeys: Object.keys(response.data || {}),
            messagesCount: response.data?.messages?.length || 0,
          });
          
          const backendMessages = response.data.messages || [];
          
          console.log(`[syncSessionMessages] Loading ${backendMessages.length} messages for session ${sessionId}`);
          
          if (backendMessages.length === 0) {
            console.warn(`[syncSessionMessages] No messages found for session ${sessionId} - this might be expected for new sessions`);
          }
          
          // Convert backend messages to frontend Message format
          const messages: Message[] = backendMessages.map((bm: any) => {
            try {
              // Extract metadata fields and ensure proper types
              // Backend should parse JSON, but handle both string and object cases
              let metadata = bm.metadata || {};
              if (typeof metadata === 'string') {
                try {
                  metadata = JSON.parse(metadata);
                } catch (e) {
                  console.warn(`[syncSessionMessages] Failed to parse metadata JSON for message ${bm.id}:`, e);
                  metadata = {};
                }
              }
              
              // Convert timestamp strings to Date objects in nested structures
              let thinkingProcess = metadata.thinkingProcess;
              if (thinkingProcess && thinkingProcess.steps) {
                thinkingProcess = {
                  ...thinkingProcess,
                  steps: thinkingProcess.steps.map((step: any) => ({
                    ...step,
                    timestamp: step.timestamp ? new Date(step.timestamp) : undefined,
                  })),
                };
              }
              
              // Build message object with all fields
              const message: Message = {
                id: bm.id,
                conversationId: bm.conversation_id || sessionId,
                sessionId: bm.session_id || sessionId, // Keep for backward compatibility
                senderId: bm.sender_id || bm.user_id,
                content: bm.content || '',
                type: bm.message_type === 'user' ? 'user' : 'ai', // Keep for backward compatibility
                messageType: bm.message_type === 'ai' ? 'tool_result' : (bm.message_type || 'text'),
                role: bm.role || (bm.message_type === 'ai' ? 'assistant' : 'user'),
                timestamp: new Date(bm.created_at),
                // Spread metadata fields to top level
                ...(metadata.jobId && { jobId: metadata.jobId }),
                ...(metadata.jobType && { jobType: metadata.jobType }),
                ...(thinkingProcess && { thinkingProcess }),
                // Check for result objects - use != null to check for both null and undefined
                ...(metadata.alphafoldResult != null && { alphafoldResult: metadata.alphafoldResult }),
                ...(metadata.proteinmpnnResult != null && { proteinmpnnResult: metadata.proteinmpnnResult }),
                // RFdiffusion result - check if it exists and is a valid object
                ...(metadata.rfdiffusionResult != null && 
                    typeof metadata.rfdiffusionResult === 'object' && 
                    { rfdiffusionResult: metadata.rfdiffusionResult }),
                ...(metadata.uploadedFile != null && { uploadedFile: metadata.uploadedFile }),
                ...(metadata.error != null && { error: metadata.error }),
                // Linked tools (from backend API response)
                ...(bm.threeDCanvas && { threeDCanvas: bm.threeDCanvas }),
                ...(bm.pipeline && { pipeline: bm.pipeline }),
                ...(bm.attachments && { attachments: bm.attachments }),
              };
              
              return message;
            } catch (err) {
              // Fallback: create basic message if parsing fails
              console.warn(`[syncSessionMessages] Failed to parse message ${bm.id}, using fallback:`, err);
              return {
                id: bm.id,
                conversationId: bm.conversation_id || sessionId,
                sessionId: bm.session_id || sessionId,
                senderId: bm.sender_id || bm.user_id,
                content: bm.content || '',
                type: bm.message_type === 'user' ? 'user' : 'ai',
                messageType: bm.message_type || 'text',
                role: bm.role,
                timestamp: new Date(bm.created_at),
              };
            }
          });
          
          console.log(`[syncSessionMessages] Converted ${messages.length} messages, first message preview:`, {
            id: messages[0]?.id,
            type: messages[0]?.type,
            contentLength: messages[0]?.content?.length,
            hasJobId: !!messages[0]?.jobId,
          });
          
          // Update session with messages
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
                    lastActivity: messages.length > 0 ? ensureDate(messages[messages.length - 1].timestamp) : ensureDate(session.lastModified),
                  },
                };
              }
              return session;
            });
            
            return { sessions: updatedSessions };
          });
          
          console.log(`[syncSessionMessages] Successfully synced ${messages.length} messages for session ${sessionId}`);
          
          // Restore code from the last AI message's canvas data
          const lastAiMessageWithCanvas = messages
            .filter(m => m.type === 'ai' && m.threeDCanvas?.sceneData)
            .sort((a, b) => {
              const aTime = ensureDate(a.timestamp).getTime();
              const bTime = ensureDate(b.timestamp).getTime();
              return bTime - aTime;
            })[0];
          
          if (lastAiMessageWithCanvas?.threeDCanvas?.sceneData) {
            console.log(`[syncSessionMessages] Found canvas data in message ${lastAiMessageWithCanvas.id}, code length: ${lastAiMessageWithCanvas.threeDCanvas.sceneData.length}`);
            // The code will be restored by ChatPanel's useEffect when it detects the session change
          }
          
          // Also sync session state (canvas/viewer) after loading messages
          if (get().syncSessionState) {
            await get().syncSessionState(sessionId);
          }
        } catch (error: any) {
          console.error(`[syncSessionMessages] Failed to sync messages for session ${sessionId}:`, error);
          if (error.response) {
            console.error(`[syncSessionMessages] Error response:`, error.response.status, error.response.data);
          }
        }
      },
      
      syncSessionState: async (sessionId: string) => {
        const user = useAuthStore.getState().user;
        if (!user) {
          console.log('[syncSessionState] User not authenticated, skipping state sync');
          return;
        }
        
        try {
          console.log(`[syncSessionState] Fetching state for session ${sessionId}`);
          const response = await api.get(`/chat/sessions/${sessionId}/state`);
          const state = response.data.state || {};
          
          set((storeState) => {
            const updatedSessions = storeState.sessions.map(session => {
              if (session.id === sessionId) {
                const updated: ChatSession = {
                  ...session,
                  isViewerVisible: state.viewer_visible !== undefined ? state.viewer_visible : session.isViewerVisible,
                };
                
                // Update model settings if available
                if (state.model_settings) {
                  updated.metadata = {
                    ...session.metadata,
                    selectedAgentId: state.model_settings.selectedAgentId ?? session.metadata.selectedAgentId,
                    selectedModel: state.model_settings.selectedModel ?? session.metadata.selectedModel,
                  };
                }
                
                return updated;
              }
              return session;
            });
            
            return { sessions: updatedSessions };
          });
          
          console.log(`[syncSessionState] State loaded for session ${sessionId}`);
        } catch (error: any) {
          console.error(`[syncSessionState] Failed to sync state for session ${sessionId}:`, error);
          // Don't throw - just log error and continue
        }
      },
      
      retryPendingMessages: async () => {
        const state = get();
        if (state._isRetrying || state._pendingMessages.length === 0) {
          return;
        }
        
        set({ _isRetrying: true });
        
        const now = Date.now();
        const maxRetries = 5;
        const retryDelay = 2000; // 2 seconds base delay
        
        const pendingToRetry = state._pendingMessages.filter(pm => {
          // Retry if it's been at least 2 seconds since last attempt
          const timeSinceLastAttempt = now - pm.lastAttempt;
          return timeSinceLastAttempt >= retryDelay && pm.retryCount < maxRetries;
        });
        
        if (pendingToRetry.length === 0) {
          set({ _isRetrying: false });
          return;
        }
        
        console.log(`[retryPendingMessages] Retrying ${pendingToRetry.length} pending messages`);
        
        const saveMessageToBackend = createSaveMessageToBackend(() => get().sessions);
        const results = await Promise.allSettled(
          pendingToRetry.map(async (pending) => {
            const saved = await saveMessageToBackend(pending.sessionId, pending.message, 2);
            return { pending, saved };
          })
        );
        
        const successful: string[] = [];
        const failed: PendingMessage[] = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.saved) {
            successful.push(pendingToRetry[index].id);
          } else {
            const pending = pendingToRetry[index];
            failed.push({
              ...pending,
              retryCount: pending.retryCount + 1,
              lastAttempt: Date.now(),
            });
          }
        });
        
        // Update pending messages: remove successful, update failed
        set((state) => {
          const remainingFailed = state._pendingMessages
            .filter(pm => !successful.includes(pm.id) && !pendingToRetry.some(ptr => ptr.id === pm.id))
            .concat(failed);
          
          return {
            _pendingMessages: remainingFailed,
            _isRetrying: false,
          };
        });
        
        if (successful.length > 0) {
          console.log(`[retryPendingMessages] Successfully saved ${successful.length} messages`);
          // Dispatch success event
          window.dispatchEvent(new CustomEvent('messages-saved', {
            detail: { count: successful.length }
          }));
        }
        
        if (failed.length > 0) {
          console.warn(`[retryPendingMessages] ${failed.length} messages still pending after retry`);
        }
      },
      
      getPendingMessageCount: () => {
        return get()._pendingMessages.length;
      },
      
      clearPendingMessages: () => {
        set({ _pendingMessages: [] });
      },
    }),
    {
      name: 'novoprotein-chat-history-storage', // Base name, will be user-scoped
      version: 1,
      storage: createJSONStorage(() => {
        // Create user-scoped storage adapter
        return {
          getItem: (_key: string) => {
            const user = useAuthStore.getState().user;
            const userId = user?.id || 'anonymous';
            const userKey = `novoprotein-chat-history-${userId}`;
            return localStorage.getItem(userKey);
          },
          setItem: (_key: string, value: string) => {
            const user = useAuthStore.getState().user;
            const userId = user?.id || 'anonymous';
            const userKey = `novoprotein-chat-history-${userId}`;
            localStorage.setItem(userKey, value);
          },
          removeItem: (_key: string) => {
            const user = useAuthStore.getState().user;
            const userId = user?.id || 'anonymous';
            const userKey = `novoprotein-chat-history-${userId}`;
            localStorage.removeItem(userKey);
          },
        };
      }),
      partialize: (state) => ({
        sessions: state.sessions.map(session => ({
          ...session,
          // Persist messages in localStorage as backup (will be synced from backend on load)
          messages: session.messages || [],
        })),
        activeSessionId: state.activeSessionId,
        recentSessionIds: state.recentSessionIds,
        isSidebarCollapsed: state.isSidebarCollapsed, // Persist sidebar state
        _pendingMessages: state._pendingMessages, // Persist pending messages to retry later
        // Don't persist UI state like panel open, search query, selections
        // Don't persist internal sync flags
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
        
        // Check if user is authenticated - if not, return empty state
        const user = useAuthStore.getState().user;
        if (!user) {
          console.log('No user authenticated, returning empty chat history');
          return {
            sessions: [],
            activeSessionId: null,
            recentSessionIds: [],
            isSidebarCollapsed: parsed.isSidebarCollapsed || false,
          };
        }
        
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
            messages: (session.messages || []).map((message: any) => {
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
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Always sync with backend after rehydration to ensure user-specific data
          setTimeout(async () => {
            try {
              const user = useAuthStore.getState().user;
              if (user && state.syncSessions) {
                // Check if we just synced (e.g., from signin) - if so, skip to prevent duplicate
                const now = Date.now();
                if (state._lastSyncTime && (now - state._lastSyncTime) < 2000) {
                  console.log('Skipping onRehydrateStorage sync - already synced recently');
                } else {
                  // Store current sessions with messages and titles as backup before clearing
                  // This prevents messages and titles from disappearing during refresh
                  const backupSessions = state.sessions.map(s => ({
                    id: s.id,
                    messages: s.messages || [],
                    title: s.title,
                  }));
                  
                  // Clear local sessions first, then sync from backend
                  // This ensures we start fresh and get only the current user's sessions
                  console.log('[onRehydrateStorage] Clearing sessions and syncing from backend...');
                  state.clearAllSessions();
                  
                  try {
                    // Sync sessions (this will load messages for all sessions from backend)
                    await state.syncSessions();
                    
                    // Restore messages and titles from backup if backend doesn't have them
                    // This prevents data loss during refresh
                    const syncedSessions = state.sessions;
                    let restoredCount = 0;
                    syncedSessions.forEach(syncedSession => {
                      const backup = backupSessions.find(b => b.id === syncedSession.id);
                      if (backup) {
                        // Restore messages if backend doesn't have them
                        if ((!syncedSession.messages || syncedSession.messages.length === 0) && backup.messages.length > 0) {
                          console.log(`[onRehydrateStorage] Restoring ${backup.messages.length} messages from backup for session ${syncedSession.id}`);
                          try {
                            state.updateSessionMessages(syncedSession.id, backup.messages);
                            restoredCount++;
                          } catch (err) {
                            console.error(`[onRehydrateStorage] Failed to restore messages for session ${syncedSession.id}:`, err);
                          }
                        }
                        // Restore title if backend has default/null title but we have a custom one
                        const backendTitle = syncedSession.title || '';
                        const backupTitle = backup.title || '';
                        if ((backendTitle === 'New Chat' || !backendTitle) && backupTitle && backupTitle !== 'New Chat') {
                          console.log(`[onRehydrateStorage] Restoring title "${backupTitle}" from backup for session ${syncedSession.id}`);
                          state.updateSessionTitle(syncedSession.id, backupTitle).catch(err => {
                            console.error(`[onRehydrateStorage] Failed to restore title for session ${syncedSession.id}:`, err);
                          });
                          restoredCount++;
                        }
                      }
                    });
                    
                    if (restoredCount > 0) {
                      console.log(`[onRehydrateStorage] Restored data from backup for ${restoredCount} sessions`);
                    }
                  } catch (syncError) {
                    console.error('[onRehydrateStorage] Failed to sync sessions from backend:', syncError);
                    // If sync fails, we'll continue with empty sessions
                    // The backup sessions are already in localStorage, so they'll be available
                    // on the next successful sync. This prevents the app from crashing on refresh.
                    if (backupSessions.length > 0) {
                      console.log(`[onRehydrateStorage] Sync failed, but ${backupSessions.length} backup sessions are preserved in localStorage`);
                    }
                  }
                }
                
                // Retry any pending messages after rehydration
                if (state._pendingMessages && state._pendingMessages.length > 0) {
                  console.log(`[onRehydrateStorage] Found ${state._pendingMessages.length} pending messages, retrying...`);
                  setTimeout(() => {
                    state.retryPendingMessages().catch(err => {
                      console.error('[onRehydrateStorage] Failed to retry pending messages:', err);
                    });
                  }, 2000); // Wait a bit for connection to stabilize
                }
              } else if (!user) {
                // If no user, clear all sessions
                state.clearAllSessions();
              }
            } catch (error) {
              // Catch any unexpected errors to prevent app crash on refresh
              console.error('[onRehydrateStorage] Unexpected error during rehydration:', error);
              // Don't throw - allow app to continue with whatever state we have
            }
          }, 1000); // Delay to ensure auth is loaded
        }
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

// Set up connection monitoring to retry pending messages when connection is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[ConnectionMonitor] Connection restored, retrying pending messages...');
    const store = useChatHistoryStore.getState();
    if (store.retryPendingMessages && store.getPendingMessageCount() > 0) {
      store.retryPendingMessages().catch(err => {
        console.error('[ConnectionMonitor] Failed to retry pending messages:', err);
      });
    }
  });
  
  // Also retry periodically (every 30 seconds) if there are pending messages
  setInterval(() => {
    const store = useChatHistoryStore.getState();
    if (store.retryPendingMessages && store.getPendingMessageCount() > 0 && navigator.onLine) {
      store.retryPendingMessages().catch(err => {
        console.error('[ConnectionMonitor] Periodic retry failed:', err);
      });
    }
  }, 30000); // 30 seconds
}