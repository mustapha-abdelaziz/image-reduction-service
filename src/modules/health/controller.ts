import { FastifyPluginAsync } from 'fastify';
import sharp from 'sharp';

const healthController: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health - Health check endpoint
   */
  fastify.get('/health', async (_request, reply) => {
    try {
      // Check if Sharp is properly loaded
      const sharpLoaded = !!sharp;

      // Check available formats
      const formats = {
        webp: false,
        jpeg: false,
      };

      try {
        // Test WebP support
        await sharp({
          create: {
            width: 1,
            height: 1,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        })
          .webp()
          .toBuffer();
        formats.webp = true;
      } catch {
        formats.webp = false;
      }

      try {
        // Test JPEG support
        await sharp({
          create: {
            width: 1,
            height: 1,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        })
          .jpeg()
          .toBuffer();
        formats.jpeg = true;
      } catch {
        formats.jpeg = false;
      }

      const ok = sharpLoaded && formats.webp && formats.jpeg;

      const response = {
        ok,
        sharp: sharpLoaded,
        formats,
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
      };

      return reply
        .code(ok ? 200 : 503)
        .send(response);
    } catch (error) {
      return reply.status(503).send({
        ok: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /health/ready - Readiness check (for Kubernetes)
   */
  fastify.get('/health/ready', async (_request, reply) => {
    // Check if the service is ready to accept requests
    try {
      // Verify Sharp can process a simple image
      await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .blur(1)
        .toBuffer();

      return reply.send({ ready: true });
    } catch (error) {
      return reply.status(503).send({
        ready: false,
        error: error instanceof Error ? error.message : 'Service not ready',
      });
    }
  });

  /**
   * GET /health/live - Liveness check (for Kubernetes)
   */
  fastify.get('/health/live', async (_request, reply) => {
    // Simple liveness check - if this responds, the process is alive
    return reply.send({ alive: true });
  });
};

export default healthController;
