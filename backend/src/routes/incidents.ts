import { Router } from 'express';
import { getAll, getById, resolve, setStatus, addNote } from '../controllers/incidentController';
import { generateEscalationReport } from '../services/escalationService';
import { createRunbookFromIncident } from '../services/runbookService';
import { generateAiRunbook } from '../services/aiRunbookService';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/httpError';
import { z } from 'zod';

const statusSchema = z.object({ status: z.enum(['open', 'investigating', 'resolved']) });
const noteSchema = z.object({ text: z.string().min(1).max(2000) });
const runbookSchema = z.object({ generator: z.enum(['ai', 'deterministic']).optional() });

const router = Router();

router.get('/', asyncHandler(getAll));
router.get('/:id', asyncHandler(getById));
router.post('/:id/resolve', asyncHandler(resolve));
router.post('/:id/status', asyncHandler(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Body must be { status: "open" | "investigating" | "resolved" }');
  req.body = parsed.data;
  return setStatus(req, res);
}));
router.post('/:id/notes', asyncHandler(async (req, res) => {
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Body must be { text: string (1..2000 chars) }');
  req.body = parsed.data;
  return addNote(req, res);
}));

router.get('/:id/escalation-report', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const report = await generateEscalationReport(id);
  res.json({ markdown: report });
}));

router.post('/:id/runbook', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const parsedBody = runbookSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) throw new HttpError(400, "Body must be {} or { generator: 'ai' | 'deterministic' }");
  const generator = parsedBody.data.generator;
  // AI mode works on open incidents too (draft runbooks during response);
  // the deterministic engine remains resolved-only by design.
  const runbook = generator === 'ai'
    ? await generateAiRunbook(id)
    : await createRunbookFromIncident(id);
  res.json(runbook);
}));

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'A valid resource ID is required');
  return id;
}

export default router;
