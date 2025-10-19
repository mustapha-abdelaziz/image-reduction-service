import fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyError,
} from 'fastify';
import { getConfig } from '@/config/env.js';
import { normalizeError } from '@/modules/redaction/errors.js';

export async function createApp(): Promise<FastifyInstance> {
  const config = getConfig();

  const app = fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: config.MAX_BYTES,
  });

  // Register plugins in order
  // CORS - must be registered early
  await app.register(import('@fastify/cors'), {
    origin: config.NODE_ENV === 'development' ? true : false, // Allow all origins in dev
    credentials: true,
  });

  await app.register(import('@/plugins/tracing.js'));
  await app.register(import('@/plugins/security.js'));
  await app.register(import('@/plugins/rateLimit.js'));
  await app.register(import('@/plugins/multipart.js'));

  if (config.METRICS_ENABLED) {
    await app.register(import('@/plugins/metrics.js'));
  }

  // Health endpoint (no auth required)
  await app.register(import('@/modules/health/controller.js'), {
    prefix: '',
  });

  // API routes (with auth) - registered directly to inherit plugins
  await app.register(import('@/modules/redaction/controller.js'), {
    prefix: '/v1',
  });
  await app.register(import('@/modules/batch/controller.js'), {
    prefix: '/v1',
  });
  await app.register(import('@/modules/base64/controller.js'), {
    prefix: '/v1',
  });

  // Global error handler
  app.setErrorHandler(
    async (
      error: FastifyError,
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const traceId = request.traceId || 'unknown';

      // Log error with trace context
      request.log.error(
        {
          error: error.message,
          stack: error.stack,
          traceId,
          url: request.url,
          method: request.method,
        },
        'Request error'
      );

      // Use normalized error handling
      const normalizedErr = normalizeError(error);

      return reply.status(normalizedErr.statusCode).send({
        code: normalizedErr.code,
        message: normalizedErr.message,
        traceId,
        details: normalizedErr.details,
      });
    }
  );

  return app;
}
