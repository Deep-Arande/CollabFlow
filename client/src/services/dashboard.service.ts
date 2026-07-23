import api from '../config/api';
import type { ApiResponse, DashboardStats } from '../types';

export const dashboardService = {
  async getStats() {
    const res = await api.get<ApiResponse<DashboardStats>>('/dashboard/stats');
    return res.data.data!;
  },
};
