import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

// Reports are scoped to the projects the user LEADs (accepted memberships).
const getScopedProjectIds = async (userId: string): Promise<string[]> => {
  const memberships = await prisma.projectMember.findMany({
    where: { userId, role: 'LEAD', status: 'ACCEPTED' },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
};

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const { projectId } = req.query as { projectId?: string };

  const projectIds = await getScopedProjectIds(userId);
  if (projectId && !projectIds.includes(projectId)) {
    return api.error(res, 'You do not have report access to this project', 403);
  }
  const taskWhere = {
    ...(projectId ? { projectId } : { projectId: { in: projectIds } }),
  };

  const now = new Date();

  const [total, completed, inProgress, delayed, byPriority, completedLast7Days] = await Promise.all([
    prisma.task.count({ where: taskWhere }),

    prisma.task.count({ where: { ...taskWhere, status: 'COMPLETED' } }),

    prisma.task.count({ where: { ...taskWhere, status: 'IN_PROGRESS' } }),

    prisma.task.count({ where: { ...taskWhere, dueDate: { lt: now }, status: { not: 'COMPLETED' } } }),

    prisma.task.groupBy({ by: ['priority'], where: taskWhere, _count: { priority: true } }),

    prisma.task.findMany({
      where: { ...taskWhere, status: 'COMPLETED', updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { updatedAt: true },
    }),
  ]);

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const dailyCompleted: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyCompleted[d.toISOString().split('T')[0]] = 0;
  }
  completedLast7Days.forEach((t) => {
    const day = t.updatedAt.toISOString().split('T')[0];
    if (dailyCompleted[day] !== undefined) dailyCompleted[day]++;
  });

  return api.success(res, {
    total,
    completed,
    inProgress,
    delayed,
    completionRate,
    byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count.priority])),
    dailyCompleted,
  });
});

export const getTeamPerformance = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const { projectId } = req.query as { projectId?: string };

  const projectIds = await getScopedProjectIds(userId);
  if (projectId && !projectIds.includes(projectId)) {
    return api.error(res, 'You do not have report access to this project', 403);
  }
  const taskWhere = {
    ...(projectId ? { projectId } : { projectId: { in: projectIds } }),
    assignedTo: { not: null },
  };

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    select: { assignedTo: true, status: true, assignee: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const memberMap: Record<string, { id: string; name: string; avatarUrl: string | null; total: number; completed: number; inProgress: number }> = {};

  tasks.forEach((t) => {
    if (!t.assignedTo || !t.assignee) return;
    if (!memberMap[t.assignedTo]) {
      memberMap[t.assignedTo] = { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl, total: 0, completed: 0, inProgress: 0 };
    }
    memberMap[t.assignedTo].total++;
    if (t.status === 'COMPLETED') memberMap[t.assignedTo].completed++;
    if (t.status === 'IN_PROGRESS') memberMap[t.assignedTo].inProgress++;
  });

  const performance = Object.values(memberMap).map((m) => ({
    ...m,
    completionRate: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0,
  }));

  return api.success(res, { performance });
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  // Returns full report data as JSON. Frontend uses this to generate PDF or similar.
  const { userId } = req.user!;
  const { projectId } = req.query as { projectId?: string };

  const projectIds = await getScopedProjectIds(userId);
  if (projectId && !projectIds.includes(projectId)) {
    return api.error(res, 'You do not have report access to this project', 403);
  }
  const scopedProjectIds = projectId ? [projectId] : projectIds;
  const taskWhere = { projectId: { in: scopedProjectIds } };

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      include: {
        assignee: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.findMany({
      where: { id: { in: scopedProjectIds } },
      include: { _count: { select: { tasks: true, members: true } } },
    }),
  ]);

  return api.success(res, { tasks, projects, generatedAt: new Date().toISOString() });
});
