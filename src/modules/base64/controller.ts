import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  RedactionService,
  RedactionServiceError,
} from '@/modules/redaction/service.js';
import { z } from 'zod';
import { measureAsync } from '@/utils/timing.js';
import { generateETag } from '@/utils/hash.js';
import { Region } from '@/modules/redaction/dtos.js';
import sharp from 'sharp';

// Simple coordinate schema (x, y, width, height)
// Allow any number, we'll clamp them later to valid ranges
const coordsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive'),
});

// Simple region schema for base64 endpoint
const simpleRegionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('blur'),
    coords: coordsSchema,
    strength: z.enum(['low', 'medium', 'high']),
  }),
  z.object({
    type: z.literal('pixelate'),
    coords: coordsSchema,
    blockSize: z.union([z.literal(6), z.literal(12), z.literal(24)]),
  }),
  z.object({
    type: z.literal('fill'),
    coords: coordsSchema,
    color: z.string().regex(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/),
  }),
]);

// Schema for base64 image redaction
const base64RedactionRequestSchema = z.object({
  image: z.string().min(1, 'Image data required'),
  regions: z.array(simpleRegionSchema).min(1).max(20),
  output: z
    .object({
      format: z.enum(['webp', 'jpeg']).default('webp'),
      quality: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

// Convert simple region format to internal Region format
function convertToInternalRegion(
  simple: z.infer<typeof simpleRegionSchema>
): Region {
  const coords = simple.coords;

  // Normalize coordinates if they're > 1 (pixel coordinates)
  const isNormalized =
    coords.x <= 1 && coords.y <= 1 && coords.width <= 1 && coords.height <= 1;

  const coordinates = isNormalized
    ? {
        x_norm: coords.x,
        y_norm: coords.y,
        w_norm: coords.width,
        h_norm: coords.height,
      }
    : {
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        width: Math.round(coords.width),
        height: Math.round(coords.height),
      };

  if (simple.type === 'blur') {
    const sizeMap = {
      low: 'S' as const,
      medium: 'M' as const,
      high: 'L' as const,
    };
    return {
      coordinates,
      operation: { type: 'blur', size: sizeMap[simple.strength] },
    };
  } else if (simple.type === 'pixelate') {
    const sizeMap = { 6: 'S' as const, 12: 'M' as const, 24: 'L' as const };
    return {
      coordinates,
      operation: { type: 'pixelate', size: sizeMap[simple.blockSize] },
    };
  } else {
    return {
      coordinates,
      operation: { type: 'fill', color: simple.color },
    };
  }
}

const base64Controller: FastifyPluginAsync = async fastify => {
  const redactionService = new RedactionService();

  /**
   * POST /v1/redact/base64 - Process base64-encoded image and return result
   */
  fastify.post(
    '/redact/base64',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Parse and validate request
        const validated = base64RedactionRequestSchema.parse(request.body);

        // Decode base64 image
        const imageBuffer = Buffer.from(validated.image, 'base64');

        if (imageBuffer.length === 0) {
          return reply.status(400).send({
            code: 'INVALID_IMAGE',
            message: 'Invalid base64 image data',
            traceId: request.traceId,
          });
        }

        // Get image metadata to validate regions
        let metadata;
        try {
          metadata = await sharp(imageBuffer).metadata();
        } catch (error) {
          request.log.error(
            { error, traceId: request.traceId },
            'Failed to read image metadata'
          );
          return reply.status(400).send({
            code: 'INVALID_IMAGE',
            message:
              'Unable to process image. Please ensure the base64 data is a valid image.',
            traceId: request.traceId,
          });
        }

        const imgWidth = metadata.width || 0;
        const imgHeight = metadata.height || 0;

        if (imgWidth === 0 || imgHeight === 0) {
          return reply.status(400).send({
            code: 'INVALID_IMAGE',
            message: 'Image has invalid dimensions',
            traceId: request.traceId,
          });
        }

        // Clamp region coordinates to image bounds
        for (let i = 0; i < validated.regions.length; i++) {
          const region = validated.regions[i];
          const coords = region.coords;

          // Check if coordinates are normalized (0-1) or pixel values
          const isNormalized =
            coords.x <= 1 &&
            coords.y <= 1 &&
            coords.width <= 1 &&
            coords.height <= 1;

          if (isNormalized) {
            // Normalized coordinates - clamp to 0-1 range
            coords.x = Math.max(0, Math.min(1, coords.x));
            coords.y = Math.max(0, Math.min(1, coords.y));
            coords.width = Math.max(0, Math.min(1 - coords.x, coords.width));
            coords.height = Math.max(0, Math.min(1 - coords.y, coords.height));

            // Ensure we still have a valid region after clamping
            if (coords.width <= 0 || coords.height <= 0) {
              return reply.status(400).send({
                code: 'INVALID_REGION',
                message: `Region ${i + 1}: After adjusting to image bounds, region has no area`,
                details: {
                  region: i + 1,
                  originalCoordinates: region.coords,
                  adjustedCoordinates: coords,
                  type: 'normalized (0-1)',
                },
                traceId: request.traceId,
              });
            }
          } else {
            // Pixel coordinates - round decimals and clamp to image bounds
            const originalCoords = { ...coords };

            // Round decimal coordinates to integers
            coords.x = Math.round(coords.x);
            coords.y = Math.round(coords.y);
            coords.width = Math.round(coords.width);
            coords.height = Math.round(coords.height);

            // Clamp x, y to be within image
            coords.x = Math.max(0, Math.min(imgWidth - 1, coords.x));
            coords.y = Math.max(0, Math.min(imgHeight - 1, coords.y));

            // Clamp width and height to not exceed image boundaries
            coords.width = Math.max(
              1,
              Math.min(imgWidth - coords.x, coords.width)
            );
            coords.height = Math.max(
              1,
              Math.min(imgHeight - coords.y, coords.height)
            );

            // Log adjustment if coordinates were clamped
            if (
              originalCoords.x !== coords.x ||
              originalCoords.y !== coords.y ||
              originalCoords.width !== coords.width ||
              originalCoords.height !== coords.height
            ) {
              request.log.info(
                {
                  region: i + 1,
                  original: originalCoords,
                  adjusted: coords,
                  imageDimensions: { width: imgWidth, height: imgHeight },
                },
                'Region coordinates adjusted to fit image bounds'
              );
            }
          }
        }

        // Convert simple regions to internal format
        const regions: Region[] = validated.regions.map(
          convertToInternalRegion
        );

        // Process image with timing
        const { result: outputBuffer, durationMs } = await measureAsync(
          async () => {
            return await redactionService.redactImage(imageBuffer, regions, {
              format: validated.output?.format || 'webp',
              quality: validated.output?.quality || 85,
            });
          }
        );

        // Extract buffer from result
        const resultBuffer = outputBuffer.buffer;

        // Generate ETag
        const etag = generateETag(resultBuffer);

        // Set response headers
        const format = validated.output?.format || 'webp';
        const contentType = format === 'webp' ? 'image/webp' : 'image/jpeg';

        reply.header('Content-Type', contentType);
        reply.header('ETag', etag);
        reply.header('X-Process-Ms', durationMs.toFixed(2));
        reply.header(
          'Content-Disposition',
          `attachment; filename="redacted.${format}"`
        );
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        return reply.send(resultBuffer);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            errors: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
            traceId: request.traceId,
          });
        }

        if (error instanceof RedactionServiceError) {
          return reply.status(error.statusCode).send({
            code: error.code,
            message: error.message,
            traceId: request.traceId,
          });
        }

        request.log.error(
          { error, traceId: request.traceId },
          'Base64 redaction error'
        );

        return reply.status(500).send({
          code: 'PROCESSING_ERROR',
          message:
            error instanceof Error ? error.message : 'Image processing failed',
          traceId: request.traceId,
        });
      }
    }
  );
};

export default base64Controller;
