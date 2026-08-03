import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { FileType } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import * as storage from '../services/storage.service';
import { logActivity } from '../utils/activityLogger';

const mimeToFileType = (mime: string): FileType => {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'IMAGE';
  return 'DOCX';
};

export const uploadAttachment = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { userId } = req.user!;

  if (!req.file) return api.error(res, 'No file provided', 400);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return api.error(res, 'Task not found', 404);

  const membership = await prisma.projectMember.findFirst({
    where: { projectId: task.projectId, userId, status: 'ACCEPTED' },
  });
  if (!membership) {
    return api.error(res, 'Not a member of this project', 403);
  }

  const ext = req.file.originalname.split('.').pop();
  const filePath = `project-${task.projectId}/task-${taskId}/${randomUUID()}.${ext}`;

  const storedPath = await storage.uploadFile(req.file.buffer, filePath, req.file.mimetype);

  const attachment = await prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: {
        taskId,
        uploadedBy: userId,
        filePath: storedPath,
        fileType: mimeToFileType(req.file!.mimetype),
        fileName: req.file!.originalname,
      },
      include: { uploader: { select: { id: true, name: true } } },
    });
    await logActivity({ projectId: task.projectId, userId, action: 'ATTACHMENT_UPLOADED', targetType: 'Attachment', targetId: a.id, metadata: { fileName: req.file!.originalname, taskId } }, tx);
    return a;
  });

  return api.success(res, { attachment }, 'File uploaded', 201);
});

export const listAttachments = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { userId } = req.user!;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return api.error(res, 'Task not found', 404);

  const membership = await prisma.projectMember.findFirst({
    where: { projectId: task.projectId, userId, status: 'ACCEPTED' },
  });
  if (!membership) return api.error(res, 'Not a member of this project', 403);

  const attachments = await prisma.attachment.findMany({
    where: { taskId },
    include: { uploader: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return api.success(res, { attachments });
});

export const getSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, id } = req.params;
  const { userId } = req.user!;

  const attachment = await prisma.attachment.findFirst({ where: { id, taskId } });
  if (!attachment) return api.error(res, 'Attachment not found', 404);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const membership = await prisma.projectMember.findFirst({
    where: { projectId: task!.projectId, userId, status: 'ACCEPTED' },
  });
  if (!membership) return api.error(res, 'Not a member of this project', 403);

  const signedUrl = await storage.getSignedUrl(attachment.filePath);
  return api.success(res, { signedUrl, expiresIn: 120 });
});

export const deleteAttachment = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, id } = req.params;
  const { userId } = req.user!;

  const attachment = await prisma.attachment.findFirst({ where: { id, taskId } });
  if (!attachment) return api.error(res, 'Attachment not found', 404);

  let canDelete = attachment.uploadedBy === userId;
  if (!canDelete) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (task) {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: task.projectId, userId, status: 'ACCEPTED' },
      });
      canDelete = membership?.role === 'LEAD';
    }
  }
  if (!canDelete) return api.error(res, 'Only the uploader or a project lead can delete this file', 403);

  await storage.deleteFile(attachment.filePath);
  await prisma.attachment.delete({ where: { id } });

  return api.success(res, null, 'Attachment deleted');
});
