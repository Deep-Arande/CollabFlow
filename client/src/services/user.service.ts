import api from '../config/api';
import type { ApiResponse, User } from '../types';

export const userService = {
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
};
