import api from '../config/api';
import type { ApiResponse, Label } from '../types';

export const labelService = {
  async list() {
    const res = await api.get<ApiResponse<{ labels: Label[] }>>('/labels');
    return res.data.data?.labels ?? [];
  },

  async create(data: { name: string; color: string }) {
    const res = await api.post<ApiResponse<{ label: Label }>>('/labels', data);
    return res.data.data!.label;
  },

  async delete(id: string) {
    await api.delete(`/labels/${id}`);
  },
};
