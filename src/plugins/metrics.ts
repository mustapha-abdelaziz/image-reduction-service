import { FastifyPluginAsync } from 'fastify';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

const metricsPlugin: FastifyPluginAsync = async (fastify) => {
  // Clear any existing metrics to avoid duplicate registration
  register.clear();

  // Collect default Node.js metrics
  collectDefaultMetrics({ prefix: 'image_redactor_' });

  // Custom metrics
  const httpRequestsTotal = new Counter({
    name: 'image_redactor_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  });

  const httpRequestDuration = new Histogram({
    name: 'image_redactor_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  });

  const imageProcessingDuration = new Histogram({
    name: 'image_redactor_image_processing_duration_seconds',
    help: 'Image processing duration in seconds',
    labelNames: ['format', 'operation'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  });

  const activeRequests = new Gauge({
    name: 'image_redactor_active_requests',
    help: 'Number of active requests being processed',
  });

  const memoryUsage = new Gauge({
    name: 'image_redactor_memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['type'],
  });

  // Update memory metrics periodically
  setInterval(() => {
    const memUsage = process.memoryUsage();
    memoryUsage.set({ type: 'rss' }, memUsage.rss);
    memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
    memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
    memoryUsage.set({ type: 'external' }, memUsage.external);
  }, 5000);

  // Hook to track request metrics
  fastify.addHook('onRequest', async (request) => {
    activeRequests.inc();
    request.requestStartTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    activeRequests.dec();

    const duration = (Date.now() - (request.requestStartTime || Date.now())) / 1000;
    const labels = {
      method: request.method,
      route: request.routeOptions?.url || request.url,
      status_code: reply.statusCode.toString(),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });

  // Expose metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return register.metrics();
  });

  // Make metrics available to other parts of the application
  fastify.decorate('metrics', {
    httpRequestsTotal,
    httpRequestDuration,
    imageProcessingDuration,
    activeRequests,
    memoryUsage,
  });
};

// Extend Fastify type definitions
declare module 'fastify' {
  interface FastifyInstance {
    metrics?: {
      httpRequestsTotal: Counter<string>;
      httpRequestDuration: Histogram<string>;
      imageProcessingDuration: Histogram<string>;
      activeRequests: Gauge<string>;
      memoryUsage: Gauge<string>;
    };
  }

  interface FastifyRequest {
    requestStartTime?: number;
  }
}

export default metricsPlugin;
