export class RedactionError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RedactionError';
  }
}

export class ValidationError extends RedactionError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class LimitExceededError extends RedactionError {
  constructor(message: string, details?: unknown) {
    super(message, 'LIMIT_EXCEEDED', 413, details);
    this.name = 'LimitExceededError';
  }
}

export class UnsupportedMediaError extends RedactionError {
  constructor(message: string, details?: unknown) {
    super(message, 'UNSUPPORTED_MEDIA', 415, details);
    this.name = 'UnsupportedMediaError';
  }
}

export class S3Error extends RedactionError {
  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, 'S3_ERROR', statusCode, details);
    this.name = 'S3Error';
  }
}

export class PipelineError extends RedactionError {
  constructor(message: string, details?: unknown) {
    super(message, 'PIPELINE_ERROR', 500, details);
    this.name = 'PipelineError';
  }
}

export class RateLimitedError extends RedactionError {
  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMITED', 429, { retryAfter });
    this.name = 'RateLimitedError';
  }
}

export class InternalError extends RedactionError {
  constructor(message: string, details?: unknown) {
    super(message, 'INTERNAL_ERROR', 500, details);
    this.name = 'InternalError';
  }
}

/**
 * Convert service errors to standardized RedactionError
 */
export function normalizeError(error: unknown): RedactionError {
  if (error instanceof RedactionError) {
    return error;
  }

  if (error instanceof Error) {
    // Map known error types
    if (error.name === 'ValidationError') {
      return new ValidationError(error.message);
    }

    if (
      error.name === 'PayloadTooLargeError' ||
      error.message.includes('exceeds maximum')
    ) {
      return new LimitExceededError(error.message);
    }

    if (
      error.message.includes('MIME') ||
      error.message.includes('Unsupported')
    ) {
      return new UnsupportedMediaError(error.message);
    }

    if (error.name === 'ImagePipelineError') {
      return new PipelineError(error.message);
    }

    if (error.name === 'S3ServiceError') {
      const s3Error = error as any;
      return new S3Error(s3Error.message, s3Error.statusCode || 500);
    }

    if (error.name === 'RedactionServiceError') {
      const serviceError = error as any;
      return new RedactionError(
        serviceError.message,
        serviceError.code || 'INTERNAL_ERROR',
        serviceError.statusCode || 500
      );
    }

    return new InternalError(error.message);
  }

  return new InternalError('Unknown error occurred');
}
