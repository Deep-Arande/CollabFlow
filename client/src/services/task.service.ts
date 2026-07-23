import api from '../config/api';
import type { ApiResponse, Task, TaskStatus, TaskPriority } from '../types';

interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  page?: number;
  limit?: number;
}

export const taskService = {
  async list(projectId: string, filters?: TaskFilters) {
    const res = await api.get<ApiResponse<{ tasks: Task[]; total: number }>>(`/projects/${projectId}/tasks`, { params: filters });
    return res.data.data!;
  },

  async get(projectId: string, taskId: string) {
    const res = await api.get<ApiResponse<{ task: Task }>>(`/projects/${projectId}/tasks/${taskId}`);
    return res.data.data!.task;
  },

  async create(projectId: string, data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: string;
    assignedTo?: string;
  }) {
    const res = await api.post<ApiResponse<{ task: Task }>>(`/projects/${projectId}/tasks`, data);
    return res.data.data!.task;
  },

  async update(projectId: string, taskId: string, data: Partial<{
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string;
    assignedTo: string;
  }>) {
    const res = await api.patch<ApiResponse<{ task: Task }>>(`/projects/${projectId}/tasks/${taskId}`, data);
    return res.data.data!.task;
  },

  async updateStatus(projectId: string, taskId: string, status: TaskStatus) {
    const res = await api.patch<ApiResponse<{ task: Task }>>(`/projects/${projectId}/tasks/${taskId}/status`, { status });
    return res.data.data!.task;
  },

  async delete(projectId: string, taskId: string) {
    await api.delete(`/projects/${projectId}/tasks/${taskId}`);
  },
};
