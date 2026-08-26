import api from '../config/api';
import type { ApiResponse, Mention } from '../types';

export const mentionService = {
  async getMine() {
    const res = await api.get<ApiResponse<{ mentions: Mention[] }>>('/mentions/me');
    return res.data.data?.mentions ?? [];
  },
};
