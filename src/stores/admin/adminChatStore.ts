import { create } from 'zustand';
import { api } from '../../utils/api';

export interface ChatMessage {
  id: string;
  session_id: string;
  conversation_id?: string;
  user_id: string;
  sender_id?: string;
  content: string;
  message_type: string;
  role?: string;
  metadata?: any;
  created_at: string;
  sender_username?: string;
  sender_email?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title?: string;
  created_at: string;
  updated_at?: string;
  message_count?: number;
  username?: string;
  email?: string;
  messages?: ChatMessage[];
}

export interface ChatFilters {
  user_id?: string;
  session_id?: string;
  conversation_id?: string;
  date_from?: string;
  date_to?: string;
  message_type?: string;
  search?: string;
  include_deleted?: boolean;
}

type ViewMode = 'thread' | 'table' | 'both';

interface AdminChatState {
  messages: ChatMessage[];
  sessions: ChatSession[];
  selectedSession: ChatSession | null;
  loading: boolean;
  error: string | null;
  cursor: string | null;
  hasMore: boolean;
  limit: number;
  filters: ChatFilters;
  privacyMode: boolean;
  viewMode: ViewMode;

  // Actions
  loadMessages: (reset?: boolean) => Promise<void>;
  loadSessions: (reset?: boolean) => Promise<void>;
  loadSessionMessages: (sessionId: string) => Promise<void>;
  setFilters: (filters: Partial<ChatFilters>) => void;
  setPrivacyMode: (enabled: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setLimit: (limit: number) => void;
  clearSelectedSession: () => void;
}

export const useAdminChatStore = create<AdminChatState>((set, get) => ({
  messages: [],
  sessions: [],
  selectedSession: null,
  loading: false,
  error: null,
  cursor: null,
  hasMore: false,
  limit: 25,
  filters: {},
  privacyMode: false,
  viewMode: 'both',

  loadMessages: async (reset = false) => {
    if (reset) {
      set({ messages: [], cursor: null, hasMore: false });
    }

    const state = get();
    if (state.loading) return;

    set({ loading: true, error: null });

    try {
      const params: any = {
        limit: state.limit,
        privacy_mode: state.privacyMode,
      };

      if (state.cursor && !reset) {
        params.cursor = state.cursor;
      }

      if (state.filters.user_id) {
        params.user_id = state.filters.user_id;
      }
      if (state.filters.session_id) {
        params.session_id = state.filters.session_id;
      }
      if (state.filters.conversation_id) {
        params.conversation_id = state.filters.conversation_id;
      }
      if (state.filters.date_from) {
        params.date_from = state.filters.date_from;
      }
      if (state.filters.date_to) {
        params.date_to = state.filters.date_to;
      }
      if (state.filters.message_type) {
        params.message_type = state.filters.message_type;
      }
      if (state.filters.search) {
        params.search = state.filters.search;
      }
      if (state.filters.include_deleted) {
        params.include_deleted = state.filters.include_deleted;
      }

      const response = await api.get('/admin/chat/messages', { params });

      set({
        messages: reset
          ? response.data.messages
          : [...state.messages, ...response.data.messages],
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load messages',
        loading: false,
      });
    }
  },

  loadSessions: async (reset = false) => {
    if (reset) {
      set({ sessions: [], cursor: null, hasMore: false });
    }

    const state = get();
    if (state.loading) return;

    set({ loading: true, error: null });

    try {
      const params: any = {
        limit: state.limit,
      };

      if (state.cursor && !reset) {
        params.cursor = state.cursor;
      }

      if (state.filters.user_id) {
        params.user_id = state.filters.user_id;
      }
      if (state.filters.date_from) {
        params.date_from = state.filters.date_from;
      }
      if (state.filters.date_to) {
        params.date_to = state.filters.date_to;
      }

      const response = await api.get('/admin/chat/sessions', { params });

      set({
        sessions: reset
          ? response.data.sessions
          : [...state.sessions, ...response.data.sessions],
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load sessions',
        loading: false,
      });
    }
  },

  loadSessionMessages: async (sessionId: string) => {
    set({ loading: true, error: null });

    try {
      // Load session details
      const sessionResponse = await api.get(`/admin/chat/sessions`, {
        params: { session_id: sessionId },
      });

      const session = sessionResponse.data.sessions?.[0];
      if (!session) {
        throw new Error('Session not found');
      }

      // Load messages for this session
      const messagesResponse = await api.get('/admin/chat/messages', {
        params: {
          session_id: sessionId,
          limit: 100,
          privacy_mode: get().privacyMode,
        },
      });

      set({
        selectedSession: {
          ...session,
          messages: messagesResponse.data.messages,
        },
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load session messages',
        loading: false,
      });
    }
  },

  setFilters: (filters: Partial<ChatFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    // Reset and reload when filters change
    get().loadMessages(true);
    get().loadSessions(true);
  },

  setPrivacyMode: (enabled: boolean) => {
    set({ privacyMode: enabled });
    // Reload current data with new privacy mode
    get().loadMessages(true);
    const selectedSession = get().selectedSession;
    if (selectedSession) {
      get().loadSessionMessages(selectedSession.id);
    }
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },

  setLimit: (limit: number) => {
    set({ limit });
    get().loadMessages(true);
    get().loadSessions(true);
  },

  clearSelectedSession: () => {
    set({ selectedSession: null });
  },
}));
