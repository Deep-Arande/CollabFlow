import { Router } from 'express';
import { listLabels, createLabel, updateLabel, deleteLabel } from '../controllers/label.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', listLabels);
router.post('/', requireRole('ADMIN', 'TEAM_LEAD'), createLabel);
router.patch('/:id', requireRole('ADMIN', 'TEAM_LEAD'), updateLabel);
router.delete('/:id', requireRole('ADMIN'), deleteLabel);

export default router;
