import sharp from 'sharp';

/**
 * Shape of the map marker made from a point's cover photo. Change it here and
 * deploy: points remember the spec their marker was made with, and the API
 * rebuilds every marker that differs when it starts. The app draws the
 * marker's outline from the same image, so the outline follows on its own.
 *
 * `size` is the side in pixels and must equal `MARKER_IMAGE_SIZE` in the
 * mobile app's MapHost, which scales the image from it. `cornerRadius` is a
 * share of the side: 0.5 is a circle, 0 a square. 0.25 matches the point
 * photo in the app's player sheet (56 px with 14 px corners).
 */
export const MARKER_IMAGE = { size: 200, cornerRadius: 0.25 } as const;

/** Bump when the drawing itself changes, so that existing markers are redrawn. */
const RENDERER_VERSION = 1;

/** What a stored marker was made with; any difference means it is out of date. */
export const MARKER_SPEC = `${MARKER_IMAGE.size}:${MARKER_IMAGE.cornerRadius}:v${RENDERER_VERSION}`;

/**
 * Crops the photo to a square around its most salient part, scales it down
 * and cuts the corners, writing a PNG with transparency.
 */
export async function renderMarker(
  sourcePath: string,
  targetPath: string,
  shape: { size: number; cornerRadius: number } = MARKER_IMAGE,
): Promise<void> {
  const { size } = shape;
  const radius = size * shape.cornerRadius;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`,
  );
  await sharp(sourcePath)
    // Phones store the camera's orientation in EXIF instead of turning the pixels.
    .rotate()
    .resize(size, size, { fit: 'cover', position: sharp.strategy.attention })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(targetPath);
}
