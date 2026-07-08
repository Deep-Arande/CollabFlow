import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/token.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const authenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    api.error(res, 'Unauthorized', 401);
    return;
  }

  const token = header.split(' ')[1];

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    api.error(res, 'Invalid or expired token', 401);
  }
});
