import { create } from 'zustand';
import { api } from '../../utils/api';

export interface User {
  id: string;
  email?: string;
  username: string;
  role: string;
  credits?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_login?: string;
  email_verified?: boolean;
}

export interface UserMetrics {
  messages_per_day: number;
  total_sessions: number;
  total_messages: number;
  most_used_agent?: string;
  account_age_days: number;
  credit_usage_rate: number;
}

export interface UserFilters {
  role?: string;
  is_active?: boolean;
  search?: string;
  include_deleted?: boolean;
}

interface AdminUserState {
  users: User[];
  selectedUser: User | null;
  userMetrics: UserMetrics | null;
  loading: boolean;
  error: string | null;
  cursor: string | null;
  hasMore: boolean;
  limit: number;
  filters: UserFilters;
  privacyMode: boolean;
  
  // Actions
  loadUsers: (reset?: boolean) => Promise<void>;
  loadUserDetails: (userId: string) => Promise<void>;
  loadUserMetrics: (userId: string) => Promise<void>;
  loadUserChat: (userId: string, reset?: boolean) => Promise<void>;
  loadUserTokens: (userId: string, reset?: boolean) => Promise<void>;
  setFilters: (filters: Partial<UserFilters>) => void;
  setPrivacyMode: (enabled: boolean) => void;
  setLimit: (limit: number) => void;
  updateUserRole: (userId: string, role: string) => Promise<void>;
  updateUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  adjustCredits: (userId: string, amount: number, description: string) => Promise<void>;
  clearSelectedUser: () => void;
}

export const useAdminUserStore = create<AdminUserState>((set, get) => ({
  users: [],
  selectedUser: null,
  userMetrics: null,
  loading: false,
  error: null,
  cursor: null,
  hasMore: false,
  limit: 25,
  filters: {},
  privacyMode: false,

  loadUsers: async (reset = false) => {
    if (reset) {
      set({ users: [], cursor: null, hasMore: false });
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

      if (state.filters.role) {
        params.role = state.filters.role;
      }
      if (state.filters.is_active !== undefined) {
        params.is_active = state.filters.is_active;
      }
      if (state.filters.search) {
        params.search = state.filters.search;
      }
      if (state.filters.include_deleted) {
        params.include_deleted = state.filters.include_deleted;
      }

      const response = await api.get('/admin/users', { params });

      set({
        users: reset
          ? response.data.users
          : [...state.users, ...response.data.users],
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load users',
        loading: false,
      });
    }
  },

  loadUserDetails: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      const state = get();
      const response = await api.get(`/admin/users/${userId}`, {
        params: { privacy_mode: state.privacyMode },
      });

      set({
        selectedUser: response.data.user,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load user details',
        loading: false,
      });
    }
  },

  loadUserMetrics: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      const response = await api.get(`/admin/users/${userId}/metrics`);

      set({
        userMetrics: response.data.metrics,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load user metrics',
        loading: false,
      });
    }
  },

  loadUserChat: async (userId: string, reset = false) => {
    // This will be handled by adminChatStore
    // Placeholder for now
  },

  loadUserTokens: async (userId: string, reset = false) => {
    // This will be handled by adminTokenStore
    // Placeholder for now
  },

  setFilters: (filters: Partial<UserFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    // Reset and reload when filters change
    get().loadUsers(true);
  },

  setPrivacyMode: (enabled: boolean) => {
    set({ privacyMode: enabled });
    // Reload current data with new privacy mode
    const state = get();
    if (state.selectedUser) {
      get().loadUserDetails(state.selectedUser.id);
    }
    get().loadUsers(true);
  },

  setLimit: (limit: number) => {
    set({ limit });
    get().loadUsers(true);
  },

  updateUserRole: async (userId: string, role: string) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { role });
      // Reload users and selected user
      await get().loadUsers(true);
      if (get().selectedUser?.id === userId) {
        await get().loadUserDetails(userId);
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to update user role',
      });
      throw error;
    }
  },

  updateUserStatus: async (userId: string, isActive: boolean) => {
    try {
      await api.patch(`/admin/users/${userId}/status`, { is_active: isActive });
      // Reload users and selected user
      await get().loadUsers(true);
      if (get().selectedUser?.id === userId) {
        await get().loadUserDetails(userId);
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to update user status',
      });
      throw error;
    }
  },

  adjustCredits: async (userId: string, amount: number, description: string) => {
    try {
      await api.post(`/admin/users/${userId}/credits`, {
        amount,
        description,
      });
      // Reload user details to get updated credits
      await get().loadUserDetails(userId);
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to adjust credits',
      });
      throw error;
    }
  },

  clearSelectedUser: () => {
    set({ selectedUser: null, userMetrics: null });
  },
}));
