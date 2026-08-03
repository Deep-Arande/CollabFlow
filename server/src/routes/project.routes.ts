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
  leaveProject,
} from '../controllers/project.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectMember, requireProjectLead } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', listProjects);
router.post('/', createProject); // any authenticated user can create a project

router.get('/:id', requireProjectMember, getProjectById);
router.patch('/:id', requireProjectLead, updateProject);
router.patch('/:id/archive', requireProjectLead, archiveProject);
router.delete('/:id', requireProjectLead, deleteProject);

router.post('/:id/leave', requireProjectMember, leaveProject);

router.get('/:id/members', requireProjectMember, getProjectMembers);
router.post('/:id/members', requireProjectLead, addProjectMember);
router.patch('/:id/members/:userId', requireProjectLead, updateProjectMemberRole);
router.delete('/:id/members/:userId', requireProjectLead, removeProjectMember);

export default router;
