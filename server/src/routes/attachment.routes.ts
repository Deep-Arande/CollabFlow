import { Router } from 'express';
import { uploadAttachment, listAttachments, getSignedUrl, deleteAttachment } from '../controllers/attachment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.get('/:taskId/attachments', listAttachments);
router.post('/:taskId/attachments', upload.single('file'), uploadAttachment);
router.get('/:taskId/attachments/:id/url', getSignedUrl);
router.delete('/:taskId/attachments/:id', deleteAttachment);

export default router;
