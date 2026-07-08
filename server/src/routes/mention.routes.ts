import { Router } from 'express';
import { getMyMentions } from '../controllers/mention.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/me', authenticate, getMyMentions);

export default router;
