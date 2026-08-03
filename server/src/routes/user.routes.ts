import { Router } from 'express';
import { searchUsers, getUserById, updateUser } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/search', searchUsers);
router.get('/:id', getUserById);
router.patch('/:id', updateUser);

export default router;
