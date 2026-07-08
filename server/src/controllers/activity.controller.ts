import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const getActivity = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;
  const { page = '1', limit = '30' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let projectIds: string[] | undefined;
  if (role === 'TEAM_LEAD') {
    const led = await prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } });
    projectIds = led.map((m) => m.projectId);
  }

  const where =
    role === 'ADMIN'
      ? {}
      : role === 'TEAM_LEAD'
      ? { projectId: { in: projectIds } }
      : { userId };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.activityLog.count({ where }),
  ]);

  return api.success(res, { logs, total, page: parseInt(page), limit: parseInt(limit) });
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.activityLog.count(),
  ]);

  return api.success(res, { logs, total, page: parseInt(page), limit: parseInt(limit) });
});

export const getProjectActivity = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { page = '1', limit = '30' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.activityLog.count({ where: { projectId } }),
  ]);

  return api.success(res, { logs, total, page: parseInt(page), limit: parseInt(limit) });
});
