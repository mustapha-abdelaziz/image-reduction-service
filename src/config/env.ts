import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Image processing limits
  MAX_BYTES: z.coerce.number().int().positive().default(10485760), // 10MB
  MAX_PIXELS: z.coerce.number().int().positive().default(8294400), // 3840×2160
  MAX_REGIONS: z.coerce.number().int().positive().default(20),

  // Output defaults
  DEFAULT_FORMAT: z.enum(['webp', 'jpeg']).default('webp'),
  DEFAULT_QUALITY: z.coerce.number().int().min(1).max(100).default(85),

  // Rate limiting
  RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Security
  API_KEY: z.string().min(1).default('dev-123'),

  // AWS S3 configuration
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(), // For MinIO/DigitalOcean Spaces

  // Webhooks
  WEBHOOK_URL: z.string().url().optional(),

  // Observability
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  TRACING_ENABLED: z.coerce.boolean().default(true),
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;

export function loadConfig(): EnvConfig {
  try {
    config = envSchema.parse(process.env);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .filter(
          (err: z.ZodIssue) =>
            err.code === 'invalid_type' && err.received === 'undefined'
        )
        .map((err: z.ZodIssue) => err.path.join('.'));

      const invalidFields = error.errors
        .filter(
          (err: z.ZodIssue) =>
            err.code !== 'invalid_type' || err.received !== 'undefined'
        )
        .map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`);

      let errorMessage = 'Environment configuration validation failed:\n';

      if (missingFields.length > 0) {
        errorMessage += `\nMissing required fields:\n${missingFields.map((f: string) => `  - ${f}`).join('\n')}`;
      }

      if (invalidFields.length > 0) {
        errorMessage += `\nInvalid values:\n${invalidFields.map((f: string) => `  - ${f}`).join('\n')}`;
      }

      errorMessage +=
        '\n\nPlease check your .env file or environment variables.';

      throw new Error(errorMessage);
    }
    throw error;
  }
}

export function getConfig(): EnvConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

// Validation helpers
export function validateS3Config(config: EnvConfig): void {
  const requiredS3Fields = [
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ];
  const missingFields = requiredS3Fields.filter(
    field => !config[field as keyof EnvConfig]
  );

  if (missingFields.length > 0) {
    throw new Error(
      `S3 configuration incomplete. Missing: ${missingFields.join(', ')}`
    );
  }
}
