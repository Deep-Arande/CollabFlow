import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { FileType, AttachmentScope } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import * as storage from '../services/storage.service';
import { logActivity } from '../utils/activityLogger';
import { extractText } from '../utils/extractText';
import { indexAttachment } from '../services/documentIndexer';

const mimeToFileType = (mime: string): FileType => {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'IMAGE';
  return 'DOCX';
};

const uploaderSelect = { uploader: { select: { id: true, name: true } } };

// Shared upload pipeline for both task- and project-scoped attachments:
//   store file -> extract text -> create row (+ activity log) -> fire-and-forget embedding.
// Returns the created attachment (with uploader).
async function createAttachmentRecord(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  projectId: string;
  taskId: string | null;
  scope: AttachmentScope;
  userId: string;
  storagePrefix: string;
}) {
  const fileType = mimeToFileType(opts.mimeType);
  const ext = opts.originalName.split('.').pop();
  const filePath = `${opts.storagePrefix}/${randomUUID()}.${ext}`;

  const storedPath = await storage.uploadFile(opts.buffer, filePath, opts.mimeType);

  // Extract text synchronously so extractedText is set on the row; failures return null.
  const extractedText = await extractText(opts.buffer, fileType);

  const attachment = await prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: {
        taskId: opts.taskId,
        projectId: opts.projectId,
        uploadedBy: opts.userId,
        filePath: storedPath,
        fileType,
        fileName: opts.originalName,
        extractedText,
        scope: opts.scope,
      },
      include: uploaderSelect,
    });
    await logActivity(
      {
        projectId: opts.projectId,
        userId: opts.userId,
        action: 'ATTACHMENT_UPLOADED',
        targetType: 'Attachment',
        targetId: a.id,
        metadata: { fileName: opts.originalName, scope: opts.scope, taskId: opts.taskId },
      },
      tx,
    );
    return a;
  });

  // Embedding pipeline runs in the background — do not block the upload response.
  if (extractedText) {
    void indexAttachment(attachment.id, opts.projectId, extractedText);
  }

  return attachment;
}

// --------------------------------------------------------------------------
// Task-scoped attachments (existing routes under /tasks/:taskId/attachments)
// --------------------------------------------------------------------------

export const uploadAttachment = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { userId } = req.user!;

  if (!req.file) return api.error(res, 'No file provided', 400);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return api.error(res, 'Task not found', 404);

  const membership = await prisma.projectMember.findFirst({
    where: { projectId: task.projectId, userId, status: 'ACCEPTED' },
  });
  if (!membership) return api.error(res, 'Not a member of this project', 403);

  const attachment = await createAttachmentRecord({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    projectId: task.projectId,
    taskId,
    scope: 'TASK',
    userId,
    storagePrefix: `project-${task.projectId}/task-${taskId}`,
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
    include: uploaderSelect,
    orderBy: { createdAt: 'desc' },
  });

  return api.success(res, { attachments });
});

export const getSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, id } = req.params;
  const { userId } = req.user!;

  const attachment = await prisma.attachment.findFirst({ where: { id, taskId } });
  if (!attachment) return api.error(res, 'Attachment not found', 404);

  const membership = await prisma.projectMember.findFirst({
    where: { projectId: attachment.projectId, userId, status: 'ACCEPTED' },
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
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: attachment.projectId, userId, status: 'ACCEPTED' },
    });
    canDelete = membership?.role === 'LEAD';
  }
  if (!canDelete) return api.error(res, 'Only the uploader or a project lead can delete this file', 403);

  await storage.deleteFile(attachment.filePath);
  await prisma.attachment.delete({ where: { id } });

  return api.success(res, null, 'Attachment deleted');
});

// --------------------------------------------------------------------------
// Project-scoped documents (new routes under /projects/:projectId/attachments)
// RBAC is enforced by requireProjectMember middleware on these routes.
// --------------------------------------------------------------------------

export const uploadProjectAttachment = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { userId } = req.user!;

  if (!req.file) return api.error(res, 'No file provided', 400);

  const attachment = await createAttachmentRecord({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    projectId,
    taskId: null,
    scope: 'PROJECT',
    userId,
    storagePrefix: `project-${projectId}/docs`,
  });

  return api.success(res, { attachment }, 'File uploaded', 201);
});

export const listProjectAttachments = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;

  const attachments = await prisma.attachment.findMany({
    where: { projectId, scope: 'PROJECT' },
    include: uploaderSelect,
    orderBy: { createdAt: 'desc' },
  });

  return api.success(res, { attachments });
});

export const getProjectAttachmentSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;

  const attachment = await prisma.attachment.findFirst({
    where: { id, projectId, scope: 'PROJECT' },
  });
  if (!attachment) return api.error(res, 'Attachment not found', 404);

  const signedUrl = await storage.getSignedUrl(attachment.filePath);
  return api.success(res, { signedUrl, expiresIn: 120 });
});

export const deleteProjectAttachment = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;
  const { userId } = req.user!;

  const attachment = await prisma.attachment.findFirst({
    where: { id, projectId, scope: 'PROJECT' },
  });
  if (!attachment) return api.error(res, 'Attachment not found', 404);

  // Uploader or a project LEAD (membership is already verified ACCEPTED by middleware).
  const canDelete =
    attachment.uploadedBy === userId || req.projectMembership?.role === 'LEAD';
  if (!canDelete) return api.error(res, 'Only the uploader or a project lead can delete this file', 403);

  await storage.deleteFile(attachment.filePath);
  await prisma.attachment.delete({ where: { id } });

  return api.success(res, null, 'Attachment deleted');
});
