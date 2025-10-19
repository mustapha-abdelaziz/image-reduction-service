import { z } from 'zod';

// Blur size mapping
export const blurSizeSchema = z.enum(['S', 'M', 'L']);
export const BLUR_SIZE_MAP = {
  S: 3,
  M: 6,
  L: 12,
} as const;

// Pixelate size mapping
export const pixelateSizeSchema = z.enum(['S', 'M', 'L']);
export const PIXELATE_SIZE_MAP = {
  S: 6,
  M: 12,
  L: 24,
} as const;

// Color schema for fill operations
export const colorSchema = z.string().regex(
  /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/,
  'Color must be in #RRGGBB or #RRGGBBAA format'
);

// Coordinate schemas
export const pixelCoordinatesSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export const normalizedCoordinatesSchema = z.object({
  x_norm: z.number().min(0).max(1),
  y_norm: z.number().min(0).max(1),
  w_norm: z.number().min(0).max(1),
  h_norm: z.number().min(0).max(1),
});

// Region schema - either pixel or normalized coordinates
export const regionSchema = z.object({
  coordinates: z.union([pixelCoordinatesSchema, normalizedCoordinatesSchema]),
  operation: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('blur'),
      size: blurSizeSchema,
    }),
    z.object({
      type: z.literal('pixelate'),
      size: pixelateSizeSchema,
    }),
    z.object({
      type: z.literal('fill'),
      color: colorSchema,
    }),
  ]),
});

// Output configuration schema
export const outputConfigSchema = z.object({
  format: z.enum(['webp', 'jpeg']).default('webp'),
  quality: z.number().int().min(1).max(100).optional(),
});

// Multipart redaction request schema
export const multipartRedactionRequestSchema = z.object({
  output: outputConfigSchema.optional(),
  regions: z.array(regionSchema).min(1).max(20),
});

// S3 object reference schema
export const s3ObjectSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
});

// S3 redaction request schema
export const s3RedactionRequestSchema = z.object({
  input: s3ObjectSchema,
  output: s3ObjectSchema.extend({
    format: z.enum(['webp', 'jpeg']).default('webp'),
    quality: z.number().int().min(1).max(100).optional(),
  }),
  regions: z.array(regionSchema).min(1).max(20),
  idempotency_key: z.string().optional(),
});

// Batch item schema
export const batchItemSchema = s3RedactionRequestSchema;

// Batch request schema
export const batchRequestSchema = z.object({
  items: z.array(batchItemSchema).min(1).max(10),
  webhook_url: z.string().url().optional(),
});

// Response schemas
export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  traceId: z.string(),
  details: z.any().optional(),
});

export const s3RedactionResponseSchema = z.object({
  ok: z.boolean(),
  output: s3ObjectSchema.optional(),
  processing_time_ms: z.number(),
  etag: z.string().optional(),
});

export const batchResponseSchema = z.object({
  job_id: z.string(),
  items_count: z.number(),
  estimated_completion_ms: z.number().optional(),
});

// Health check schema
export const healthResponseSchema = z.object({
  ok: z.boolean(),
  sharp: z.boolean(),
  formats: z.object({
    webp: z.boolean(),
    jpeg: z.boolean(),
  }),
  version: z.string().optional(),
});
