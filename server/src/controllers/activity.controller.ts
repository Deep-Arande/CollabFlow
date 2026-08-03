import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const getActivity = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const { page = '1', limit = '30' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Scope to activity in the projects the user LEADs.
  const led = await prisma.projectMember.findMany({
    where: { userId, role: 'LEAD', status: 'ACCEPTED' },
    select: { projectId: true },
  });
  const where = { projectId: { in: led.map((m) => m.projectId) } };

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
  const { userId } = req.user!;
  const { page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Audit is scoped to the projects the user LEADs.
  const led = await prisma.projectMember.findMany({
    where: { userId, role: 'LEAD', status: 'ACCEPTED' },
    select: { projectId: true },
  });
  const where = { projectId: { in: led.map((m) => m.projectId) } };

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
