import api from '../config/api';
import type { ApiResponse, Attachment } from '../types';

export const attachmentService = {
  async list(taskId: string): Promise<Attachment[]> {
    const res = await api.get<ApiResponse<{ attachments: Attachment[] }>>(`/tasks/${taskId}/attachments`);
    return res.data.data?.attachments ?? [];
  },

  async upload(taskId: string, file: File): Promise<Attachment> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<ApiResponse<{ attachment: Attachment }>>(
      `/tasks/${taskId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data.data!.attachment;
  },

  async getSignedUrl(taskId: string, attachmentId: string): Promise<string> {
    const res = await api.get<ApiResponse<{ signedUrl: string }>>(
      `/tasks/${taskId}/attachments/${attachmentId}/url`,
    );
    return res.data.data!.signedUrl;
  },

  async delete(taskId: string, attachmentId: string): Promise<void> {
    await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
  },
};
