import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import { logActivity } from '../utils/activityLogger';

export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;

  const projects = await prisma.project.findMany({
    where: role === 'ADMIN' ? {} : { members: { some: { userId } } },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { tasks: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return api.success(res, { projects });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, dueDate } = req.body;
  const { userId } = req.user!;

  if (!name || !dueDate) return api.error(res, 'Name and due date are required', 400);

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: { name, description: description ?? '', dueDate: new Date(dueDate), createdBy: userId },
    });
    await tx.projectMember.create({ data: { projectId: p.id, userId, role: 'LEAD' } });
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
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
      },
      _count: { select: { tasks: true } },
    },
  });
  if (!project) return api.error(res, 'Project not found', 404);
  return api.success(res, { project });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, dueDate } = req.body;
  const { userId, role } = req.user!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);
  if (role !== 'ADMIN' && project.createdBy !== userId) return api.error(res, 'Forbidden', 403);

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
  const { userId, role } = req.user!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);
  if (role !== 'ADMIN' && project.createdBy !== userId) return api.error(res, 'Forbidden', 403);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED' } });
    await logActivity({ projectId, userId, action: 'PROJECT_ARCHIVED', targetType: 'Project', targetId: projectId, metadata: {} }, tx);
    return p;
  });

  return api.success(res, { project: updated });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = req.user!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);
  if (role !== 'ADMIN' && project.createdBy !== userId) return api.error(res, 'Forbidden', 403);

  await prisma.project.delete({ where: { id: projectId } });
  return api.success(res, null, 'Project deleted');
});

export const getProjectMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await prisma.projectMember.findMany({
    where: { projectId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
  });
  return api.success(res, { members });
});

export const addProjectMember = asyncHandler(async (req: Request, res: Response) => {
  const { userId: actorId, role: actorRole } = req.user!;
  const projectId = req.params.id;
  const { userId, role: memberRole = 'MEMBER' } = req.body;

  if (!userId) return api.error(res, 'userId is required', 400);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);
  if (actorRole !== 'ADMIN' && project.createdBy !== actorId) return api.error(res, 'Forbidden', 403);

  const exists = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (exists) return api.error(res, 'User is already a member', 409);

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.create({ data: { projectId, userId, role: memberRole } });
    await logActivity({ projectId, userId: actorId, action: 'MEMBER_ADDED', targetType: 'Project', targetId: projectId, metadata: { addedUserId: userId } }, tx);
    return m;
  });

  return api.success(res, { member }, 'Member added', 201);
});

export const removeProjectMember = asyncHandler(async (req: Request, res: Response) => {
  const { userId: actorId, role: actorRole } = req.user!;
  const projectId = req.params.id;
  const { userId } = req.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return api.error(res, 'Project not found', 404);
  if (actorRole !== 'ADMIN' && project.createdBy !== actorId) return api.error(res, 'Forbidden', 403);
  if (project.createdBy === userId) return api.error(res, 'Cannot remove the project owner', 400);

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    await logActivity({ projectId, userId: actorId, action: 'MEMBER_REMOVED', targetType: 'Project', targetId: projectId, metadata: { removedUserId: userId } }, tx);
  });

  return api.success(res, null, 'Member removed');
});
