import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

// Resolves the project id from whichever route param carries it.
const resolveProjectId = (req: Request): string | undefined =>
  req.params.projectId ?? req.params.id;

// Verifies the current user is an ACCEPTED member of the project.
// Attaches req.projectMembership (incl. project-scoped role) for downstream use.
export const requireProjectMember = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.user!;
  const projectId = resolveProjectId(req);

  if (!projectId) {
    api.error(res, 'Project not specified', 400);
    return;
  }

  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId, status: 'ACCEPTED' },
  });

  if (!membership) {
    api.error(res, 'Not a member of this project', 403);
    return;
  }

  req.projectMembership = membership;
  next();
});

// Requires an ACCEPTED membership whose project-scoped role is LEAD.
export const requireProjectLead = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.user!;
  const projectId = resolveProjectId(req);

  if (!projectId) {
    api.error(res, 'Project not specified', 400);
    return;
  }

  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId, status: 'ACCEPTED' },
  });

  if (!membership) {
    api.error(res, 'Not a member of this project', 403);
    return;
  }

  if (membership.role !== 'LEAD') {
    api.error(res, 'Only project leads can perform this action', 403);
    return;
  }

  req.projectMembership = membership;
  next();
});
