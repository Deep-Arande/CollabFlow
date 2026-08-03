import { Router } from 'express';
import { getActivity, getAuditLog, getProjectActivity } from '../controllers/activity.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectMember } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getActivity); // scoped to the user's led projects in the controller
router.get('/audit', getAuditLog); // scoped to the user's led projects in the controller
router.get('/project/:projectId', requireProjectMember, getProjectActivity);

export default router;
