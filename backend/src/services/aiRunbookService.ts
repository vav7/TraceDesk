import { pool } from '../config/db';
import { HttpError } from '../middleware/httpError';
import { diagnoseFailure } from './diagnosisEngine';
import { bus } from './eventBus';

/**
 * AI-assisted runbook generation (optional, zero-budget).
 *
 * Works with any OpenAI-compatible chat completions API that offers a
 * free tier — Groq (default), Google Gemini's OpenAI-compatible endpoint,
 * OpenRouter free models, or a local Ollama server:
 *
 *   AI_API_KEY=your-free-key
 *   AI_BASE_URL=https://api.groq.com/openai/v1   (default)
 *   AI_MODEL=llama-3.1-8b-instant                (default)
 *
 * When AI_API_KEY is not set the feature reports `configured: false` and
 * the deterministic rules-engine runbook remains the default everywhere.
 */
const REQUEST_TIMEOUT_MS = 20_000;

export interface AiStatus {
  configured: boolean;
  model: string | null;
  provider: string | null;
}

export function getAiStatus(): AiStatus {
  const configured = Boolean(process.env.AI_API_KEY?.trim());
  if (!configured) return { configured: false, model: null, provider: null };
  const base = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1';
  let provider: string | null = null;
  try { provider = new URL(base).host; } catch { provider = base; }
  return { configured: true, model: process.env.AI_MODEL || 'llama-3.1-8b-instant', provider };
}

interface RunbookFields {
  problem: string;
  symptoms: string;
  likely_cause: string;
  verification: string;
  resolution: string;
  workaround: string;
  prevention: string;
}

const SYSTEM_PROMPT = `You are a staff-level product support engineer writing an internal runbook.
Use ONLY the incident data provided. Be concrete, calm and operational.
Respond with STRICT JSON (no markdown fences) with exactly these keys:
problem, symptoms, likely_cause, verification, resolution, workaround, prevention.
Each value: 1-3 sentences, plain text, no bullet characters.`;

export async function generateAiRunbook(incidentId: number): Promise<Record<string, unknown>> {
  const status = getAiStatus();
  if (!status.configured) {
    throw new HttpError(503, 'AI runbook generation is not configured. Set AI_API_KEY (a free Groq or Gemini key works) on the backend to enable it.');
  }

  const incidentResult = await pool.query(
    `SELECT i.*, ig.name AS integration_name
     FROM incidents i
     JOIN integrations ig ON i.integration_id = ig.id
     WHERE i.id = $1`,
    [incidentId],
  );
  const incident = incidentResult.rows[0];
  if (!incident) throw new HttpError(404, 'Incident not found');

  const evidenceResult = await pool.query(
    'SELECT * FROM evidence WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 10',
    [incidentId],
  );
  const firstEvidence = evidenceResult.rows[0]?.content ? safeParse(evidenceResult.rows[0].content) : null;
  const statusCode = Number(firstEvidence?.status ?? 0);
  const diagnosis = diagnoseFailure(statusCode);

  const context = {
    incident: {
      id: incident.id,
      title: incident.title,
      integration: incident.integration_name,
      severity: incident.severity,
      status: incident.status,
      customer_impact: incident.customer_impact,
      rules_engine_diagnosis: { ...diagnosis, http_status: statusCode },
      resolution: incident.resolution,
    },
    evidence: evidenceResult.rows.map((row) => safeParse(row.content)),
  };

  const completion = await callChatCompletions(status.model as string, context);
  const fields = extractRunbookFields(completion, incident, diagnosis);

  const title = `Runbook (AI): ${incident.title}`;
  const result = await pool.query(
    `INSERT INTO runbooks (incident_id, title, problem, symptoms, likely_cause, verification, resolution, workaround, prevention, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ai')
     ON CONFLICT (incident_id) DO UPDATE SET
       title = EXCLUDED.title,
       problem = EXCLUDED.problem,
       symptoms = EXCLUDED.symptoms,
       likely_cause = EXCLUDED.likely_cause,
       verification = EXCLUDED.verification,
       resolution = EXCLUDED.resolution,
       workaround = EXCLUDED.workaround,
       prevention = EXCLUDED.prevention,
       generated_by = 'ai'
     RETURNING *`,
    [incidentId, title, fields.problem, fields.symptoms, fields.likely_cause, fields.verification, fields.resolution, fields.workaround, fields.prevention],
  );

  bus.publish('runbook:created', { id: result.rows[0].id, title, generatedBy: 'ai' });
  return result.rows[0];
}

async function callChatCompletions(model: string, context: unknown): Promise<string> {
  const base = (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Incident data:\n${JSON.stringify(context, null, 2)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new HttpError(502, `AI provider returned ${response.status}: ${detail}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, 'AI provider returned an empty completion');
    return content;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'AI provider request timed out after 20s');
    }
    throw new HttpError(502, `AI provider request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  } finally {
    clearTimeout(timer);
  }
}

function extractRunbookFields(
  completion: string,
  incident: Record<string, unknown>,
  diagnosis: ReturnType<typeof diagnoseFailure>,
): RunbookFields {
  const fallback: RunbookFields = {
    problem: String(incident.probable_root_cause ?? diagnosis.probableCause),
    symptoms: `HTTP errors or timeouts observed from ${incident.integration_name}.`,
    likely_cause: diagnosis.probableCause,
    verification: `Reproduce in the Troubleshooting Lab and confirm the status code in telemetry.`,
    resolution: String(incident.resolution ?? 'Pending resolution.'),
    workaround: 'Temporarily disable the integration or route traffic to a fallback.',
    prevention: `Add monitoring and alerting for ${incident.integration_name}.`,
  };
  try {
    // Models occasionally wrap JSON in code fences despite instructions.
    const cleaned = completion.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<RunbookFields>;
    const merged = { ...fallback };
    for (const key of Object.keys(fallback) as Array<keyof RunbookFields>) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) merged[key] = value.trim().slice(0, 2000);
    }
    return merged;
  } catch {
    return fallback;
  }
}

function safeParse(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { raw: content };
  }
}
