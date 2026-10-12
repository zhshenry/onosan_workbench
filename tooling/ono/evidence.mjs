// Standalone bounded PNG decoder used by image-normalization security tests.
// No scheduler, approval protocol, policy pin, state store, network access or visual-approval claim.
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
const hash = value => createHash('sha256').update(value).digest('hex');
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deliberately narrow decoder: PNG, 8-bit RGBA, non-interlaced only. Unsupported formats fail closed.
 * Reconstructs all scanlines; signature/dimensions alone are not decode or visual review.
 */
export function decodePng(input) {
  const bytes = Buffer.from(input);
  requireThat(bytes.length <= 20_000_000 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'PNG_SIGNATURE_OR_SIZE');
  let offset = 8, width, height, ended = false, dataStarted = false;
  const data = [];
  while (offset < bytes.length) {
    requireThat(offset + 12 <= bytes.length, 'PNG_TRUNCATED');
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    requireThat(end <= bytes.length, 'PNG_TRUNCATED');
    const type = bytes.toString('ascii', offset + 4, offset + 8), chunk = bytes.subarray(offset + 8, end - 4);
    requireThat(crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4), 'PNG_CRC');
    if (type === 'IHDR') {
      requireThat(offset === 8 && length === 13, 'PNG_HEADER');
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      requireThat(width > 0 && height > 0 && width * height <= 4_000_000 &&
        chunk[8] === 8 && chunk[9] === 6 && chunk[10] === 0 && chunk[11] === 0 && chunk[12] === 0, 'PNG_UNSUPPORTED_OR_TOO_LARGE');
    } else if (type === 'IDAT') {
      requireThat(width && !ended, 'PNG_ORDER'); dataStarted = true; data.push(chunk);
    } else if (type === 'IEND') {
      requireThat(length === 0 && dataStarted && end === bytes.length, 'PNG_END'); ended = true;
    } else {
      // No ancillary chunks in v1: avoids claiming arbitrary PNG/browser rendering support.
      throw new Error('PNG_UNSUPPORTED_CHUNK');
    }
    offset = end;
  }
  requireThat(ended, 'PNG_NO_END');
  const stride = width * 4, size = (stride + 1) * height;
  const packed = Buffer.concat(data);
  const decoded = inflateSync(packed, { maxOutputLength: size, info: true });
  requireThat(decoded.engine.bytesWritten === packed.length && decoded.buffer.length === size, 'PNG_DEFLATE_LENGTH');
  const raw = decoded.buffer, pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]; requireThat(filter <= 4, 'PNG_FILTER');
    for (let col = 0; col < stride; col++) {
      const i = row * stride + col;
      const a = col >= 4 ? pixels[i - 4] : 0, b = row ? pixels[i - stride] : 0, c = row && col >= 4 ? pixels[i - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      pixels[i] = (raw[row * (stride + 1) + col + 1] + predictor) & 255;
    }
  }
  return { width, height, pixelDigest: hash(pixels) };
}
