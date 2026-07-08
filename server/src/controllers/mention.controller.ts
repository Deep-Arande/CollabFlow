import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const getMyMentions = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;

  const mentions = await prisma.commentMention.findMany({
    where: { mentionedUserId: userId },
    include: {
      comment: {
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          task: { select: { id: true, title: true, projectId: true } },
        },
      },
    },
    orderBy: { comment: { createdAt: 'desc' } },
    take: 50,
  });

  return api.success(res, { mentions });
});
