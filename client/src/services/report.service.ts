import api from '../config/api';
import type { ApiResponse, Task, Project } from '../types';

export interface ReportOverview {
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  completionRate: number;
  byPriority: Record<string, number>;
  dailyCompleted: Record<string, number>;
}

export interface TeamPerformanceEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  total: number;
  completed: number;
  inProgress: number;
  completionRate: number;
}

export interface ReportExport {
  tasks: Task[];
  projects: Project[];
  generatedAt: string;
}

export const reportService = {
  async getOverview(projectId?: string) {
    const res = await api.get<ApiResponse<ReportOverview>>('/reports/overview', {
      params: projectId ? { projectId } : undefined,
    });
    return res.data.data!;
  },

  async getTeamPerformance(projectId?: string) {
    const res = await api.get<ApiResponse<{ performance: TeamPerformanceEntry[] }>>('/reports/team-performance', {
      params: projectId ? { projectId } : undefined,
    });
    return res.data.data!.performance;
  },

  async exportReport(projectId?: string) {
    const res = await api.get<ApiResponse<ReportExport>>('/reports/export', {
      params: projectId ? { projectId } : undefined,
    });
    return res.data.data!;
  },
};
