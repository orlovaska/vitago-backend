import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MARKER_IMAGE, renderMarker } from './marker-image';

/** Alpha of one pixel of a rendered marker. */
async function alphaAt(path: string, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3]!;
}

describe('renderMarker', () => {
  let dir: string;
  let photo: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vitago-marker-'));
    photo = join(dir, 'photo.jpg');
    // Landscape and opaque, like the cover photos: the crop has to square it.
    await sharp({ create: { width: 640, height: 400, channels: 3, background: '#3a7' } })
      .jpeg()
      .toFile(photo);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('squares the photo to the marker size and rounds its corners', async () => {
    const out = join(dir, 'marker.png');
    await renderMarker(photo, out);

    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({
      format: 'png',
      width: MARKER_IMAGE.size,
      height: MARKER_IMAGE.size,
      hasAlpha: true,
    });
    const middle = MARKER_IMAGE.size / 2;
    expect(await alphaAt(out, 0, 0)).toBe(0);
    expect(await alphaAt(out, middle, middle)).toBe(255);
    // The middle of an edge is never cut, whatever the rounding.
    expect(await alphaAt(out, middle, 1)).toBe(255);
  });

  it('follows the corner radius', async () => {
    const circle = join(dir, 'circle.png');
    await renderMarker(photo, circle, { size: 100, cornerRadius: 0.5 });
    expect(await alphaAt(circle, 12, 12)).toBe(0);

    const square = join(dir, 'square.png');
    await renderMarker(photo, square, { size: 100, cornerRadius: 0 });
    expect(await alphaAt(square, 0, 0)).toBe(255);

    const rounded = join(dir, 'rounded.png');
    await renderMarker(photo, rounded, { size: 100, cornerRadius: 0.2 });
    expect(await alphaAt(rounded, 0, 0)).toBe(0);
    // A point on the diagonal the circle would cut away but a 20 px corner keeps.
    expect(await alphaAt(rounded, 12, 12)).toBe(255);
  });

  it('rejects a file that is not an image', async () => {
    const text = join(dir, 'not-an-image.jpg');
    await writeFile(text, 'hello');
    await expect(renderMarker(text, join(dir, 'broken.png'))).rejects.toThrow();
  });
});
