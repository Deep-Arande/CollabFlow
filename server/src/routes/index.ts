import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import projectRoutes from './project.routes';
import taskRoutes from './task.routes';
import commentRoutes from './comment.routes';
import attachmentRoutes from './attachment.routes';
import mentionRoutes from './mention.routes';
import labelRoutes from './label.routes';
import dashboardRoutes from './dashboard.routes';
import activityRoutes from './activity.routes';
import reportRoutes from './report.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/projects', taskRoutes);       // /projects/:projectId/tasks
router.use('/tasks', commentRoutes);       // /tasks/:taskId/comments
router.use('/tasks', attachmentRoutes);    // /tasks/:taskId/attachments
router.use('/mentions', mentionRoutes);
router.use('/labels', labelRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/activity', activityRoutes);
router.use('/reports', reportRoutes);

export default router;
