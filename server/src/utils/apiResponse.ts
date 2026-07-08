import { Response } from 'express';

export const success = (res: Response, data: unknown, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

export const error = (res: Response, message: string, statusCode = 400) => {
  return res.status(statusCode).json({ success: false, message });
};
