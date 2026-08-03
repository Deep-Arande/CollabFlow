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
import inviteRoutes from './invite.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/invites', inviteRoutes);
router.use('/projects', projectRoutes);
router.use('/projects', taskRoutes);       // /projects/:projectId/tasks
router.use('/projects', labelRoutes);      // /projects/:projectId/labels
router.use('/tasks', commentRoutes);       // /tasks/:taskId/comments
router.use('/tasks', attachmentRoutes);    // /tasks/:taskId/attachments
router.use('/mentions', mentionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/activity', activityRoutes);
router.use('/reports', reportRoutes);

export default router;
