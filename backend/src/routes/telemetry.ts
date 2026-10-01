import { Router } from 'express';
import { getRecent } from '../controllers/telemetryController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.get('/recent', asyncHandler(getRecent));

export default router;
