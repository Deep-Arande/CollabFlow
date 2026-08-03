import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import { logActivity } from '../utils/activityLogger';

// All invites currently awaiting this user's response.
export const getPendingInvites = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;

  const invites = await prisma.projectMember.findMany({
    where: { userId, status: 'PENDING' },
    include: {
      project: { select: { id: true, name: true, description: true } },
      inviter: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { addedAt: 'desc' },
  });

  return api.success(res, { invites });
});

// Accept or decline an invite. Only the invited user may respond, and only while PENDING.
export const respondToInvite = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const { membershipId } = req.params;
  const { response } = req.body;

  if (!['ACCEPTED', 'DECLINED'].includes(response)) {
    return api.error(res, 'Response must be ACCEPTED or DECLINED', 400);
  }

  const membership = await prisma.projectMember.findUnique({ where: { id: membershipId } });
  if (!membership) return api.error(res, 'Invite not found', 404);
  if (membership.userId !== userId) return api.error(res, 'This invite is not addressed to you', 403);
  if (membership.status !== 'PENDING') return api.error(res, 'This invite has already been answered', 400);

  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.update({
      where: { id: membershipId },
      data: { status: response, respondedAt: new Date() },
    });
    await logActivity(
      {
        projectId: membership.projectId,
        userId,
        action: response === 'ACCEPTED' ? 'INVITE_ACCEPTED' : 'INVITE_DECLINED',
        targetType: 'Project',
        targetId: membership.projectId,
        metadata: {},
      },
      tx,
    );
    return m;
  });

  return api.success(res, { membership: updated }, `Invite ${response.toLowerCase()}`);
});
