import { Request, Response } from 'express';
import { Server } from 'socket.io';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import { logActivity } from '../utils/activityLogger';
import { parseMentions } from '../utils/parseMentions';

export const listComments = asyncHandler(async (req: Request, res: Response) => {
  const comments = await prisma.comment.findMany({
    where: { taskId: req.params.taskId },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return api.success(res, { comments });
});

export const createComment = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { userId } = req.user!;
  const { content } = req.body;
  const io: Server = req.app.get('io');

  if (!content?.trim()) return api.error(res, 'Content is required', 400);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return api.error(res, 'Task not found', 404);

  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId: task.projectId },
    include: { user: { select: { name: true } } },
  });

  const mentionedUserIds = parseMentions(content, projectMembers);

  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: {
        taskId,
        authorId: userId,
        content,
        ...(mentionedUserIds.length && {
          mentions: { create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId })) },
        }),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
      },
    });
    await logActivity({ projectId: task.projectId, userId, action: 'COMMENT_ADDED', targetType: 'Comment', targetId: c.id, metadata: { taskId } }, tx);
    return c;
  });

  io.to(`project:${task.projectId}`).emit('comment:new', { comment, taskId });

  return api.success(res, { comment }, 'Comment added', 201);
});

export const updateComment = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, id } = req.params;
  const { userId, role } = req.user!;
  const { content } = req.body;

  if (!content?.trim()) return api.error(res, 'Content is required', 400);

  const comment = await prisma.comment.findFirst({ where: { id, taskId } });
  if (!comment) return api.error(res, 'Comment not found', 404);
  if (comment.authorId !== userId && role === 'TEAM_MEMBER') {
    return api.error(res, 'Forbidden', 403);
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId: task!.projectId },
    include: { user: { select: { name: true } } },
  });

  const mentionedUserIds = parseMentions(content, projectMembers);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.commentMention.deleteMany({ where: { commentId: id } });
    return tx.comment.update({
      where: { id },
      data: {
        content,
        ...(mentionedUserIds.length && {
          mentions: { create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId })) },
        }),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
      },
    });
  });

  return api.success(res, { comment: updated });
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, id } = req.params;
  const { userId, role } = req.user!;

  const comment = await prisma.comment.findFirst({ where: { id, taskId } });
  if (!comment) return api.error(res, 'Comment not found', 404);

  const isAuthor = comment.authorId === userId;
  const canDelete = isAuthor || role === 'ADMIN' || role === 'TEAM_LEAD';
  if (!canDelete) return api.error(res, 'Forbidden', 403);

  await prisma.comment.delete({ where: { id } });
  return api.success(res, null, 'Comment deleted');
});
