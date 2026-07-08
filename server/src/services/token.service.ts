import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '@prisma/client';

interface TokenPayload {
  userId: string;
  role: Role;
}

export const signToken = (userId: string, role: Role): string => {
  return jwt.sign({ userId, role }, env.JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};
