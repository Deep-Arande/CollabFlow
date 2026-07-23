import api from '../config/api';
import type { ApiResponse, User } from '../types';

interface AuthResponse {
  token: string;
  user: User;
}

export const authService = {
  async login(email: string, password: string) {
    const res = await api.post<ApiResponse<AuthResponse>>('/auth/login', { email, password });
    return res.data.data!;
  },

  async register(name: string, email: string, password: string) {
    const res = await api.post<ApiResponse<AuthResponse>>('/auth/register', { name, email, password });
    return res.data.data!;
  },

  async getMe() {
    const res = await api.get<ApiResponse<{ user: User }>>('/auth/me');
    return res.data.data!.user;
  },
};
