import { ProjectMember } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
      };
      projectMembership?: ProjectMember;
    }
  }
}

export {};
