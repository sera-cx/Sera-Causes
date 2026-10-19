import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { logger } from '../log.js';

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string, detail?: unknown) => new HttpError(400, m, detail);
export const unauthorized = (m = 'sign in required') => new HttpError(401, m);
export const forbidden = (m = 'not allowed') => new HttpError(403, m);
export const notFound = (m = 'not found') => new HttpError(404, m);
export const conflict = (m: string, detail?: unknown) => new HttpError(409, m, detail);
/** The server cannot do this at all, as configured. Never a sign-in problem. */
export const unavailable = (m: string) => new HttpError(503, m);

/** Wraps an async handler so rejections reach the error middleware. */
export function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw badRequest('invalid request body', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  const r = schema.safeParse(query);
  if (!r.success) {
    throw badRequest('invalid query', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, detail: err.detail ?? undefined });
    return;
  }
  const anyErr = err as { type?: string; status?: number; code?: string; message?: string };
  if (anyErr?.type === 'entity.parse.failed' || anyErr?.type === 'entity.too.large') {
    res.status(anyErr.status ?? 400).json({ error: anyErr.message ?? 'bad request' });
    return;
  }
  if (anyErr?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'file too large' });
    return;
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ error: 'internal error' });
}
