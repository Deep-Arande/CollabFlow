import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;

  // Determine project scope based on role
  let projectIdFilter: string[] | undefined;
  if (role === 'TEAM_LEAD') {
    const led = await prisma.projectMember.findMany({ where: { userId, role: 'LEAD' }, select: { projectId: true } });
    projectIdFilter = led.map((m) => m.projectId);
  } else if (role === 'TEAM_MEMBER') {
    const memberships = await prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } });
    projectIdFilter = memberships.map((m) => m.projectId);
  }

  const taskWhere =
    role === 'ADMIN'
      ? {}
      : role === 'TEAM_LEAD'
      ? { projectId: { in: projectIdFilter } }
      : { assignedTo: userId };

  const [taskStats, upcomingDeadlines, recentActivity, projects] = await Promise.all([
    prisma.task.groupBy({
      by: ['status'],
      where: taskWhere,
      _count: { status: true },
    }),

    prisma.task.findMany({
      where: { ...taskWhere, dueDate: { gte: new Date() }, status: { not: 'COMPLETED' } },
      select: { id: true, title: true, dueDate: true, priority: true, projectId: true, assignee: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),

    prisma.activityLog.findMany({
      where:
        role === 'ADMIN'
          ? {}
          : role === 'TEAM_LEAD'
          ? { projectId: { in: projectIdFilter } }
          : { userId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    prisma.project.findMany({
      where:
        role === 'ADMIN'
          ? {}
          : { members: { some: { userId } } },
      include: {
        _count: { select: { tasks: true } },
        tasks: { where: { status: 'COMPLETED' }, select: { id: true } },
      },
      take: role === 'TEAM_MEMBER' ? undefined : 10,
    }),
  ]);

  const taskStatusMap = Object.fromEntries(taskStats.map((s) => [s.status, s._count.status]));

  const projectProgress = projects.map((p) => ({
    id: p.id,
    name: p.name,
    totalTasks: p._count.tasks,
    completedTasks: p.tasks.length,
    progress: p._count.tasks > 0 ? Math.round((p.tasks.length / p._count.tasks) * 100) : 0,
  }));

  return api.success(res, {
    taskStats: {
      todo: taskStatusMap['TODO'] ?? 0,
      inProgress: taskStatusMap['IN_PROGRESS'] ?? 0,
      review: taskStatusMap['REVIEW'] ?? 0,
      completed: taskStatusMap['COMPLETED'] ?? 0,
    },
    upcomingDeadlines,
    recentActivity,
    projectProgress,
  });
});
