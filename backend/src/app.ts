import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dashboardRoutes from './routes/dashboard';
import integrationsRoutes from './routes/integrations';
import incidentsRoutes from './routes/incidents';
import runbooksRoutes from './routes/runbooks';
import telemetryRoutes from './routes/telemetry';
import eventsRoutes from './routes/events';
import webhooksRoutes from './routes/webhooks';
import systemRoutes from './routes/system';
import alertsRoutes from './routes/alerts';
import { getAiStatus } from './services/aiRunbookService';
import { requestContext } from './middleware/requestContext';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { initDatabase, closeDatabase, dbMode, pool } from './config/db';

const app = express();

app.disable('x-powered-by');
app.use(helmet());

// CORS: allow the configured frontend origins (comma-separated FRONTEND_URL),
// common local dev origins, and same-origin requests (when the built frontend
// is served by this same Express server).
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins;

function isSameHost(origin: string, hostHeader?: string): boolean {
  if (!hostHeader) return false;
  try {
    return new URL(origin).host === hostHeader;
  } catch {
    return false;
  }
}

app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  const allowed = !origin
    || allowedOrigins.includes('*')
    || allowedOrigins.includes(origin)
    || isSameHost(origin, req.headers.host);
  callback(null, { origin: allowed });
}));

app.use(express.json());
app.use(requestContext);

// Liveness/readiness probe used by Render, Docker, and load balancers.
app.get(['/api/health', '/health'], async (_req, res) => {
  let connectivity = 'up';
  try {
    await pool.query('SELECT 1');
  } catch {
    connectivity = 'down';
  }
  res.status(connectivity === 'up' ? 200 : 503).json({
    status: connectivity === 'up' ? 'ok' : 'degraded',
    service: 'tracedesk-api',
    database: { mode: dbMode, connectivity },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/runbooks', runbooksRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/events', eventsRoutes);
// Webhook listeners are body-parsed by express.json() above; external tools
// POST here to push real events into the platform.
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/alerts', alertsRoutes);
app.get('/api/ai/status', (_req, res) => res.json(getAiStatus()));

// Serve the built React frontend when one exists (single-service deployment).
// Resolve <repo>/dist whether running from src/ (ts-node-dev) or dist/ (node).
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, '..', '..', 'dist');
const indexHtml = path.join(staticDir, 'index.html');
const serveStatic = process.env.SERVE_STATIC !== 'false' && fs.existsSync(indexHtml);

if (serveStatic) {
  app.use(express.static(staticDir));
  // SPA fallback: any non-API GET returns index.html so client-side routes work.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(indexHtml);
  });
  console.log(`[static] Serving frontend build from ${staticDir}`);
} else if (process.env.SERVE_STATIC === 'true') {
  console.warn(`[static] SERVE_STATIC=true but no frontend build found at ${indexHtml}. Run "npm run build" in the repository root first.`);
}

app.use(notFound);
app.use(errorHandler);

export async function startServer(): Promise<void> {
  const info = await initDatabase();
  const port = Number(process.env.PORT) || 3001;

  const server = app.listen(port, () => {
    console.log(`TraceDesk API listening on http://localhost:${port}`);
    console.log(`Database: ${info.mode}${info.fellBackToMemory ? ' (PostgreSQL unreachable — in-memory fallback)' : ''}${info.seeded ? ', demo data seeded' : ''}`);
    if (info.mode === 'memory') {
      console.log('Note: in-memory database — data resets on restart. Set DATABASE_URL for persistence.');
    }
    if (serveStatic) {
      console.log(`Frontend: http://localhost:${port} (served by this process)`);
    }
  });


  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close();
    await closeDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only start the server when not under test (Vitest imports `app` directly).
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error('Failed to start TraceDesk API:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export default app;
