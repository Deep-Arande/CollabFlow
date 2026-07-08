import { Request, Response } from 'express';
import { Server } from 'socket.io';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import { logActivity } from '../utils/activityLogger';

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { status, priority, assignedTo, search } = req.query as Record<string, string>;

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      ...(status && { status: status as never }),
      ...(priority && { priority: priority as never }),
      ...(assignedTo && { assignedTo }),
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
    },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, name: true } },
      labels: { include: { label: true } },
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return api.success(res, { tasks });
});

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { userId } = req.user!;
  const { title, description, priority, status, dueDate, assignedTo, labelIds } = req.body;
  const io: Server = req.app.get('io');

  if (!title) return api.error(res, 'Title is required', 400);

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        projectId,
        title,
        description: description ?? '',
        priority: priority ?? 'MEDIUM',
        status: status ?? 'TODO',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedTo: assignedTo ?? null,
        createdBy: userId,
        ...(labelIds?.length && {
          labels: { create: (labelIds as string[]).map((labelId) => ({ labelId })) },
        }),
      },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { include: { label: true } },
      },
    });
    await logActivity({ projectId, userId, action: 'TASK_CREATED', targetType: 'Task', targetId: t.id, metadata: { title } }, tx);
    return t;
  });

  io.to(`project:${projectId}`).emit('task:created', { task });
  if (assignedTo) {
    io.to(`project:${projectId}`).emit('task:assigned', { taskId: task.id, assignedTo });
  }

  return api.success(res, { task }, 'Task created', 201);
});

export const getTaskById = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;

  const task = await prisma.task.findFirst({
    where: { id, projectId },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, name: true } },
      labels: { include: { label: true } },
      comments: {
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
      attachments: {
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!task) return api.error(res, 'Task not found', 404);
  return api.success(res, { task });
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;
  const { userId } = req.user!;
  const { title, description, priority, dueDate, assignedTo, labelIds } = req.body;
  const io: Server = req.app.get('io');

  const existing = await prisma.task.findFirst({ where: { id, projectId } });
  if (!existing) return api.error(res, 'Task not found', 404);

  const task = await prisma.$transaction(async (tx) => {
    if (labelIds !== undefined) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } });
      if (labelIds.length > 0) {
        await tx.taskLabel.createMany({ data: (labelIds as string[]).map((labelId) => ({ taskId: id, labelId })) });
      }
    }

    const t = await tx.task.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(priority && { priority }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(assignedTo !== undefined && { assignedTo: assignedTo || null }),
      },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { include: { label: true } },
      },
    });

    await logActivity({ projectId, userId, action: 'TASK_UPDATED', targetType: 'Task', targetId: id, metadata: { title, priority, assignedTo } }, tx);
    return t;
  });

  if (assignedTo && assignedTo !== existing.assignedTo) {
    io.to(`project:${projectId}`).emit('task:assigned', { taskId: id, assignedTo });
  }

  return api.success(res, { task });
});

export const updateTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;
  const { userId, role } = req.user!;
  const { status } = req.body;
  const io: Server = req.app.get('io');

  if (!status) return api.error(res, 'Status is required', 400);

  const existing = await prisma.task.findFirst({ where: { id, projectId } });
  if (!existing) return api.error(res, 'Task not found', 404);

  if (role === 'TEAM_MEMBER' && existing.assignedTo !== userId) {
    return api.error(res, 'You can only update status of tasks assigned to you', 403);
  }

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({ where: { id }, data: { status } });
    await logActivity({
      projectId,
      userId,
      action: 'TASK_STATUS_CHANGED',
      targetType: 'Task',
      targetId: id,
      metadata: { from: existing.status, to: status },
    }, tx);
    return t;
  });

  io.to(`project:${projectId}`).emit('task:status_changed', { taskId: id, status, projectId });

  return api.success(res, { task });
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;
  const { userId } = req.user!;

  const task = await prisma.task.findFirst({ where: { id, projectId } });
  if (!task) return api.error(res, 'Task not found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id } });
    await logActivity({ projectId, userId, action: 'TASK_DELETED', targetType: 'Task', targetId: id, metadata: { title: task.title } }, tx);
  });

  return api.success(res, null, 'Task deleted');
});
