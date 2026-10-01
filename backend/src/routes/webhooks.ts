import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/httpError';
import { recordTelemetry } from '../services/telemetryService';
import { createIncidentFromFailure } from '../services/incidentService';
import { classifyError } from '../services/errorClassifier';
import { bus } from '../services/eventBus';

const router = Router();

// Abuse protection for the public listener.
const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.WEBHOOK_RATE_LIMIT) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook deliveries. Slow down (rate limit is per minute).' },
});

/**
 * Optional shared-secret authentication: when WEBHOOK_SECRET is set, callers
 * must present it via `X-Webhook-Secret: <secret>` or `Authorization: Bearer <secret>`.
 * (Production-grade alternatives: HMAC signatures like Slack/GitHub use.)
 */
function assertWebhookAuth(headerSecret: string | undefined, authorization: string | undefined): void {
  const expected = process.env.WEBHOOK_SECRET?.trim();
  if (!expected) return; // open demo mode
  const bearer = (authorization || '').replace(/^Bearer\s+/i, '');
  if (headerSecret !== expected && bearer !== expected) {
    throw new HttpError(401, 'Invalid or missing webhook secret (set X-Webhook-Secret or Authorization: Bearer).');
  }
}

interface WebhookFields {
  status: number;
  event: string;
  message: string;
}

/**
 * Best-effort extraction from arbitrary webhook payloads. Real tools send
 * wildly different shapes, so we look for the common conventions:
 *   status:  `status` | `status_code` | `code`      (default: 500)
 *   event:   `event`  | `type`      | `event_type`  (default: 'webhook')
 *   message: `error`  | `message`   | `text`        (default: raw JSON)
 */
function extractFields(payload: unknown): WebhookFields {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const rawStatus = body.status ?? body.status_code ?? body.code;
  const status = typeof rawStatus === 'number' && rawStatus >= 0 && rawStatus <= 599
    ? Math.round(rawStatus)
    : 500;
  const event = String(body.event ?? body.type ?? body.event_type ?? 'webhook').slice(0, 100);
  const message = String(
    body.error ?? body.message ?? body.text ?? JSON.stringify(payload) ?? 'Webhook received',
  ).slice(0, 2000);
  return { status, event, message };
}

/**
 * Public webhook listener: `POST /api/webhooks/:slug`
 * External tools (monitoring, CI, real SaaS providers, or a curl command
 * in an interview) can push events here. Each delivery is recorded as
 * telemetry with a request ID, and failures auto-create incidents with
 * the raw payload attached as evidence — marked `source: 'webhook'`.
 */
router.post('/:slug', webhookLimiter, asyncHandler(async (req, res) => {
  const { slug } = req.params;
  assertWebhookAuth(req.header('x-webhook-secret'), req.header('authorization'));

  const integrationResult = await pool.query('SELECT id, name FROM integrations WHERE slug = $1', [slug]);
  const integration = integrationResult.rows[0];
  if (!integration) {
    throw new HttpError(404, `No integration with slug '${slug}' is configured`);
  }

  const { status, event, message } = extractFields(req.body);
  const startedAt = Date.now();

  const requestId = await recordTelemetry({
    integrationId: integration.id,
    method: 'POST',
    endpoint: `/webhooks/${slug}`,
    status,
    latencyMs: Date.now() - startedAt,
    errorType: status >= 400 || status === 0 ? classifyError(status) : undefined,
    responseSummary: message.slice(0, 200),
    retryCount: 0,
  });

  bus.publish('webhook:received', {
    requestId,
    integration: integration.name,
    slug,
    event,
    status,
    timestamp: new Date().toISOString(),
  });

  let incident = null;
  if (status >= 400 || status === 0) {
    incident = await createIncidentFromFailure({
      integrationId: integration.id,
      integrationName: integration.name,
      scenario: `webhook:${event}`,
      status,
      errorType: classifyError(status),
      requestId,
      latency: Date.now() - startedAt,
      endpoint: `/webhooks/${slug}`,
      method: 'POST',
      responseBody: message,
      responseHeaders: { 'x-tracedesk-source': 'webhook' },
      retryCount: 0,
      source: 'webhook' as const,
      target: 'webhook listener',
      targetUrl: `/api/webhooks/${slug}`,
    });
  }

  res.status(202).json({
    received: true,
    requestId,
    event,
    status,
    incident: incident ? { id: incident.id, title: incident.title, severity: incident.severity } : null,
  });
}));

export default router;
