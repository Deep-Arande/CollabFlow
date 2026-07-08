import { PrismaClient } from '@prisma/client';
import { prisma } from '../services/prisma.service';

interface LogParams {
  projectId?: string;
  userId: string;
  action: string;
  targetType: 'Task' | 'Project' | 'Comment' | 'User' | 'Attachment';
  targetId: string;
  metadata?: Record<string, unknown>;
}

// Pass a Prisma transaction client (tx) when inside $transaction to keep the log atomic with the action.
export const logActivity = (params: LogParams, tx?: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
  const client = tx ?? prisma;
  return client.activityLog.create({
    data: {
      projectId: params.projectId ?? null,
      userId: params.userId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ?? {},
    },
  });
};
