import { Router } from 'express';
import { getAll, getById } from '../controllers/runbookController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.get('/', asyncHandler(getAll));
router.get('/:id', asyncHandler(getById));

export default router;
