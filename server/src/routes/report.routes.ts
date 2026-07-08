import { Router } from 'express';
import { getOverview, getTeamPerformance, exportReport } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate, requireRole('ADMIN', 'TEAM_LEAD'));

router.get('/overview', getOverview);
router.get('/team-performance', getTeamPerformance);
router.get('/export', exportReport);

export default router;
