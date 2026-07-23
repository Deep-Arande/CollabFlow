import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;

  // Resolve project scope for non-admins
  let memberProjectIds: string[] = [];
  if (role !== 'ADMIN') {
    const memberships = await prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    memberProjectIds = memberships.map((m) => m.projectId);
  }

  // Task scope for aggregate stats
  const taskScopeWhere =
    role === 'ADMIN'
      ? {}
      : role === 'TEAM_LEAD'
      ? { projectId: { in: memberProjectIds } }
      : { assignedTo: userId };

  // Activity scope
  const activityWhere =
    role === 'ADMIN'
      ? {}
      : role === 'TEAM_LEAD'
      ? { projectId: { in: memberProjectIds } }
      : { userId };

  const now = new Date();

  const [totalProjects, activeTasksCount, completedTasksCount, overdueTasksCount, myTasks, recentActivity] =
    await Promise.all([
      prisma.project.count({
        where: role === 'ADMIN' ? {} : { members: { some: { userId } } },
      }),

      prisma.task.count({
        where: { ...taskScopeWhere, status: { not: 'COMPLETED' } },
      }),

      prisma.task.count({
        where: { ...taskScopeWhere, status: 'COMPLETED' },
      }),

      prisma.task.count({
        where: { ...taskScopeWhere, status: { not: 'COMPLETED' }, dueDate: { lt: now } },
      }),

      prisma.task.findMany({
        where: { assignedTo: userId, status: { not: 'COMPLETED' } },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          projectId: true,
          assignedTo: true,
          createdBy: true,
          createdAt: true,
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 10,
      }),

      prisma.activityLog.findMany({
        where: activityWhere,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

  return api.success(res, {
    totalProjects,
    activeTasks: activeTasksCount,
    completedTasks: completedTasksCount,
    overdueTasksCount,
    myTasks,
    recentActivity,
  });
});
