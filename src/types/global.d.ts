declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: 'development' | 'production' | 'test';
      PORT?: string;
      MAX_BYTES?: string;
      MAX_PIXELS?: string;
      MAX_REGIONS?: string;
      DEFAULT_FORMAT?: 'webp' | 'jpeg';
      DEFAULT_QUALITY?: string;
      RATE_LIMIT_POINTS?: string;
      RATE_LIMIT_WINDOW_MS?: string;
      API_KEY?: string;
      S3_REGION?: string;
      S3_ACCESS_KEY_ID?: string;
      S3_SECRET_ACCESS_KEY?: string;
      S3_ENDPOINT?: string;
      WEBHOOK_URL?: string;
      LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
      METRICS_ENABLED?: string;
      TRACING_ENABLED?: string;
    }
  }
}

// Fastify request extensions
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      apiKey: string;
      keyId: string;
    };
    traceId?: string;
  }
}

export {};
