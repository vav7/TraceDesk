import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface StructuredLog {
  level: 'info' | 'warn' | 'error';
  msg: string;
  [key: string]: unknown;
}

/** One-line JSON logs (structured) — grep- and machine-friendly. */
export function log(entry: StructuredLog): void {
  console.log(JSON.stringify({ ...entry, time: new Date().toISOString() }));
}

/**
 * Assigns every request an ID (honoring an inbound X-Request-Id), echoes it
 * on the response, and emits a structured access-log line with duration.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const headerId = req.header('x-request-id');
  const requestId = headerId && headerId.length <= 128 ? headerId : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.locals.requestId = requestId;

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    log({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'request',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      requestId,
    });
  });
  next();
}
