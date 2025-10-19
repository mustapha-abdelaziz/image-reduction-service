import { FastifyPluginAsync } from 'fastify';
import { getConfig } from '@/config/env.js';

const securityPlugin: FastifyPluginAsync = async (fastify) => {
  const config = getConfig();

  // Skip authentication for health endpoint
  const publicPaths = ['/health', '/metrics'];

  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for public paths
    if (publicPaths.some(path => request.url.startsWith(path))) {
      return;
    }

    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({
        code: 'MISSING_API_KEY',
        message: 'API key required in x-api-key header',
        traceId: request.traceId,
      });
    }

    // Simple API key validation - in production you'd use HMAC/JWT
    if (apiKey !== config.API_KEY) {
      return reply.status(401).send({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
        traceId: request.traceId,
      });
    }

    // Attach user context for downstream handlers
    request.user = {
      apiKey,
      keyId: 'default', // In production, this would be extracted from JWT or database
    };
  });

  // Security headers
  fastify.addHook('onSend', async (_request, reply) => {
    reply.headers({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
  });
};

export default securityPlugin;
