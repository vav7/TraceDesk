import { Router, Request, Response } from 'express';
import { bus, EVENT_NAMES, EventName } from '../services/eventBus';

const router = Router();

/**
 * Server-Sent Events stream. Browsers connect with `new EventSource('/api/events')`
 * and receive every domain event (telemetry, incidents, runbooks, webhooks)
 * in real time. SSE needs no extra dependencies, survives proxies, and
 * EventSource reconnects automatically.
 */
router.get('/', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering (nginx/Vercel-style hints) so events flush instantly.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, timestamp: new Date().toISOString() })}\n\n`);

  const handlers = new Map<EventName, (payload: unknown) => void>();
  for (const name of EVENT_NAMES) {
    const handler = (payload: unknown) => {
      res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    handlers.set(name, handler);
    bus.on(name, handler);
  }

  // Keep-alive comment frame so idle connections are not reaped by proxies.
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(ping);
    for (const [name, handler] of handlers) bus.off(name, handler);
  });
});

export default router;
