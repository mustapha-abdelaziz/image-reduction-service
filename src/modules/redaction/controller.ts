import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { RedactionService } from '@/modules/redaction/service.js';
import { S3Service } from '@/modules/redaction/s3.service.js';
import {
  multipartRedactionRequestSchema,
  s3RedactionRequestSchema,
} from '@/modules/redaction/schemas.js';
import {
  MultipartRedactionRequest,
  S3RedactionRequest,
  S3RedactionResponse,
} from '@/modules/redaction/dtos.js';
import { normalizeError } from '@/modules/redaction/errors.js';
import { measureAsync } from '@/utils/timing.js';
import { generateRequestHash } from '@/utils/hash.js';

const redactionController: FastifyPluginAsync = async fastify => {
  const redactionService = new RedactionService();
  const s3Service = new S3Service();

  /**
   * POST /v1/redact - Multipart file upload with redaction
   */
  fastify.post(
    '/redact',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get multipart data
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({
            code: 'MISSING_FILE',
            message: 'No file provided in multipart request',
            traceId: request.traceId,
          });
        }

        // Parse and validate the request body
        const fields = data.fields as any;
        const opsField = fields.ops?.value || fields.ops;

        if (!opsField) {
          return reply.status(400).send({
            code: 'MISSING_OPS',
            message: 'Missing "ops" field with redaction operations',
            traceId: request.traceId,
          });
        }

        let requestData: MultipartRedactionRequest;
        try {
          const parsed =
            typeof opsField === 'string' ? JSON.parse(opsField) : opsField;
          requestData = multipartRedactionRequestSchema.parse(parsed);
        } catch (error) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message:
              error instanceof Error ? error.message : 'Invalid request format',
            traceId: request.traceId,
          });
        }

        // Read file buffer
        const fileBuffer = await data.toBuffer();
        const mimeType = data.mimetype;

        // Process the image
        const { result: processed, durationMs } = await measureAsync(
          async () => {
            return redactionService.processMultipartRequest(
              fileBuffer,
              requestData,
              mimeType
            );
          }
        );

        // Set response headers
        reply.header(
          'Content-Type',
          processed.format === 'webp' ? 'image/webp' : 'image/jpeg'
        );
        reply.header('ETag', processed.etag);
        reply.header('X-Process-Ms', Math.round(durationMs).toString());
        reply.header('Cache-Control', 'private, max-age=3600');

        return reply.send(processed.buffer);
      } catch (error) {
        const normalizedError = normalizeError(error);

        return reply.status(normalizedError.statusCode).send({
          code: normalizedError.code,
          message: normalizedError.message,
          traceId: request.traceId,
          details: normalizedError.details,
        });
      }
    }
  );

  /**
   * POST /v1/redact/s3 - S3-to-S3 redaction
   */
  fastify.post(
    '/redact/s3',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate request body
        let requestData: S3RedactionRequest;
        try {
          requestData = s3RedactionRequestSchema.parse(request.body);
        } catch (error) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message:
              error instanceof Error ? error.message : 'Invalid request format',
            traceId: request.traceId,
          });
        }

        const { result, durationMs } = await measureAsync(async () => {
          // Generate idempotency key if not provided
          const idempotencyKey =
            requestData.idempotency_key ||
            generateRequestHash({
              input: requestData.input,
              output: requestData.output,
              regions: requestData.regions,
            });

          // Check if output already exists (idempotency)
          const outputExists = await s3Service.objectExists(
            requestData.output.bucket,
            requestData.output.key
          );

          if (outputExists && requestData.idempotency_key) {
            request.log.info(
              { idempotencyKey },
              'Output already exists, skipping processing'
            );

            const response: S3RedactionResponse = {
              ok: true,
              output: requestData.output,
              processing_time_ms: 0,
            };

            return response;
          }

          // Download input from S3
          request.log.info(
            {
              bucket: requestData.input.bucket,
              key: requestData.input.key,
            },
            'Downloading input from S3'
          );

          const inputBuffer = await s3Service.getObject(
            requestData.input.bucket,
            requestData.input.key
          );

          // Process the image
          const processed = await redactionService.redactImage(
            inputBuffer,
            requestData.regions,
            {
              format: requestData.output.format,
              quality: requestData.output.quality,
            }
          );

          // Upload result to S3
          request.log.info(
            {
              bucket: requestData.output.bucket,
              key: requestData.output.key,
            },
            'Uploading output to S3'
          );

          await s3Service.putObject(
            requestData.output.bucket,
            requestData.output.key,
            processed.buffer,
            {
              contentType: s3Service.getContentTypeForFormat(processed.format),
              metadata: {
                'x-redaction-etag': processed.etag.replace(/"/g, ''),
                'x-processing-time-ms': processed.processingTimeMs.toString(),
                'x-idempotency-key': idempotencyKey,
              },
            }
          );

          const response: S3RedactionResponse = {
            ok: true,
            output: requestData.output,
            processing_time_ms: processed.processingTimeMs,
            etag: processed.etag,
          };

          return response;
        });

        // Set response headers
        reply.header('X-Process-Ms', Math.round(durationMs).toString());

        return reply.send(result);
      } catch (error) {
        const normalizedError = normalizeError(error);

        return reply.status(normalizedError.statusCode).send({
          code: normalizedError.code,
          message: normalizedError.message,
          traceId: request.traceId,
          details: normalizedError.details,
        });
      }
    }
  );
};

export default redactionController;
