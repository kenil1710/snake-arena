import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Validates req.body against a zod schema; replaces it with the parsed
 * (transformed) value so handlers read normalized data.
 */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
