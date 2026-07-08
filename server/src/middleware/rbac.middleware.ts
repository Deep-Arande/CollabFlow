import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

// Blocks anyone whose role is not in the allowed list.
export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      api.error(res, 'Forbidden', 403);
      return;
    }
    next();
  };
};

// Verifies the current user is a member of the project (or Admin).
// Attaches req.projectMembership for downstream use.
export const requireProjectMember = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { userId, role } = req.user!;

  if (role === 'ADMIN') return next();

  const projectId = req.params.projectId ?? req.params.id;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  if (!membership) {
    api.error(res, 'You are not a member of this project', 403);
    return;
  }

  req.projectMembership = membership;
  next();
});
