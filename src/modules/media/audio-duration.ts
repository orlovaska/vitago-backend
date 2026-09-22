import { open } from 'node:fs/promises';

/**
 * How long a recording plays, read from the file itself. Content import and
 * admin uploads both pass through here, so the length of narration is never
 * typed in by hand and cannot drift away from the audio.
 *
 * Unreadable or damaged files return null: an upload is not worth failing over
 * a duration, the app simply shows no length for that recording.
 */
export async function audioDurationSeconds(path: string, mimeType: string): Promise<number | null> {
  try {
    const seconds =
      mimeType === 'audio/mpeg'
        ? await mp3Duration(path)
        : mimeType === 'audio/mp4'
          ? await mp4Duration(path)
          : null;
    return seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  } catch {
    return null;
  }
}

//  MP3

const BITRATES_KBPS = {
  // [version][layer] where layer is 1..3; index 0 is the "free" bitrate we reject.
  mpeg1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  mpeg2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
} as const;

const SAMPLE_RATES = {
  mpeg1: [44100, 48000, 32000],
  mpeg2: [22050, 24000, 16000],
  mpeg25: [11025, 12000, 8000],
} as const;

interface FrameHeader {
  /** MPEG audio version, as used by the tables above. */
  family: 'mpeg1' | 'mpeg2';
  isMpeg1: boolean;
  layer: 1 | 2 | 3;
  bitrateKbps: number;
  sampleRate: number;
  samplesPerFrame: number;
  mono: boolean;
}

/**
 * Duration of an MPEG audio file. A variable-bitrate file carries its frame
 * count in a Xing/Info or VBRI header, which is exact; a constant-bitrate file
 * has none, and there the audio size divided by the bitrate is exact enough.
 */
async function mp3Duration(path: string): Promise<number | null> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const start = await id3v2Size(handle);
    // A frame header appears within the first few kilobytes of audio unless the
    // file is junk; reading a window keeps large uploads out of memory.
    const window = Buffer.alloc(Math.min(64 * 1024, Math.max(size - start, 0)));
    if (window.length === 0) return null;
    await handle.read(window, 0, window.length, start);

    const frameOffset = findFrame(window);
    if (frameOffset == null) return null;
    const header = parseFrameHeader(window, frameOffset)!;

    const frames = vbrFrameCount(window, frameOffset, header);
    if (frames != null) {
      return (frames * header.samplesPerFrame) / header.sampleRate;
    }

    const audioBytes = size - (start + frameOffset) - (await id3v1Size(handle, size));
    return (audioBytes * 8) / (header.bitrateKbps * 1000);
  } finally {
    await handle.close();
  }
}

/** Length of the ID3v2 tag in front of the audio, or 0 when there is none. */
async function id3v2Size(handle: Awaited<ReturnType<typeof open>>): Promise<number> {
  const head = Buffer.alloc(10);
  const { bytesRead } = await handle.read(head, 0, 10, 0);
  if (bytesRead < 10 || head.toString('latin1', 0, 3) !== 'ID3') return 0;
  // Syncsafe integer: seven bits per byte, so a tag can never fake a frame sync.
  const size =
    ((head[6]! & 0x7f) << 21) |
    ((head[7]! & 0x7f) << 14) |
    ((head[8]! & 0x7f) << 7) |
    (head[9]! & 0x7f);
  const hasFooter = (head[5]! & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

/** ID3v1 is a fixed 128-byte trailer; it is not audio and must not be counted. */
async function id3v1Size(handle: Awaited<ReturnType<typeof open>>, size: number): Promise<number> {
  if (size < 128) return 0;
  const tail = Buffer.alloc(3);
  await handle.read(tail, 0, 3, size - 128);
  return tail.toString('latin1') === 'TAG' ? 128 : 0;
}

/** Offset of the first frame whose header is followed by another frame. */
function findFrame(buffer: Buffer): number | null {
  for (let offset = 0; offset + 4 <= buffer.length; offset++) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1]! & 0xe0) !== 0xe0) continue;
    const header = parseFrameHeader(buffer, offset);
    if (!header) continue;
    // Guard against a byte pattern that merely looks like a sync: the next
    // frame has to start exactly where this one ends.
    const next = offset + frameLength(header);
    if (next + 4 > buffer.length) return offset;
    if (buffer[next] === 0xff && (buffer[next + 1]! & 0xe0) === 0xe0) return offset;
  }
  return null;
}

