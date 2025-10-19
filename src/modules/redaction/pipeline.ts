import sharp from 'sharp';
import {
  Region,
  RedactionOperation,
  ProcessedImage,
  ImageMetadata,
  ImageFormat,
  PixelCoordinates
} from '@/modules/redaction/dtos.js';
import { processCoordinates, ImageDimensions } from '@/utils/coords.js';
import { generateETag } from '@/utils/hash.js';
import { measureAsync } from '@/utils/timing.js';
import { BLUR_SIZE_MAP, PIXELATE_SIZE_MAP } from '@/modules/redaction/schemas.js';
import { getConfig } from '@/config/env.js';

export class ImagePipelineError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'ImagePipelineError';
  }
}

/**
 * Get image metadata without full processing
 */
export async function getImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format || 'unknown',
      size: buffer.length,
      hasAlpha: metadata.hasAlpha || false,
    };
  } catch (error) {
    throw new ImagePipelineError(
      'Failed to extract image metadata',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Validate image dimensions against limits
 */
export function validateImageDimensions(metadata: ImageMetadata): void {
  const config = getConfig();
  const totalPixels = metadata.width * metadata.height;

  if (totalPixels > config.MAX_PIXELS) {
    throw new ImagePipelineError(
      `Image size ${metadata.width}x${metadata.height} (${totalPixels} pixels) exceeds maximum allowed ${config.MAX_PIXELS} pixels`
    );
  }
}

/**
 * Apply blur operation to a region
 */
async function applyBlur(
  image: sharp.Sharp,
  coords: PixelCoordinates,
  sigma: number
): Promise<sharp.Sharp> {
  // First convert to buffer to get the current state
  const currentBuffer = await image.toBuffer();

  // Extract the region from current state, blur it
  const region = await sharp(currentBuffer)
    .extract({
      left: coords.x,
      top: coords.y,
      width: coords.width,
      height: coords.height
    })
    .blur(sigma)
    .toBuffer();

  // Composite blurred region back onto current image
  return sharp(currentBuffer).composite([{
    input: region,
    left: coords.x,
    top: coords.y,
  }]);
}

/**
 * Apply pixelate operation to a region
 */
async function applyPixelate(
  image: sharp.Sharp,
  coords: PixelCoordinates,
  blockSize: number
): Promise<sharp.Sharp> {
  // First convert to buffer to get the current state
  const currentBuffer = await image.toBuffer();

  // Calculate pixelation dimensions
  const pixelWidth = Math.max(1, Math.floor(coords.width / blockSize));
  const pixelHeight = Math.max(1, Math.floor(coords.height / blockSize));

  // Extract region from current state, pixelate it
  const region = await sharp(currentBuffer)
    .extract({
      left: coords.x,
      top: coords.y,
      width: coords.width,
      height: coords.height
    })
    .resize(pixelWidth, pixelHeight, { kernel: 'nearest' })
    .resize(coords.width, coords.height, { kernel: 'nearest' })
    .toBuffer();

  // Composite pixelated region back onto current image
  return sharp(currentBuffer).composite([{
    input: region,
    left: coords.x,
    top: coords.y,
  }]);
}

/**
 * Apply fill operation to a region
 */
async function applyFill(
  image: sharp.Sharp,
  coords: PixelCoordinates,
  color: string
): Promise<sharp.Sharp> {
  // First convert to buffer to get the current state
  const currentBuffer = await image.toBuffer();

  // Convert hex color to RGBA
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;

  // Create solid color overlay
  const overlay = await sharp({
    create: {
      width: coords.width,
      height: coords.height,
      channels: 4,
      background: { r, g, b, alpha: a / 255 }
    }
  }).png().toBuffer();

  // Composite fill onto current image
  return sharp(currentBuffer).composite([{
    input: overlay,
    left: coords.x,
    top: coords.y,
    blend: 'over',
  }]);
}

/**
 * Apply a single redaction operation
 */
async function applyOperation(
  image: sharp.Sharp,
  coords: PixelCoordinates,
  operation: RedactionOperation
): Promise<sharp.Sharp> {
  switch (operation.type) {
    case 'blur':
      return applyBlur(image, coords, BLUR_SIZE_MAP[operation.size]);

    case 'pixelate':
      return applyPixelate(image, coords, PIXELATE_SIZE_MAP[operation.size]);

    case 'fill':
      return applyFill(image, coords, operation.color);

    default:
      throw new ImagePipelineError(`Unknown operation type: ${(operation as any).type}`);
  }
}

/**
 * Process image with redaction regions
 */
export async function processImage(
  inputBuffer: Buffer,
  regions: Region[],
  outputFormat: ImageFormat = 'webp',
  quality?: number
): Promise<ProcessedImage> {
  const { result, durationMs } = await measureAsync(async () => {
    try {
      // Get image metadata and validate
      const metadata = await getImageMetadata(inputBuffer);
      validateImageDimensions(metadata);

      const dimensions: ImageDimensions = {
        width: metadata.width,
        height: metadata.height,
      };

      // Initialize Sharp with deterministic options
      let image = sharp(inputBuffer, {
        failOnError: true,
        sequentialRead: true,
      });

      // Normalize EXIF orientation
      image = image.rotate();

      // Apply each redaction operation
      for (const region of regions) {
        const pixelCoords = processCoordinates(region.coordinates, dimensions);
        image = await applyOperation(image, pixelCoords, region.operation);
      }

      // Configure output format with deterministic options
      const config = getConfig();
      const outputQuality = quality || config.DEFAULT_QUALITY;

      if (outputFormat === 'webp') {
        image = image.webp({
          quality: outputQuality,
          effort: 6, // Deterministic encoding effort
          lossless: false,
        });
      } else {
        image = image.jpeg({
          quality: outputQuality,
          chromaSubsampling: '4:2:0', // Deterministic chroma subsampling
          mozjpeg: true,
        });
      }

      // Generate final image buffer
      const buffer = await image.toBuffer();
      const etag = generateETag(buffer);

      return {
        buffer,
        format: outputFormat,
        etag,
        processingTimeMs: 0, // Will be filled by measureAsync
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      if (error instanceof ImagePipelineError) {
        throw error;
      }

      throw new ImagePipelineError(
        'Image processing failed',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  });

  return {
    ...result,
    processingTimeMs: durationMs,
  };
}
