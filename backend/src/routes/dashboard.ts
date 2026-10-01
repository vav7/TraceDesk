import { Router } from 'express';
import { stats, recentIncidents, timeline, integrationHealth } from '../controllers/dashboardController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.get('/stats', asyncHandler(stats));
router.get('/incidents', asyncHandler(recentIncidents));
router.get('/timeline', asyncHandler(timeline));
router.get('/health', asyncHandler(integrationHealth));

export default router;
