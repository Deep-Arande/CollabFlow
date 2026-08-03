import api from '../config/api';
import type { ApiResponse, Label } from '../types';

// Labels are project-scoped; any accepted member can manage them.
export const labelService = {
  async list(projectId: string) {
    const res = await api.get<ApiResponse<{ labels: Label[] }>>(`/projects/${projectId}/labels`);
    return res.data.data?.labels ?? [];
  },

  async create(projectId: string, data: { name: string; color: string }) {
    const res = await api.post<ApiResponse<{ label: Label }>>(`/projects/${projectId}/labels`, data);
    return res.data.data!.label;
  },

  async update(projectId: string, id: string, data: { name?: string; color?: string }) {
    const res = await api.patch<ApiResponse<{ label: Label }>>(`/projects/${projectId}/labels/${id}`, data);
    return res.data.data!.label;
  },

  async delete(projectId: string, id: string) {
    await api.delete(`/projects/${projectId}/labels/${id}`);
  },
};
