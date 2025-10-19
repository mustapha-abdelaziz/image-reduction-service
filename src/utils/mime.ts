import { fileTypeFromBuffer } from 'file-type';

export interface MimeValidationResult {
  valid: boolean;
  detectedType?: string;
  error?: string;
}

/**
 * Supported MIME types for input images
 */
export const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * MIME type to file extension mapping
 */
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * File extension to MIME type mapping
 */
export const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Validate file MIME type by sniffing the buffer content
 */
export async function validateMimeType(
  buffer: Buffer,
  declaredMimeType?: string
): Promise<MimeValidationResult> {
  try {
    const detectedType = await fileTypeFromBuffer(buffer);

    if (!detectedType) {
      return {
        valid: false,
        error: 'Could not detect file type from buffer',
      };
    }

    if (!SUPPORTED_MIME_TYPES.has(detectedType.mime)) {
      return {
        valid: false,
        detectedType: detectedType.mime,
        error: `Unsupported file type: ${detectedType.mime}. Supported types: ${Array.from(SUPPORTED_MIME_TYPES).join(', ')}`,
      };
    }

    // If a MIME type was declared, verify it matches the detected type
    if (declaredMimeType && declaredMimeType !== detectedType.mime) {
      return {
        valid: false,
        detectedType: detectedType.mime,
        error: `MIME type mismatch: declared ${declaredMimeType}, detected ${detectedType.mime}`,
      };
    }

    return {
      valid: true,
      detectedType: detectedType.mime,
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during MIME type validation',
    };
  }
}

/**
 * Get MIME type for output format
 */
export function getOutputMimeType(format: 'webp' | 'jpeg'): string {
  return format === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * Get file extension for MIME type
 */
export function getExtensionForMimeType(mimeType: string): string | undefined {
  return MIME_TO_EXTENSION[mimeType];
}

/**
 * Get MIME type for file extension
 */
export function getMimeTypeForExtension(extension: string): string | undefined {
  return EXTENSION_TO_MIME[extension.toLowerCase()];
}

/**
 * Validate file size
 */
export function validateFileSize(
  buffer: Buffer,
  maxSize: number
): { valid: boolean; error?: string } {
  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `File size ${buffer.length} bytes exceeds maximum allowed size ${maxSize} bytes`,
    };
  }

  return { valid: true };
}
