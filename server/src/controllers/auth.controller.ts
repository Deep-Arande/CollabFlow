import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../services/prisma.service';
import { signToken } from '../services/token.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return api.error(res, 'Name, email, and password are required', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return api.error(res, 'Email already in use', 409);

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: role || 'TEAM_MEMBER' },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const token = signToken(user.id, user.role);
  return api.success(res, { user, token }, 'Registered successfully', 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return api.error(res, 'Email and password are required', 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return api.error(res, 'Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return api.error(res, 'Invalid credentials', 401);

  const token = signToken(user.id, user.role);
  return api.success(res, {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    token,
  });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Client discards the token. Stateless JWT — no server-side invalidation needed.
  return api.success(res, null, 'Logged out');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, createdAt: true },
  });
  if (!user) return api.error(res, 'User not found', 404);
  return api.success(res, { user });
});
