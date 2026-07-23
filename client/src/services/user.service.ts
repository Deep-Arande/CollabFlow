import api from '../config/api';
import type { ApiResponse, User } from '../types';

export const userService = {
  async list(params?: { page?: number; limit?: number; role?: string; search?: string }) {
    const res = await api.get<ApiResponse<{ users: User[]; total: number }>>('/users', { params });
    return res.data.data!;
  },

  async search(query?: string) {
    const res = await api.get<ApiResponse<{ users: User[] }>>('/users/search', {
      params: query ? { q: query } : {},
    });
    return res.data.data?.users ?? [];
  },

  async get(id: string) {
    const res = await api.get<ApiResponse<{ user: User }>>(`/users/${id}`);
    return res.data.data!.user;
  },

  async update(id: string, data: Partial<{ name: string; avatarUrl: string }>) {
    const res = await api.patch<ApiResponse<{ user: User }>>(`/users/${id}`, data);
    return res.data.data!.user;
  },

  async updateRole(id: string, role: string) {
    const res = await api.patch<ApiResponse<{ user: User }>>(`/users/${id}/role`, { role });
    return res.data.data!.user;
  },

  async deactivate(id: string) {
    const res = await api.patch<ApiResponse<{ user: User }>>(`/users/${id}/deactivate`);
    return res.data.data!.user;
  },
};
