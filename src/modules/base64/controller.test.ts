import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/app.js';
import { FastifyInstance } from 'fastify';
import sharp from 'sharp';

describe('Base64 Redaction Controller', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper function to create a test image
  async function createTestImage(
    width: number,
    height: number
  ): Promise<string> {
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    return buffer.toString('base64');
  }

  describe('POST /v1/redact/base64', () => {
    it('should successfully process a valid base64 image with blur', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 50, y: 50, width: 100, height: 100 },
              strength: 'high',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 90,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['etag']).toBeDefined();
      expect(response.headers['x-process-ms']).toBeDefined();
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should clamp region coordinates that exceed image width', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 300, y: 100, width: 400, height: 100 },
              strength: 'medium',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 90,
          },
        },
      });

      // Should succeed with clamped coordinates (x: 300, width: 100 instead of 400)
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should clamp region coordinates that exceed image height', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 100, y: 200, width: 100, height: 2000 },
              strength: 'high',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 90,
          },
        },
      });

      // Should succeed with clamped coordinates (y: 200, height: 100 instead of 2000)
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should clamp region coordinates that exceed both width and height', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'pixelate',
              coords: { x: 300, y: 200, width: 500, height: 500 },
              blockSize: 12,
            },
          ],
          output: {
            format: 'webp',
            quality: 85,
          },
        },
      });

      // Should succeed with clamped coordinates (width: 100, height: 100)
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should clamp negative coordinates to 0', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'fill',
              coords: { x: -50, y: -50, width: 200, height: 200 },
              color: '#FF0000',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 90,
          },
        },
      });

      // Should succeed with clamped coordinates (x: 0, y: 0)
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should handle normalized coordinates (0-1)', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
              strength: 'low',
            },
          ],
          output: {
            format: 'webp',
            quality: 85,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should clamp normalized coordinates that exceed 1.0', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 0.5, y: 0.5, width: 0.8, height: 0.8 },
              strength: 'medium',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 90,
          },
        },
      });

      // Should succeed with clamped coordinates (width: 0.5, height: 0.5)
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should handle multiple regions with different operations', async () => {
      const base64Image = await createTestImage(800, 600);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 0, y: 0, width: 200, height: 200 },
              strength: 'high',
            },
            {
              type: 'pixelate',
              coords: { x: 300, y: 100, width: 200, height: 200 },
              blockSize: 24,
            },
            {
              type: 'fill',
              coords: { x: 600, y: 400, width: 300, height: 300 },
              color: '#000000',
            },
          ],
          output: {
            format: 'webp',
            quality: 85,
          },
        },
      });

      // Last region should be clamped: x:600, y:400, width:200, height:200
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.rawPayload.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid base64 data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: 'not-valid-base64-!@#$%',
          regions: [
            {
              type: 'blur',
              coords: { x: 0, y: 0, width: 100, height: 100 },
              strength: 'high',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('INVALID_IMAGE');
    });

    it('should return 400 for empty image data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: '',
          regions: [
            {
              type: 'blur',
              coords: { x: 0, y: 0, width: 100, height: 100 },
              strength: 'high',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing regions', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid region type', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'invalid-type',
              coords: { x: 0, y: 0, width: 100, height: 100 },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid blur strength', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 0, y: 0, width: 100, height: 100 },
              strength: 'extra-super-high',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid pixelate block size', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'pixelate',
              coords: { x: 0, y: 0, width: 100, height: 100 },
              blockSize: 99,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid fill color', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'fill',
              coords: { x: 0, y: 0, width: 100, height: 100 },
              color: 'not-a-hex-color',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should handle small images (24x24 with large region)', async () => {
      const base64Image = await createTestImage(24, 24);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 100, y: 100, width: 400, height: 300 },
              strength: 'high',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 90,
          },
        },
      });

      // Should clamp to fit the 24x24 image
      // Since x:100 > 24, it will be clamped to x:23, width:1
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    it('should support webp output format (default)', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 50, y: 50, width: 100, height: 100 },
              strength: 'low',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
    });

    it('should support custom quality settings', async () => {
      const base64Image = await createTestImage(400, 300);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/redact/base64',
        payload: {
          image: base64Image,
          regions: [
            {
              type: 'blur',
              coords: { x: 50, y: 50, width: 100, height: 100 },
              strength: 'medium',
            },
          ],
          output: {
            format: 'jpeg',
            quality: 50,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
    });
  });
});
