import { Router } from 'express';
import { getPendingInvites, respondToInvite } from '../controllers/invite.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/pending', getPendingInvites);
router.patch('/:membershipId/respond', respondToInvite);

export default router;
