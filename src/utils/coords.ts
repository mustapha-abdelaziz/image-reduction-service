import { Coordinates, PixelCoordinates, NormalizedCoordinates, isPixelCoordinates, isNormalizedCoordinates } from '@/modules/redaction/dtos.js';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Convert normalized coordinates to pixel coordinates
 */
export function normalizedToPixel(
  coords: NormalizedCoordinates,
  dimensions: ImageDimensions
): PixelCoordinates {
  return {
    x: Math.round(coords.x_norm * dimensions.width),
    y: Math.round(coords.y_norm * dimensions.height),
    width: Math.round(coords.w_norm * dimensions.width),
    height: Math.round(coords.h_norm * dimensions.height),
  };
}

/**
 * Convert any coordinate type to pixel coordinates
 */
export function toPixelCoordinates(
  coords: Coordinates,
  dimensions: ImageDimensions
): PixelCoordinates {
  if (isPixelCoordinates(coords)) {
    return coords;
  }

  if (isNormalizedCoordinates(coords)) {
    return normalizedToPixel(coords, dimensions);
  }

  throw new Error('Invalid coordinate type');
}

/**
 * Clamp coordinates to image bounds
 */
export function clampToImageBounds(
  coords: PixelCoordinates,
  dimensions: ImageDimensions
): PixelCoordinates {
  const x = Math.max(0, Math.min(coords.x, dimensions.width));
  const y = Math.max(0, Math.min(coords.y, dimensions.height));

  // Ensure the region doesn't exceed image bounds
  const maxWidth = dimensions.width - x;
  const maxHeight = dimensions.height - y;

  const width = Math.max(1, Math.min(coords.width, maxWidth));
  const height = Math.max(1, Math.min(coords.height, maxHeight));

  return { x, y, width, height };
}

/**
 * Validate and convert coordinates to clamped pixel coordinates
 */
export function processCoordinates(
  coords: Coordinates,
  dimensions: ImageDimensions
): PixelCoordinates {
  const pixelCoords = toPixelCoordinates(coords, dimensions);
  return clampToImageBounds(pixelCoords, dimensions);
}

/**
 * Check if coordinates are valid for given dimensions
 */
export function validateCoordinates(
  coords: Coordinates,
  dimensions: ImageDimensions
): { valid: boolean; error?: string } {
  try {
    if (isPixelCoordinates(coords)) {
      if (coords.x < 0 || coords.y < 0) {
        return { valid: false, error: 'Coordinates cannot be negative' };
      }

      if (coords.width <= 0 || coords.height <= 0) {
        return { valid: false, error: 'Width and height must be positive' };
      }

      if (coords.x >= dimensions.width || coords.y >= dimensions.height) {
        return { valid: false, error: 'Coordinates exceed image dimensions' };
      }

      return { valid: true };
    }

    if (isNormalizedCoordinates(coords)) {
      const { x_norm, y_norm, w_norm, h_norm } = coords;

      if (x_norm < 0 || x_norm > 1 || y_norm < 0 || y_norm > 1) {
        return { valid: false, error: 'Normalized coordinates must be between 0 and 1' };
      }

      if (w_norm <= 0 || h_norm <= 0) {
        return { valid: false, error: 'Normalized width and height must be positive' };
      }

      if (x_norm + w_norm > 1 || y_norm + h_norm > 1) {
        return { valid: false, error: 'Normalized region exceeds image bounds' };
      }

      return { valid: true };
    }

    return { valid: false, error: 'Invalid coordinate type' };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
