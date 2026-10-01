import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getAll } from '../controllers/integrationController';
import { runSimulation, SCENARIOS } from '../services/simulationService';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/httpError';

const router = Router();

// Abuse protection for the simulation endpoint (demo-safe defaults).
const simulateLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.SIMULATE_RATE_LIMIT) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many simulations. Slow down (rate limit is per minute).' },
});

const simulateSchema = z.object({
  scenario: z.enum(SCENARIOS as [string, ...string[]]),
  url: z.string().max(2048).optional(),
  method: z.string().max(10).optional(),
  headers: z.record(z.string(), z.string().max(500)).optional(),
});

router.get('/', asyncHandler(getAll));

router.post('/:slug/simulate', simulateLimiter, asyncHandler(async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }

  const { scenario, url, method, headers } = parsed.data;
  const result = await runSimulation(req.params.slug, scenario as typeof SCENARIOS[number], { url, method, headers });
  res.json(result);
}));

export default router;
