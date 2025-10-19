import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { RedactionService } from '@/modules/redaction/service.js';
import { S3Service } from '@/modules/redaction/s3.service.js';
import { batchRequestSchema } from '@/modules/redaction/schemas.js';
import { BatchRequest, BatchResponse, JobStatus, JobItemStatus } from '@/modules/batch/dtos.js';
import { getJobStore } from '@/modules/batch/jobStore.js';
import { normalizeError } from '@/modules/redaction/errors.js';
import { getConfig } from '@/config/env.js';

const batchController: FastifyPluginAsync = async (fastify) => {
  const redactionService = new RedactionService();
  const s3Service = new S3Service();
  const jobStore = getJobStore();
  const config = getConfig();

  /**
   * Process a batch job in the background
   */
  async function processBatchJob(jobId: string): Promise<void> {
    const job = jobStore.getJob(jobId);
    if (!job) {
      fastify.log.error({ jobId }, 'Job not found for processing');
      return;
    }

    fastify.log.info({ jobId, itemCount: job.items.length }, 'Starting batch job processing');

    // Process each item sequentially
    for (const item of job.items) {
      try {
        jobStore.startJobItem(jobId, item.id);

        const inputBuffer = await s3Service.getObject(
          item.request.input.bucket,
          item.request.input.key
        );

        const processed = await redactionService.redactImage(
          inputBuffer,
          item.request.regions,
          {
            format: item.request.output.format,
            quality: item.request.output.quality,
          }
        );

        await s3Service.putObject(
          item.request.output.bucket,
          item.request.output.key,
          processed.buffer,
          {
            contentType: s3Service.getContentTypeForFormat(processed.format),
            metadata: {
              'x-redaction-etag': processed.etag.replace(/"/g, ''),
              'x-processing-time-ms': processed.processingTimeMs.toString(),
              'x-job-id': jobId,
              'x-item-id': item.id,
            },
          }
        );

        jobStore.completeJobItem(jobId, item.id, {
          ok: true,
          output: item.request.output,
          processing_time_ms: processed.processingTimeMs,
          etag: processed.etag,
        });

        fastify.log.info({ jobId, itemId: item.id }, 'Batch item completed successfully');
      } catch (error) {
        const normalizedError = normalizeError(error);
        jobStore.failJobItem(jobId, item.id, normalizedError.message);

        fastify.log.error({
          jobId,
          itemId: item.id,
          error: normalizedError.message,
        }, 'Batch item failed');
      }
    }

    // Send webhook if configured
    if (job.webhookUrl || config.WEBHOOK_URL) {
      const webhookUrl = job.webhookUrl || config.WEBHOOK_URL!;
      await sendWebhook(jobId, webhookUrl);
    }

    fastify.log.info({ jobId }, 'Batch job processing completed');
  }

  /**
   * Send webhook notification
   */
  async function sendWebhook(jobId: string, webhookUrl: string, attempt: number = 0): Promise<void> {
    const job = jobStore.getJob(jobId);
    if (!job) {
      return;
    }

    const maxAttempts = 3;
    const retryDelays = [1000, 5000, 10000]; // Exponential backoff

    try {
      const payload: JobStatus = {
        job_id: job.id,
        status: job.status,
        created_at: job.createdAt.toISOString(),
        started_at: job.startedAt?.toISOString(),
        completed_at: job.completedAt?.toISOString(),
        progress: {
          total: job.progress.total,
          completed: job.progress.completed,
          failed: job.progress.failed,
          pending: job.progress.total - job.progress.completed - job.progress.failed,
        },
        items: job.items.map((item, index): JobItemStatus => ({
          index,
          status: item.status,
          input: item.request.input,
          output: item.result?.output,
          processing_time_ms: item.result?.processing_time_ms,
          error: item.error,
          started_at: item.startedAt?.toISOString(),
          completed_at: item.completedAt?.toISOString(),
        })),
        webhook_url: webhookUrl,
        webhook_delivered: false,
        webhook_attempts: attempt + 1,
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ImageRedactorService/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      fastify.log.info({ jobId, webhookUrl }, 'Webhook delivered successfully');
    } catch (error) {
      fastify.log.error({
        jobId,
        webhookUrl,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      }, 'Webhook delivery failed');

      // Retry with exponential backoff
      if (attempt < maxAttempts - 1) {
        const delay = retryDelays[attempt];
        fastify.log.info({ jobId, delay }, 'Retrying webhook delivery');

        await new Promise(resolve => setTimeout(resolve, delay));
        await sendWebhook(jobId, webhookUrl, attempt + 1);
      }
    }
  }

  /**
   * POST /v1/redact/batch - Submit batch redaction job
   */
  fastify.post('/redact/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      let requestData: BatchRequest;
      try {
        requestData = batchRequestSchema.parse(request.body);
      } catch (error) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Invalid request format',
          traceId: request.traceId,
        });
      }

      // Create job
      const job = jobStore.createJob(requestData.items, requestData.webhook_url);

      // Process in background (don't await)
      setImmediate(() => {
        processBatchJob(job.id).catch(error => {
          fastify.log.error({ jobId: job.id, error }, 'Batch job processing error');
        });
      });

      // Estimate completion time (rough estimate: 500ms per item)
      const estimatedMs = requestData.items.length * 500;

      const response: BatchResponse = {
        job_id: job.id,
        items_count: requestData.items.length,
        estimated_completion_ms: estimatedMs,
      };

      return reply.status(202).send(response);
    } catch (error) {
      const normalizedError = normalizeError(error);

      return reply.status(normalizedError.statusCode).send({
        code: normalizedError.code,
        message: normalizedError.message,
        traceId: request.traceId,
        details: normalizedError.details,
      });
    }
  });

  /**
   * GET /v1/redact/batch/:jobId - Get batch job status
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/redact/batch/:jobId',
    async (request, reply) => {
      const { jobId } = request.params;
      const job = jobStore.getJob(jobId);

      if (!job) {
        return reply.status(404).send({
          code: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
          traceId: request.traceId,
        });
      }

      const status: JobStatus = {
        job_id: job.id,
        status: job.status,
        created_at: job.createdAt.toISOString(),
        started_at: job.startedAt?.toISOString(),
        completed_at: job.completedAt?.toISOString(),
        progress: {
          total: job.progress.total,
          completed: job.progress.completed,
          failed: job.progress.failed,
          pending: job.progress.total - job.progress.completed - job.progress.failed,
        },
        items: job.items.map((item, index): JobItemStatus => ({
          index,
          status: item.status,
          input: item.request.input,
          output: item.result?.output,
          processing_time_ms: item.result?.processing_time_ms,
          error: item.error,
          started_at: item.startedAt?.toISOString(),
          completed_at: item.completedAt?.toISOString(),
        })),
        webhook_url: job.webhookUrl,
      };

      return reply.send(status);
    }
  );
};

export default batchController;
