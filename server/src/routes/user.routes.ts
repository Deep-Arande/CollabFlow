import { Router } from 'express';
import { listUsers, searchUsers, getUserById, updateUser, deactivateUser } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('ADMIN'), listUsers);
router.get('/search', requireRole('ADMIN', 'TEAM_LEAD'), searchUsers);
router.get('/:id', requireRole('ADMIN'), getUserById);
router.patch('/:id', requireRole('ADMIN'), updateUser);
router.patch('/:id/deactivate', requireRole('ADMIN'), deactivateUser);

export default router;
