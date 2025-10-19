import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/app.js';
import { FastifyInstance } from 'fastify';

describe('Health Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health should return 200 with healthy status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
    expect(body.sharp).toBe(true);
    expect(body.formats.webp).toBe(true);
    expect(body.formats.jpeg).toBe(true);
  });

  it('GET /health/ready should return 200 when service is ready', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(true);
  });

  it('GET /health/live should return 200 when service is alive', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.alive).toBe(true);
  });
});
