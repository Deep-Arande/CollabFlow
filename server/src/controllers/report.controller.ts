import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

const getScopedProjectIds = async (userId: string, role: string): Promise<string[] | undefined> => {
  if (role === 'ADMIN') return undefined;
  const memberships = await prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } });
  return memberships.map((m) => m.projectId);
};

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;
  const { projectId } = req.query as { projectId?: string };

  const projectIds = await getScopedProjectIds(userId, role);
  const taskWhere = {
    ...(projectId ? { projectId } : projectIds ? { projectId: { in: projectIds } } : {}),
  };

  const now = new Date();

  const [total, completed, delayed, byPriority, completedLast7Days] = await Promise.all([
    prisma.task.count({ where: taskWhere }),

    prisma.task.count({ where: { ...taskWhere, status: 'COMPLETED' } }),

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
    delayed,
    completionRate,
    byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count.priority])),
    dailyCompleted,
  });
});

export const getTeamPerformance = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;
  const { projectId } = req.query as { projectId?: string };

  const projectIds = await getScopedProjectIds(userId, role);
  const taskWhere = {
    ...(projectId ? { projectId } : projectIds ? { projectId: { in: projectIds } } : {}),
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
  // Returns full report data as JSON. Frontend uses this to generate PDF via jsPDF or similar.
  const { userId, role } = req.user!;
  const { projectId } = req.query as { projectId?: string };

  const projectIds = await getScopedProjectIds(userId, role);
  const taskWhere = {
    ...(projectId ? { projectId } : projectIds ? { projectId: { in: projectIds } } : {}),
  };

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
      where: projectIds ? { id: { in: projectIds } } : {},
      include: { _count: { select: { tasks: true, members: true } } },
    }),
  ]);

  return api.success(res, { tasks, projects, generatedAt: new Date().toISOString() });
});
