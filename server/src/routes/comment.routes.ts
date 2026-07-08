import { Router } from 'express';
import { listComments, createComment, updateComment, deleteComment } from '../controllers/comment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/:taskId/comments', listComments);
router.post('/:taskId/comments', createComment);
router.patch('/:taskId/comments/:id', updateComment);
router.delete('/:taskId/comments/:id', deleteComment);

export default router;
