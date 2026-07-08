import { Role, ProjectMember } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: Role;
      };
      projectMembership?: ProjectMember;
    }
  }
}

export {};
