import { createHash } from 'crypto';

/**
 * Generate SHA256 hash of buffer and return as hex string
 */
export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate ETag from buffer (quoted hex hash)
 */
export function generateETag(buffer: Buffer): string {
  return `"${sha256Buffer(buffer)}"`;
}

/**
 * Generate deterministic hash for request inputs
 * Used for idempotency keys and caching
 */
export function generateRequestHash(inputs: Record<string, unknown>): string {
  // Sort keys to ensure deterministic ordering
  const sortedInputs = Object.keys(inputs)
    .sort()
    .reduce((acc, key) => {
      acc[key] = inputs[key];
      return acc;
    }, {} as Record<string, unknown>);

  const inputString = JSON.stringify(sortedInputs);
  return createHash('sha256').update(inputString).digest('hex');
}

/**
 * Generate secure random string for job IDs, etc.
 */
export function generateRandomId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}
