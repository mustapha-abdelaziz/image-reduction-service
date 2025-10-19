import { z } from 'zod';
import {
  multipartRedactionRequestSchema,
  s3RedactionRequestSchema,
  batchRequestSchema,
  s3RedactionResponseSchema,
  batchResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  regionSchema,
  outputConfigSchema,
  pixelCoordinatesSchema,
  normalizedCoordinatesSchema,
  s3ObjectSchema,
  batchItemSchema,
} from './schemas.js';

// Basic types
export type BlurSize = 'S' | 'M' | 'L';
export type PixelateSize = 'S' | 'M' | 'L';
export type ImageFormat = 'webp' | 'jpeg';

// Coordinate types
export type PixelCoordinates = z.infer<typeof pixelCoordinatesSchema>;
export type NormalizedCoordinates = z.infer<typeof normalizedCoordinatesSchema>;
export type Coordinates = PixelCoordinates | NormalizedCoordinates;

// Operation types
export type BlurOperation = {
  type: 'blur';
  size: BlurSize;
};

export type PixelateOperation = {
  type: 'pixelate';
  size: PixelateSize;
};

export type FillOperation = {
  type: 'fill';
  color: string;
};

export type RedactionOperation =
  | BlurOperation
  | PixelateOperation
  | FillOperation;

// Region type
export type Region = z.infer<typeof regionSchema>;

// Configuration types
export type OutputConfig = z.infer<typeof outputConfigSchema>;

// S3 types
export type S3Object = z.infer<typeof s3ObjectSchema>;

// Request types
export type MultipartRedactionRequest = z.infer<
  typeof multipartRedactionRequestSchema
>;
export type S3RedactionRequest = z.infer<typeof s3RedactionRequestSchema>;
export type BatchItem = z.infer<typeof batchItemSchema>;
export type BatchRequest = z.infer<typeof batchRequestSchema>;

// Response types
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type S3RedactionResponse = z.infer<typeof s3RedactionResponseSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Internal processing types
export interface ProcessedImage {
  buffer: Buffer;
  format: ImageFormat;
  etag: string;
  processingTimeMs: number;
  width: number;
  height: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
}

// Job types for batch processing
export interface JobItem {
  id: string;
  request: S3RedactionRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: S3RedactionResponse;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  items: JobItem[];
  webhookUrl?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
}

// Type guards
export function isPixelCoordinates(
  coords: Coordinates
): coords is PixelCoordinates {
  return (
    'x' in coords && 'y' in coords && 'width' in coords && 'height' in coords
  );
}

export function isNormalizedCoordinates(
  coords: Coordinates
): coords is NormalizedCoordinates {
  return (
    'x_norm' in coords &&
    'y_norm' in coords &&
    'w_norm' in coords &&
    'h_norm' in coords
  );
}
