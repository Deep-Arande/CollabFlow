import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';

export const listLabels = asyncHandler(async (req: Request, res: Response) => {
  const labels = await prisma.label.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { name: 'asc' },
  });
  return api.success(res, { labels });
});

export const createLabel = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { name, color } = req.body;
  if (!name || !color) return api.error(res, 'Name and color are required', 400);

  const label = await prisma.label.create({ data: { name, color, projectId } });
  return api.success(res, { label }, 'Label created', 201);
});

export const updateLabel = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;
  const { name, color } = req.body;

  const existing = await prisma.label.findFirst({ where: { id, projectId } });
  if (!existing) return api.error(res, 'Label not found', 404);

  const label = await prisma.label.update({
    where: { id },
    data: { ...(name && { name }), ...(color && { color }) },
  });
  return api.success(res, { label });
});

export const deleteLabel = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, id } = req.params;

  const existing = await prisma.label.findFirst({ where: { id, projectId } });
  if (!existing) return api.error(res, 'Label not found', 404);

  await prisma.label.delete({ where: { id } });
  return api.success(res, null, 'Label deleted');
});
