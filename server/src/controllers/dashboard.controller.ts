import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;

  // Scope everything to the projects the user is an accepted member of.
  const memberships = await prisma.projectMember.findMany({
    where: { userId, status: 'ACCEPTED' },
    select: { projectId: true },
  });
  const memberProjectIds = memberships.map((m) => m.projectId);

  const taskScopeWhere = { projectId: { in: memberProjectIds } };
  const activityWhere = { projectId: { in: memberProjectIds } };

  const now = new Date();

  const [totalProjects, activeTasksCount, completedTasksCount, overdueTasksCount, myTasks, recentActivity] =
    await Promise.all([
      prisma.project.count({
        where: { members: { some: { userId, status: 'ACCEPTED' } } },
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
