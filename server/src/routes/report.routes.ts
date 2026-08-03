import { Router } from 'express';
import { getOverview, getTeamPerformance, exportReport } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate); // data is scoped to the user's led projects in the controller

router.get('/overview', getOverview);
router.get('/team-performance', getTeamPerformance);
router.get('/export', exportReport);

export default router;
