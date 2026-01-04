import { create } from 'zustand';
import { api } from '../../utils/api';

export interface AuditLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_type?: string;
  target_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  admin_username?: string;
}

export interface AuditFilters {
  admin_id?: string;
  action_type?: string;
  date_from?: string;
  date_to?: string;
}

interface AdminAuditState {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
  cursor: string | null;
  hasMore: boolean;
  limit: number;
  filters: AuditFilters;

  // Actions
  loadLogs: (reset?: boolean) => Promise<void>;
  setFilters: (filters: Partial<AuditFilters>) => void;
  setLimit: (limit: number) => void;
}

export const useAdminAuditStore = create<AdminAuditState>((set, get) => ({
  logs: [],
  loading: false,
  error: null,
  cursor: null,
  hasMore: false,
  limit: 25,
  filters: {},

  loadLogs: async (reset = false) => {
    if (reset) {
      set({ logs: [], cursor: null, hasMore: false });
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

      if (state.filters.admin_id) {
        params.admin_id = state.filters.admin_id;
      }
      if (state.filters.action_type) {
        params.action_type = state.filters.action_type;
      }
      if (state.filters.date_from) {
        params.date_from = state.filters.date_from;
      }
      if (state.filters.date_to) {
        params.date_to = state.filters.date_to;
      }

      const response = await api.get('/admin/audit/logs', { params });

      set({
        logs: reset
          ? response.data.logs
          : [...state.logs, ...response.data.logs],
        cursor: response.data.next_cursor,
        hasMore: response.data.has_more,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to load audit logs',
        loading: false,
      });
    }
  },

  setFilters: (filters: Partial<AuditFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    // Reset and reload when filters change
    get().loadLogs(true);
  },

  setLimit: (limit: number) => {
    set({ limit });
    get().loadLogs(true);
  },
}));
