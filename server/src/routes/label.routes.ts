import { Router } from 'express';
import { listLabels, createLabel, updateLabel, deleteLabel } from '../controllers/label.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectMember } from '../middleware/rbac.middleware';

const router = Router();

// Labels are project-scoped; any accepted member can manage them (Trello-style).
router.use('/:projectId/labels', authenticate, requireProjectMember);

router.get('/:projectId/labels', listLabels);
router.post('/:projectId/labels', createLabel);
router.patch('/:projectId/labels/:id', updateLabel);
router.delete('/:projectId/labels/:id', deleteLabel);

export default router;
