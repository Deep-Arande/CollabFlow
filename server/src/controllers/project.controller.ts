import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import { logActivity } from '../utils/activityLogger';

const memberUserSelect = { id: true, name: true, email: true, avatarUrl: true };

export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId, status: 'ACCEPTED' } } },
    include: {
      creator: { select: { id: true, name: true } },
      members: { where: { userId }, select: { role: true } },
      _count: { select: { tasks: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Surface the caller's own project-scoped role so the client can tell LEAD from MEMBER
  // without fetching the full member list per project.
  const withRole = projects.map(({ members, ...p }) => ({ ...p, myRole: members[0]?.role ?? null }));

  return api.success(res, { projects: withRole });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, dueDate } = req.body;
  const { userId } = req.user!;

  if (!name || !dueDate) return api.error(res, 'Name and due date are required', 400);

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: { name, description: description ?? '', dueDate: new Date(dueDate), createdBy: userId },
    });
    await tx.projectMember.create({
      data: { projectId: p.id, userId, role: 'LEAD', status: 'ACCEPTED', invitedBy: userId, respondedAt: new Date() },
    });
    await logActivity({ projectId: p.id, userId, action: 'PROJECT_CREATED', targetType: 'Project', targetId: p.id, metadata: { name } }, tx);
    return p;
  });

  return api.success(res, { project }, 'Project created', 201);
});

export const getProjectById = asyncHandler(async (req: Request, res: Response) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      creator: { select: { id: true, name: true } },
      members: {
        include: { user: { select: memberUserSelect }, inviter: { select: { id: true, name: true } } },
      },
      _count: { select: { tasks: true } },
    },
  });
  if (!project) return api.error(res, 'Project not found', 404);
  return api.success(res, { project });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, dueDate } = req.body;
  const { userId } = req.user!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
      },
    });
    await logActivity({ projectId, userId, action: 'PROJECT_UPDATED', targetType: 'Project', targetId: projectId, metadata: { name, description, dueDate } }, tx);
    return p;
  });

  return api.success(res, { project: updated });
});

export const archiveProject = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED' } });
    await logActivity({ projectId, userId, action: 'PROJECT_ARCHIVED', targetType: 'Project', targetId: projectId, metadata: {} }, tx);
    return p;
  });

  return api.success(res, { project: updated });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);

  await prisma.project.delete({ where: { id: projectId } });
  return api.success(res, null, 'Project deleted');
});

export const getProjectMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await prisma.projectMember.findMany({
    where: { projectId: req.params.id },
    include: { user: { select: memberUserSelect }, inviter: { select: { id: true, name: true } } },
    orderBy: { addedAt: 'asc' },
  });
  return api.success(res, { members });
});

// Invite a user to the project. Creates a PENDING membership (no instant access).
// Re-inviting a previously DECLINED user resets that same row back to PENDING.
export const addProjectMember = asyncHandler(async (req: Request, res: Response) => {
  const { userId: actorId } = req.user!;
  const projectId = req.params.id;
  const { userId, role: memberRole = 'MEMBER' } = req.body;

  if (!userId) return api.error(res, 'userId is required', 400);
  if (!['LEAD', 'MEMBER'].includes(memberRole)) return api.error(res, 'Role must be LEAD or MEMBER', 400);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return api.error(res, 'User not found', 404);

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  if (existing) {
    if (existing.status === 'ACCEPTED') return api.error(res, 'User is already a member', 409);
    if (existing.status === 'PENDING') return api.error(res, 'An invite is already pending for this user', 409);
    // DECLINED → reset to a fresh pending invite on the same row.
  }

  const member = await prisma.$transaction(async (tx) => {
    const m = existing
      ? await tx.projectMember.update({
          where: { projectId_userId: { projectId, userId } },
          data: { role: memberRole, status: 'PENDING', invitedBy: actorId, addedAt: new Date(), respondedAt: null },
          include: { user: { select: memberUserSelect } },
        })
      : await tx.projectMember.create({
          data: { projectId, userId, role: memberRole, status: 'PENDING', invitedBy: actorId },
          include: { user: { select: memberUserSelect } },
        });
    await logActivity({ projectId, userId: actorId, action: 'MEMBER_INVITED', targetType: 'Project', targetId: projectId, metadata: { invitedUserId: userId } }, tx);
    return m;
  });

  return api.success(res, { member }, 'Invite sent', 201);
});

export const updateProjectMemberRole = asyncHandler(async (req: Request, res: Response) => {
  const { userId: actorId } = req.user!;
  const { id: projectId, userId } = req.params;
  const { role: newRole } = req.body;

  if (!['LEAD', 'MEMBER'].includes(newRole)) return api.error(res, 'Role must be LEAD or MEMBER', 400);
  if (actorId === userId) return api.error(res, 'Cannot change your own project role', 400);

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.status !== 'ACCEPTED') {
    return api.error(res, 'That user is not an active member of this project', 404);
  }

  const member = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role: newRole },
    include: { user: { select: memberUserSelect } },
  });

  return api.success(res, { member });
});

// Lead removes another member. Also unassigns that user's tasks in the project.
export const removeProjectMember = asyncHandler(async (req: Request, res: Response) => {
  const { userId: actorId } = req.user!;
  const projectId = req.params.id;
  const { userId } = req.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);

  if (userId === actorId) return api.error(res, 'Use "Leave project" to remove yourself', 400);
  if (project.createdBy === userId) return api.error(res, 'Cannot remove the project owner', 400);

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    await tx.task.updateMany({ where: { projectId, assignedTo: userId }, data: { assignedTo: null } });
    await logActivity({ projectId, userId: actorId, action: 'MEMBER_REMOVED', targetType: 'Project', targetId: projectId, metadata: { removedUserId: userId } }, tx);
  });

  return api.success(res, null, 'Member removed');
});

// Any member can leave voluntarily. The sole remaining Lead is blocked from leaving.
export const leaveProject = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const projectId = req.params.id;
  const membership = req.projectMembership!;

  if (membership.role === 'LEAD') {
    const leadCount = await prisma.projectMember.count({
      where: { projectId, role: 'LEAD', status: 'ACCEPTED' },
    });
    if (leadCount <= 1) {
      return api.error(res, "You're the only Lead on this project. Promote another member to Lead before leaving.", 400);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    await tx.task.updateMany({ where: { projectId, assignedTo: userId }, data: { assignedTo: null } });
    await logActivity({ projectId, userId, action: 'MEMBER_LEFT', targetType: 'Project', targetId: projectId, metadata: {} }, tx);
  });

  return api.success(res, null, 'You have left the project');
});
