import type { ZodTypeAny, z } from 'zod';
import { GseraError } from './errors.js';

/** Parse with a zod schema and turn failures into a `GseraError` with code INVALID_INPUT. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new GseraError(`Invalid input: ${issues}`, { code: 'INVALID_INPUT', detail: { issues } });
  }
  return r.data;
}
