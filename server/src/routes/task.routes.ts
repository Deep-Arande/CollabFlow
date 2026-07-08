import { Router } from 'express';
import {
  listTasks,
  createTask,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireProjectMember } from '../middleware/rbac.middleware';

const router = Router();

router.use('/:projectId/tasks', authenticate, requireProjectMember);

router.get('/:projectId/tasks', listTasks);
router.post('/:projectId/tasks', requireRole('ADMIN', 'TEAM_LEAD'), createTask);
router.get('/:projectId/tasks/:id', getTaskById);
router.patch('/:projectId/tasks/:id', requireRole('ADMIN', 'TEAM_LEAD'), updateTask);
router.patch('/:projectId/tasks/:id/status', updateTaskStatus);
router.delete('/:projectId/tasks/:id', requireRole('ADMIN', 'TEAM_LEAD'), deleteTask);

export default router;
