import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AppError } from './error-handler.js';

// Validation middleware factory
export function validate(schema: {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // Validate request params
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      // Validate query parameters
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new AppError(
          `Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          400,
          'VALIDATION_ERROR'
        );
        next(validationError);
      } else {
        next(error);
      }
    }
  };
}

// Common validation schemas
export const commonSchemas = {
  // Pagination parameters
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),

  // Video ID parameter
  videoId: z.object({
    id: z.string().uuid('Invalid video ID format'),
  }),

  // File upload query
  fileUpload: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    tags: z.string().transform(val => val.split(',').filter(Boolean)).optional(),
  }),

  // CPU burn parameters
  burnCpu: z.object({
    ms: z.coerce.number().min(1).max(10000).default(200),
  }),

  // Live stream parameters
  liveStream: z.object({
    channel: z.string().min(1).max(50),
  }),
};
