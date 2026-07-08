import { Router } from 'express';
import { getActivity, getAuditLog, getProjectActivity } from '../controllers/activity.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireProjectMember } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getActivity);
router.get('/audit', requireRole('ADMIN'), getAuditLog);
router.get('/project/:projectId', requireProjectMember, getProjectActivity);

export default router;