function parseFrameHeader(buffer: Buffer, offset: number): FrameHeader | null {
  const b1 = buffer[offset + 1]!;
  const b2 = buffer[offset + 2]!;
  const b3 = buffer[offset + 3]!;

  const versionBits = (b1 >> 3) & 0b11;
  const layerBits = (b1 >> 1) & 0b11;
  if (versionBits === 0b01 || layerBits === 0b00) return null;

  const layer = (4 - layerBits) as 1 | 2 | 3;
  const isMpeg1 = versionBits === 0b11;
  const family = isMpeg1 ? 'mpeg1' : 'mpeg2';
  const rates =
    versionBits === 0b10 ? SAMPLE_RATES.mpeg2 : isMpeg1 ? SAMPLE_RATES.mpeg1 : SAMPLE_RATES.mpeg25;

  const bitrateKbps = BITRATES_KBPS[family][layer][(b2 >> 4) & 0b1111] ?? 0;
  const sampleRate = rates[(b2 >> 2) & 0b11] ?? 0;
  if (bitrateKbps === 0 || sampleRate === 0) return null;

  return {
    family,
    isMpeg1,
    layer,
    bitrateKbps,
    sampleRate,
    samplesPerFrame: layer === 1 ? 384 : layer === 2 ? 1152 : isMpeg1 ? 1152 : 576,
    mono: ((b3 >> 6) & 0b11) === 0b11,
  };
}

function frameLength(header: FrameHeader): number {
  const bitrate = header.bitrateKbps * 1000;
  if (header.layer === 1) {
    return Math.floor((12 * bitrate) / header.sampleRate) * 4;
  }
  const factor = header.layer === 3 && !header.isMpeg1 ? 72 : 144;
  return Math.floor((factor * bitrate) / header.sampleRate);
}

/** Exact frame count from the Xing/Info or VBRI header, when the encoder wrote one. */
function vbrFrameCount(buffer: Buffer, frameOffset: number, header: FrameHeader): number | null {
  const sideInfo = header.isMpeg1 ? (header.mono ? 17 : 32) : header.mono ? 9 : 17;
  const xing = frameOffset + 4 + sideInfo;
  if (xing + 12 <= buffer.length) {
    const tag = buffer.toString('latin1', xing, xing + 4);
    if (tag === 'Xing' || tag === 'Info') {
      const flags = buffer.readUInt32BE(xing + 4);
      // Bit 0 says the frame count is present; without it the header is useless here.
      if ((flags & 0x1) !== 0) return buffer.readUInt32BE(xing + 8);
      return null;
    }
  }
  const vbri = frameOffset + 4 + 32;
  if (vbri + 18 <= buffer.length && buffer.toString('latin1', vbri, vbri + 4) === 'VBRI') {
    return buffer.readUInt32BE(vbri + 14);
  }
  return null;
}

//  MP4 / M4A

/**
 * Duration of an MPEG-4 container, taken from the movie header (`mvhd`) inside
 * `moov`: a duration in timescale units, which is what the muxer measured.
 */
async function mp4Duration(path: string): Promise<number | null> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const moov = await findAtom(handle, 'moov', 0, size);
    if (!moov) return null;
    const mvhd = await findAtom(handle, 'mvhd', moov.body, moov.end);
    if (!mvhd) return null;

    const header = Buffer.alloc(Math.min(32, mvhd.end - mvhd.body));
    await handle.read(header, 0, header.length, mvhd.body);
    const version = header[0];
    if (version === 1) {
      if (header.length < 28) return null;
      const timescale = header.readUInt32BE(20);
      const duration = Number(header.readBigUInt64BE(24));
      return timescale > 0 ? duration / timescale : null;
    }
    if (header.length < 20) return null;
    const timescale = header.readUInt32BE(12);
    const duration = header.readUInt32BE(16);
    return timescale > 0 ? duration / timescale : null;
  } finally {
    await handle.close();
  }
}

interface Atom {
  /** First byte after the atom header, where its payload begins. */
  body: number;
  /** First byte after the atom. */
  end: number;
}

/** Scans the atoms between `from` and `until` for one of the given type. */
async function findAtom(
  handle: Awaited<ReturnType<typeof open>>,
  type: string,
  from: number,
  until: number,
): Promise<Atom | null> {
  let offset = from;
  const head = Buffer.alloc(16);
  while (offset + 8 <= until) {
    const { bytesRead } = await handle.read(head, 0, 16, offset);
    if (bytesRead < 8) return null;
    let size = head.readUInt32BE(0);
    let body = offset + 8;
    if (size === 1) {
      if (bytesRead < 16) return null;
      size = Number(head.readBigUInt64BE(8));
      body = offset + 16;
    } else if (size === 0) {
      size = until - offset;
    }
    if (size < 8) return null;
    const end = Math.min(offset + size, until);
    if (head.toString('latin1', 4, 8) === type) return { body, end };
    offset = end;
  }
  return null;
}
