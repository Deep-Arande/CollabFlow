import api from '../config/api';
import type { ApiResponse, Project, ProjectMember } from '../types';

export const projectService = {
  async list(params?: { page?: number; limit?: number; status?: string }) {
    const res = await api.get<ApiResponse<{ projects: Project[]; total: number; page: number; limit: number }>>('/projects', { params });
    return res.data.data!;
  },

  async get(id: string) {
    const res = await api.get<ApiResponse<{ project: Project }>>(`/projects/${id}`);
    return res.data.data!.project;
  },

  async create(data: { name: string; description?: string; dueDate: string }) {
    const res = await api.post<ApiResponse<{ project: Project }>>('/projects', data);
    return res.data.data!.project;
  },

  async update(id: string, data: Partial<{ name: string; description: string; dueDate: string; status: string }>) {
    const res = await api.patch<ApiResponse<{ project: Project }>>(`/projects/${id}`, data);
    return res.data.data!.project;
  },

  async delete(id: string) {
    await api.delete(`/projects/${id}`);
  },

  async getMembers(id: string) {
    const res = await api.get<ApiResponse<{ members: ProjectMember[] }>>(`/projects/${id}/members`);
    return res.data.data!.members;
  },

  async addMember(id: string, data: { userId: string; role?: string }) {
    const res = await api.post<ApiResponse<{ member: ProjectMember }>>(`/projects/${id}/members`, data);
    return res.data.data!.member;
  },

  async removeMember(id: string, userId: string) {
    await api.delete(`/projects/${id}/members/${userId}`);
  },

  async updateMemberRole(id: string, userId: string, role: string) {
    const res = await api.patch<ApiResponse<{ member: ProjectMember }>>(`/projects/${id}/members/${userId}`, { role });
    return res.data.data!.member;
  },
};
