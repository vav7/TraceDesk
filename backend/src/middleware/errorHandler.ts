import { Request, Response, NextFunction } from 'express';
import { HttpError } from './httpError';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err instanceof Error ? err.stack : err);
  const status = Number.isInteger(err?.statusCode) ? err.statusCode : Number.isInteger(err?.status) ? err.status : 500;
  // HttpError messages are deliberate, safe-for-clients application errors
  // (validation, 404s, "AI not configured", upstream provider failures).
  // Anything else on 5xx is unexpected — keep internals private.
  const message = err instanceof HttpError || status < 500
    ? (err?.message || 'Request failed')
    : 'Internal server error';
  res.status(status).json({ error: message });
}
