import api from '../config/api';
import type { ApiResponse, ActivityLog } from '../types';

export const activityService = {
  async listForProject(projectId: string, params?: { page?: number; limit?: number }) {
    const res = await api.get<ApiResponse<{ logs: ActivityLog[]; total: number }>>(`/projects/${projectId}/activity`, { params });
    return res.data.data!;
  },
};
