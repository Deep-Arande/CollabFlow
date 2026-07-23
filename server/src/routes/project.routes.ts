import { Router } from 'express';
import {
  listProjects,
  createProject,
  getProjectById,
  updateProject,
  archiveProject,
  deleteProject,
  getProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
} from '../controllers/project.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireProjectMember } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', listProjects);
router.post('/', requireRole('ADMIN', 'TEAM_LEAD'), createProject);

router.get('/:id', requireProjectMember, getProjectById);
router.patch('/:id', requireProjectMember, updateProject);
router.patch('/:id/archive', requireProjectMember, archiveProject);
router.delete('/:id', requireProjectMember, deleteProject);

router.get('/:id/members', requireProjectMember, getProjectMembers);
router.post('/:id/members', requireProjectMember, addProjectMember);
router.patch('/:id/members/:userId', requireProjectMember, updateProjectMemberRole);
router.delete('/:id/members/:userId', requireProjectMember, removeProjectMember);

export default router;
