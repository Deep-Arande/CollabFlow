import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

// Used by the invite flow to find existing users to invite.
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
    select: { id: true, name: true, email: true, avatarUrl: true },
    take: 20,
    orderBy: { name: 'asc' },
  });

  return api.success(res, { users });
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
  });
  if (!user) return api.error(res, 'User not found', 404);
  return api.success(res, { user });
});

// Self profile update (name / avatar only). No account-level role exists anymore.
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  if (req.params.id !== userId) return api.error(res, 'You can only update your own profile', 403);

  const { name, avatarUrl } = req.body;

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  return api.success(res, { user });
});
