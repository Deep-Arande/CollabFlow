import api from '../config/api';
import type { ApiResponse, CatchMeUpResult, AssistantAnswer } from '../types';

export const aiService = {
  async catchMeUp(projectId: string, force = false): Promise<CatchMeUpResult> {
    const res = await api.get<ApiResponse<CatchMeUpResult>>(
      `/projects/${projectId}/catch-me-up`,
      { params: force ? { force: 'true' } : undefined },
    );
    return res.data.data!;
  },

  async askAssistant(projectId: string, question: string): Promise<AssistantAnswer> {
    const res = await api.post<ApiResponse<AssistantAnswer>>(
      `/projects/${projectId}/assistant`,
      { question },
    );
    return res.data.data!;
  },
};
