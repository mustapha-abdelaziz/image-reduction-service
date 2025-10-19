import { FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'crypto';

const tracingPlugin: FastifyPluginAsync = async fastify => {
  // Add trace ID to each request
  fastify.addHook('onRequest', async request => {
    // Generate a simple trace ID - in production you'd use OpenTelemetry
    request.traceId = randomBytes(8).toString('hex');
  });

  // Add trace ID to response headers
  fastify.addHook('onSend', async (request, reply) => {
    if (request.traceId) {
      reply.header('X-Trace-Id', request.traceId);
    }
  });

  // Add trace ID to logs
  fastify.addHook('onRequest', async request => {
    request.log = request.log.child({ traceId: request.traceId });
  });
};

export default tracingPlugin;
