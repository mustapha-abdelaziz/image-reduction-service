import {
  Region,
  ProcessedImage,
  ImageFormat,
  MultipartRedactionRequest
} from '@/modules/redaction/dtos.js';
import { processImage, getImageMetadata, validateImageDimensions } from '@/modules/redaction/pipeline.js';
import { validateMimeType, validateFileSize } from '@/utils/mime.js';
import { getConfig } from '@/config/env.js';

export class RedactionServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public cause?: Error
  ) {
    super(message);
    this.name = 'RedactionServiceError';
  }
}

export interface RedactionOptions {
  format?: ImageFormat;
  quality?: number;
}

/**
 * Main redaction service for processing images
 */
export class RedactionService {
  private config = getConfig();

  /**
   * Validate input buffer and extract metadata
   */
  async validateInput(
    buffer: Buffer,
    declaredMimeType?: string
  ): Promise<void> {
    // Validate file size
    const sizeValidation = validateFileSize(buffer, this.config.MAX_BYTES);
    if (!sizeValidation.valid) {
      throw new RedactionServiceError(
        sizeValidation.error!,
        'PAYLOAD_TOO_LARGE',
        413
      );
    }

    // Validate MIME type
    const mimeValidation = await validateMimeType(buffer, declaredMimeType);
    if (!mimeValidation.valid) {
      throw new RedactionServiceError(
        mimeValidation.error!,
        'UNSUPPORTED_MEDIA_TYPE',
        415
      );
    }

    // Validate image dimensions
    try {
      const metadata = await getImageMetadata(buffer);
      validateImageDimensions(metadata);
    } catch (error) {
      if (error instanceof Error && error.message.includes('exceeds maximum')) {
        throw new RedactionServiceError(
          error.message,
          'IMAGE_TOO_LARGE',
          413
        );
      }

      throw new RedactionServiceError(
        'Invalid image format or corrupted file',
        'INVALID_IMAGE',
        400,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Validate redaction regions
   */
  validateRegions(regions: Region[]): void {
    if (regions.length === 0) {
      throw new RedactionServiceError(
        'At least one redaction region is required',
        'VALIDATION_ERROR'
      );
    }

    if (regions.length > this.config.MAX_REGIONS) {
      throw new RedactionServiceError(
        `Too many regions: ${regions.length}. Maximum allowed: ${this.config.MAX_REGIONS}`,
        'TOO_MANY_REGIONS',
        400
      );
    }

    // Additional region-specific validation could be added here
    // For example, checking for overlapping regions, minimum sizes, etc.
  }

  /**
   * Process image with redaction regions
   */
  async redactImage(
    inputBuffer: Buffer,
    regions: Region[],
    options: RedactionOptions = {},
    declaredMimeType?: string
  ): Promise<ProcessedImage> {
    try {
      // Validate inputs
      await this.validateInput(inputBuffer, declaredMimeType);
      this.validateRegions(regions);

      // Set defaults
      const format = options.format || this.config.DEFAULT_FORMAT as ImageFormat;
      const quality = options.quality || this.config.DEFAULT_QUALITY;

      // Process the image
      const result = await processImage(inputBuffer, regions, format, quality);

      return result;
    } catch (error) {
      if (error instanceof RedactionServiceError) {
        throw error;
      }

      // Handle pipeline errors
      if (error instanceof Error && error.name === 'ImagePipelineError') {
        throw new RedactionServiceError(
          error.message,
          'PIPELINE_ERROR',
          500,
          error
        );
      }

      // Handle unexpected errors
      throw new RedactionServiceError(
        'Unexpected error during image processing',
        'INTERNAL_ERROR',
        500,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Process multipart redaction request
   */
  async processMultipartRequest(
    fileBuffer: Buffer,
    request: MultipartRedactionRequest,
    declaredMimeType?: string
  ): Promise<ProcessedImage> {
    const options: RedactionOptions = {
      format: request.output?.format,
      quality: request.output?.quality,
    };

    return this.redactImage(fileBuffer, request.regions, options, declaredMimeType);
  }
}
