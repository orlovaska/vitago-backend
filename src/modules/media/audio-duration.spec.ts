import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audioDurationSeconds } from './audio-duration';

/** One constant-bitrate MPEG-1 Layer III frame: 128 kbps at 44.1 kHz. */
const CBR_FRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(413)]);
/** 1152 samples per frame at 44.1 kHz, so this many frames make about a second. */
const FRAMES_PER_SECOND = 44100 / 1152;

describe('audioDurationSeconds', () => {
  let dir: string;
  const file = (name: string) => join(dir, name);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vitago-audio-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('measures a constant-bitrate mp3 from its frames', async () => {
    const path = file('cbr.mp3');
    await writeFile(
      path,
      Buffer.concat(Array<Buffer>(Math.round(FRAMES_PER_SECOND * 5)).fill(CBR_FRAME)),
    );
    expect(await audioDurationSeconds(path, 'audio/mpeg')).toBe(5);
  });

  it('skips an ID3v2 tag in front of the audio', async () => {
    // A tag long enough to contain a byte pattern that looks like a frame sync.
    const body = Buffer.alloc(2048, 0xff);
    const tag = Buffer.concat([
      Buffer.from('ID3'),
      Buffer.from([0x03, 0x00, 0x00]),
      // Syncsafe length: 2048 = 0b100_0000_0000 over seven-bit groups.
      Buffer.from([0x00, 0x00, 0x10, 0x00]),
      body,
    ]);
    const path = file('tagged.mp3');
    await writeFile(
      path,
      Buffer.concat([tag, ...Array<Buffer>(Math.round(FRAMES_PER_SECOND * 2)).fill(CBR_FRAME)]),
    );
    expect(await audioDurationSeconds(path, 'audio/mpeg')).toBe(2);
  });

  it('prefers the exact frame count of a Xing header', async () => {
    // 900 frames is 23.5 s, while the bytes on disk are worth about 2 s: a
    // variable-bitrate file must be measured by its frame count, not its size.
    const first = Buffer.from(CBR_FRAME);
    first.write('Xing', 4 + 32, 'latin1');
    first.writeUInt32BE(0x1, 4 + 32 + 4);
    first.writeUInt32BE(900, 4 + 32 + 8);
    const path = file('vbr.mp3');
    await writeFile(path, Buffer.concat([first, ...Array<Buffer>(76).fill(CBR_FRAME)]));
    expect(await audioDurationSeconds(path, 'audio/mpeg')).toBe(Math.round((900 * 1152) / 44100));
  });

  it('reads the movie header of an mp4 container', async () => {
    const mvhd = Buffer.alloc(8 + 24);
    mvhd.writeUInt32BE(mvhd.length, 0);
    mvhd.write('mvhd', 4, 'latin1');
    mvhd.writeUInt32BE(1000, 8 + 12); // timescale: units per second
    mvhd.writeUInt32BE(12_500, 8 + 16); // duration in those units
    const moov = Buffer.alloc(8);
    moov.writeUInt32BE(8 + mvhd.length, 0);
    moov.write('moov', 4, 'latin1');
    const path = file('clip.m4a');
    await writeFile(path, Buffer.concat([moov, mvhd]));
    expect(await audioDurationSeconds(path, 'audio/mp4')).toBe(13);
  });

  it('returns null for what it cannot measure instead of failing an upload', async () => {
    const image = file('cover.png');
    await writeFile(image, Buffer.alloc(64));
    expect(await audioDurationSeconds(image, 'image/png')).toBeNull();

    const damaged = file('damaged.mp3');
    await writeFile(damaged, Buffer.alloc(64));
    expect(await audioDurationSeconds(damaged, 'audio/mpeg')).toBeNull();

    expect(await audioDurationSeconds(file('missing.mp3'), 'audio/mpeg')).toBeNull();
  });
});
