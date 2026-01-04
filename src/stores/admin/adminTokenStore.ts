import { create } from 'zustand';
import { api } from '../../utils/api';

export interface Token {
  token?: string;
  token_masked: string;
  user_id: string;
  expires_at: string;
  created_at?: string;
  token_type: 'refresh' | 'email_verification' | 'password_reset';
  username?: string;
  email?: string;
  used?: boolean;
}

export interface TokenFilters {
  user_id?: string;
  token_type?: string;
  active_only?: boolean;
  expired_only?: boolean;
}

interface AdminTokenState {
  tokens: Token[];
  selectedToken: Token | null;
  loading: boolean;
  error: string | null;
  cursor: string | null;
  hasMore: boolean;
  limit: number;
  filters: TokenFilters;

  // Actions
  loadTokens: (reset?: boolean) => Promise<void>;
  loadUserTokens: (userId: string, reset?: boolean) => Promise<void>;
  revokeToken: (tokenId: string) => Promise<void>;
  revokeUserTokens: (userId: string, criteria?: Partial<TokenFilters>) => Promise<void>;
  setFilters: (filters: Partial<TokenFilters>) => void;
  setLimit: (limit: number) => void;
  clearSelectedToken: () => void;
}

export const useAdminTokenStore = create<AdminTokenState>((set, get) => ({
  tokens: [],
  selectedToken: null,
  loading: false,
  error: null,
  cursor: null,
  hasMore: false,
  limit: 25,
  filters: {},

  loadTokens: async (reset = false) => {
    if (reset) {
      set({ tokens: [], cursor: null, hasMore: false });
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
      if (state.filters.token_type) {
        params.token_type = state.filters.token_type;
      }
      if (state.filters.active_only) {
        params.active_only = state.filters.active_only;
      }
      if (state.filters.expired_only) {
        params.expired_only = state.filters.expired_only;
      }

      const response = await api.get('/admin/tokens', { params });

      set({
        tokens: reset
          ? response.data.tokens
          : [...state.tokens, ...response.data.tokens],
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load tokens',
        loading: false,
      });
    }
  },

  loadUserTokens: async (userId: string, reset = false) => {
    if (reset) {
      set({ tokens: [], cursor: null, hasMore: false });
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

      if (state.filters.token_type) {
        params.token_type = state.filters.token_type;
      }
      if (state.filters.active_only) {
        params.active_only = state.filters.active_only;
      }

      const response = await api.get(`/admin/users/${userId}/tokens`, { params });

      set({
        tokens: reset
          ? response.data.tokens
          : [...state.tokens, ...response.data.tokens],
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load user tokens',
        loading: false,
      });
    }
  },

  revokeToken: async (tokenId: string) => {
    try {
      await api.delete(`/admin/tokens/${tokenId}`);
      // Remove from list
      set((state) => ({
        tokens: state.tokens.filter((t) => t.token !== tokenId),
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to revoke token',
      });
      throw error;
    }
  },

  revokeUserTokens: async (userId: string, criteria?: Partial<TokenFilters>) => {
    try {
      const params: any = {};
      if (criteria?.token_type) {
        params.token_type = criteria.token_type;
      }

      await api.delete(`/admin/tokens/user/${userId}`, { params });
      // Reload tokens
      await get().loadUserTokens(userId, true);
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to revoke user tokens',
      });
      throw error;
    }
  },

  setFilters: (filters: Partial<TokenFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    // Reset and reload when filters change
    get().loadTokens(true);
  },

  setLimit: (limit: number) => {
    set({ limit });
    get().loadTokens(true);
  },

  clearSelectedToken: () => {
    set({ selectedToken: null });
  },
}));
