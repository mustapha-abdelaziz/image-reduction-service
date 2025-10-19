import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { getConfig } from '@/config/env.js';

const multipartPlugin: FastifyPluginAsync = async (fastify) => {
  const config = getConfig();

  await fastify.register(multipart, {
    limits: {
      fileSize: config.MAX_BYTES,
      files: 1, // Only allow one file upload at a time
      fields: 10, // Allow metadata fields
    },
  });
};

export default multipartPlugin;
