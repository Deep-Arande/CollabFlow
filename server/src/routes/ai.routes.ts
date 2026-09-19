import { Router } from 'express';
import { catchMeUp, askProjectAssistant } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectMember } from '../middleware/rbac.middleware';

// Mounted under /projects. Both routes require an ACCEPTED membership.
const router = Router();

router.use(authenticate);

router.get('/:projectId/catch-me-up', requireProjectMember, catchMeUp);
router.post('/:projectId/assistant', requireProjectMember, askProjectAssistant);

export default router;
