import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getConfig, validateS3Config } from '@/config/env.js';
import { getOutputMimeType } from '@/utils/mime.js';
import { Readable } from 'stream';

export class S3ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public cause?: Error
  ) {
    super(message);
    this.name = 'S3ServiceError';
  }
}

export interface S3ObjectReference {
  bucket: string;
  key: string;
}

export interface S3UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * S3 service for streaming operations
 */
export class S3Service {
  private client: S3Client;
  private config = getConfig();

  constructor() {
    // Validate S3 configuration only if S3 credentials are partially configured
    // This allows the service to start in test mode without S3
    const hasAnyS3Config =
      this.config.S3_REGION ||
      this.config.S3_ACCESS_KEY_ID ||
      this.config.S3_SECRET_ACCESS_KEY;

    if (hasAnyS3Config) {
      validateS3Config(this.config);
    }

    this.client = new S3Client({
      region: this.config.S3_REGION || 'us-east-1',
      credentials:
        this.config.S3_ACCESS_KEY_ID && this.config.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: this.config.S3_ACCESS_KEY_ID,
              secretAccessKey: this.config.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      endpoint: this.config.S3_ENDPOINT,
      forcePathStyle: !!this.config.S3_ENDPOINT, // Required for MinIO/custom endpoints
    });
  }

  /**
   * Download object from S3 as buffer
   */
  async getObject(bucket: string, key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as Readable;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NoSuchKey') {
          throw new S3ServiceError(
            `Object not found: s3://${bucket}/${key}`,
            'OBJECT_NOT_FOUND',
            404,
            error
          );
        }

        if (error.name === 'NoSuchBucket') {
          throw new S3ServiceError(
            `Bucket not found: ${bucket}`,
            'BUCKET_NOT_FOUND',
            404,
            error
          );
        }

        if (error.name === 'AccessDenied') {
          throw new S3ServiceError(
            `Access denied to s3://${bucket}/${key}`,
            'ACCESS_DENIED',
            403,
            error
          );
        }
      }

      throw new S3ServiceError(
        `Failed to download object from S3: ${error instanceof Error ? error.message : String(error)}`,
        'S3_DOWNLOAD_ERROR',
        500,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Upload buffer to S3
   */
  async putObject(
    bucket: string,
    key: string,
    buffer: Buffer,
    options: S3UploadOptions = {}
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType,
        Metadata: options.metadata,
        ContentLength: buffer.length,
      });

      await this.client.send(command);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NoSuchBucket') {
          throw new S3ServiceError(
            `Bucket not found: ${bucket}`,
            'BUCKET_NOT_FOUND',
            404,
            error
          );
        }

        if (error.name === 'AccessDenied') {
          throw new S3ServiceError(
            `Access denied to s3://${bucket}/${key}`,
            'ACCESS_DENIED',
            403,
            error
          );
        }
      }

      throw new S3ServiceError(
        `Failed to upload object to S3: ${error instanceof Error ? error.message : String(error)}`,
        'S3_UPLOAD_ERROR',
        500,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Check if object exists
   */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'NoSuchKey' || error.name === 'NotFound')
      ) {
        return false;
      }

      // Re-throw other errors (access denied, bucket not found, etc.)
      throw error;
    }
  }

  /**
   * Generate S3 object URL for reference
   */
  getObjectUrl(bucket: string, key: string): string {
    const endpoint =
      this.config.S3_ENDPOINT ||
      `https://s3.${this.config.S3_REGION}.amazonaws.com`;
    return `${endpoint}/${bucket}/${key}`;
  }

  /**
   * Get content type for output format
   */
  getContentTypeForFormat(format: 'webp' | 'jpeg'): string {
    return getOutputMimeType(format);
  }
}
