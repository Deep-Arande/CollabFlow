import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return api.success(res, { users, total, page: parseInt(page), limit: parseInt(limit) });
});

export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };

  if (!q || q.trim().length < 1) return api.success(res, { users: [] });

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { email: { contains: q.trim(), mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    take: 20,
    orderBy: { name: 'asc' },
  });

  return api.success(res, { users });
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true, role: true, isActive: true, avatarUrl: true, createdAt: true },
  });
  if (!user) return api.error(res, 'User not found', 404);
  return api.success(res, { user });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { name, role } = req.body;

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(role && { role }),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  return api.success(res, { user });
});

export const deactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
    select: { id: true, name: true, email: true, isActive: true },
  });
  return api.success(res, { user }, 'User deactivated');
});
