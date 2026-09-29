import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { Logger } from './logger.ts';

/** An error that maps directly to an HTTP response. Message must be safe to show. */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly extra: Record<string, unknown> | undefined;

  constructor(status: ContentfulStatusCode, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message = 'Invalid request') => new HttpError(400, 'bad_request', message);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in required');
export const notFound = () => new HttpError(404, 'not_found', 'Not found');

/** Parses with Zod and turns failures into a 400 that names fields but not values. */
export function parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(i => i.path.join('.') || '(root)'))].slice(0, 5);
    throw badRequest(`Invalid fields: ${fields.join(', ')}`);
  }
  return result.data;
}

/** Error body is always { error: { code, message } } — no stack traces, no internals. */
export function errorResponse(c: Context, err: unknown, logger: Logger) {
  if (err instanceof HttpError) {
    return c.json({ error: { code: err.code, message: err.message }, ...err.extra }, err.status);
  }
  // Log a reduced error: driver errors can carry query parameters as own props.
  const e = err instanceof Error ? err : new Error(String(err));
  const safe = { name: e.name, message: e.message, stack: e.stack, code: (e as { code?: unknown }).code };
  logger.error({ err: safe, path: c.req.path, method: c.req.method }, 'unhandled error');
  return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest('Body must be JSON');
  }
}
