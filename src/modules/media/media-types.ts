/** File types the admin may upload, with the extension used in storage keys. */
export const ALLOWED_MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  /** Route geometry and other structured content. */
  'application/json': 'json',
  /** Legal documents. */
  'application/pdf': 'pdf',
} as const;

export type MediaType = keyof typeof ALLOWED_MEDIA_TYPES;

export function isAllowedMediaType(mimeType: string): mimeType is MediaType {
  return Object.hasOwn(ALLOWED_MEDIA_TYPES, mimeType);
}
