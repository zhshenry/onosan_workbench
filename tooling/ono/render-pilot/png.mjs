// Bounded adapter for browser PNGs. Production evidence policy stays unchanged.
import { deflateSync, inflateSync } from 'node:zlib';
const need = (ok, code) => { if (!ok) throw new Error(code); };
export function crc32(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); }
  return (n ^ 0xffffffff) >>> 0;
}
export function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
}
export function encodeRgba(width, height, pixels) {
  need(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 && width * height <= 4_000_000 && pixels.length === width * height * 4, 'PIXEL_LIMIT');
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export function normalizePng(input) {
  const b = Buffer.from(input); need(b.length <= 20_000_000 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'PNG_SIGNATURE');
  let p = 8, width, height, channels, ended = false, idatEnded = false;
  const data = [];
  while (p < b.length) {
    need(p + 12 <= b.length, 'PNG_TRUNCATED');
    const len = b.readUInt32BE(p), end = p + len + 12; need(end <= b.length, 'PNG_TRUNCATED');
    const type = b.toString('ascii', p + 4, p + 8), value = b.subarray(p + 8, end - 4);
    need(crc32(b.subarray(p + 4, end - 4)) === b.readUInt32BE(end - 4), 'PNG_CRC');
    if (type === 'IHDR') {
      need(p === 8 && len === 13, 'PNG_HEADER'); width = value.readUInt32BE(0); height = value.readUInt32BE(4);
      need(width > 0 && height > 0 && width * height <= 4_000_000 && value[8] === 8 && [2, 6].includes(value[9]) && value[10] === 0 && value[11] === 0 && value[12] === 0, 'PNG_FORMAT');
      channels = value[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') { need(width && !idatEnded, 'PNG_ORDER'); data.push(value); }
    else if (type === 'IEND') { need(len === 0 && data.length && end === b.length, 'PNG_END'); ended = true; }
    else {
      // Only known non-colour-transform metadata. Reject palette/transparency,
      // ICC/gamma/chromaticity, animation, unknown chunks rather than change appearance.
      need(width && ['pHYs', 'tEXt', 'iTXt', 'zTXt', 'tIME'].includes(type), 'PNG_UNSUPPORTED_CHUNK');
      if (data.length) idatEnded = true;
    }
    p = end;
  }
  need(ended, 'PNG_NO_END');
  const stride = width * channels, packed = Buffer.concat(data), size = height * (stride + 1);
  const decoded = inflateSync(packed, { maxOutputLength: size, info: true });
  need(decoded.buffer.length === size && decoded.engine.bytesWritten === packed.length, 'PNG_DEFLATE');
  const raw = decoded.buffer, pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; need(filter <= 4, 'PNG_FILTER');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? pixels[i - channels] : 0, up = y ? pixels[i - stride] : 0, c = y && x >= channels ? pixels[i - stride - channels] : 0;
      const estimate = a + up - c, pa = Math.abs(estimate - a), pb = Math.abs(estimate - up), pc = Math.abs(estimate - c);
      pixels[i] = (raw[y * (stride + 1) + x + 1] + [0, a, up, Math.floor((a + up) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? up : c][filter]) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { pixels.copy(rgba, i * 4, i * channels, i * channels + 3); rgba[i * 4 + 3] = channels === 4 ? pixels[i * 4 + 3] : 255; }
  return { width, height, bytes: encodeRgba(width, height, rgba), pixels: rgba };
}
