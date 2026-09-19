import { Router } from 'express';
import {
  uploadProjectAttachment,
  listProjectAttachments,
  getProjectAttachmentSignedUrl,
  deleteProjectAttachment,
} from '../controllers/attachment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectMember } from '../middleware/rbac.middleware';
import { upload } from '../middleware/upload.middleware';

// Project-scoped documents: /projects/:projectId/attachments
// Any ACCEPTED member can upload/list/view; uploader or LEAD can delete.
const router = Router();

router.use(authenticate);

router.get('/:projectId/attachments', requireProjectMember, listProjectAttachments);
router.post('/:projectId/attachments', requireProjectMember, upload.single('file'), uploadProjectAttachment);
router.get('/:projectId/attachments/:id/url', requireProjectMember, getProjectAttachmentSignedUrl);
router.delete('/:projectId/attachments/:id', requireProjectMember, deleteProjectAttachment);

export default router;
