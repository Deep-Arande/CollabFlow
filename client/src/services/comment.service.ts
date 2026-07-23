import api from '../config/api';
import type { ApiResponse, Comment } from '../types';

export const commentService = {
  async list(_projectId: string, taskId: string) {
    const res = await api.get<ApiResponse<{ comments: Comment[] }>>(`/tasks/${taskId}/comments`);
    return res.data.data!.comments;
  },

  async create(_projectId: string, taskId: string, content: string) {
    const res = await api.post<ApiResponse<{ comment: Comment }>>(`/tasks/${taskId}/comments`, { content });
    return res.data.data!.comment;
  },

  async update(_projectId: string, taskId: string, commentId: string, content: string) {
    const res = await api.patch<ApiResponse<{ comment: Comment }>>(`/tasks/${taskId}/comments/${commentId}`, { content });
    return res.data.data!.comment;
  },

  async delete(_projectId: string, taskId: string, commentId: string) {
    await api.delete(`/tasks/${taskId}/comments/${commentId}`);
  },
};
