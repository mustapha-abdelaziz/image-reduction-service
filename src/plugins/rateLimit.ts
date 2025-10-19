import { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '@/config/env.js';

const rateLimitPlugin: FastifyPluginAsync = async fastify => {
  const config = getConfig();

  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_POINTS,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: request => {
      // Rate limit by API key if available, otherwise by IP
      return request.user?.apiKey || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded, retry after ${Math.round(context.ttl / 1000)} seconds`,
        traceId: request.traceId,
        retryAfter: Math.round(context.ttl / 1000),
      };
    },
    enableDraftSpec: true, // Adds standard rate limit headers
    skipOnError: false,
  });
};

export default rateLimitPlugin;
