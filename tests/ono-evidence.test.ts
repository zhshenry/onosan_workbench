import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { decodePng } from '../tooling/ono/evidence.mjs';

// Synthetic byte fixtures only: never design images, screenshots or visual approval.
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
function chunk(type: string, data: Uint8Array) {
  const payload = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
  for (const b of payload) {
    crc ^= b;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); payload.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function header(width = 1, height = 1, depth = 8, color = 6, interlace = 0) {
  const b = Buffer.alloc(13); b.writeUInt32BE(width, 0); b.writeUInt32BE(height, 4);
  b[8] = depth; b[9] = color; b[12] = interlace; return b;
}
const raw = (filter = 0) => Buffer.from([filter, 20, 30, 40, 255]);
function png(options: { filter?: number; head?: Buffer; packed?: Buffer; middle?: Buffer; tail?: Buffer } = {}) {
  return Buffer.concat([signature, chunk('IHDR', options.head ?? header()),
    chunk('IDAT', options.packed ?? deflateSync(raw(options.filter))),
    options.middle ?? Buffer.alloc(0), chunk('IEND', Buffer.alloc(0)), options.tail ?? Buffer.alloc(0)]);
}

test('standalone PNG decoder preserves all supported filter reconstruction', () => {
  for (let filter = 0; filter <= 4; filter++) {
    assert.deepEqual(decodePng(png({ filter })), { width: 1, height: 1, pixelDigest: hash(raw().subarray(1)) });
  }
});

test('PNG rejects signature-only, truncation, CRC damage, trailing data and invalid filter', () => {
  const corrupt = png(); corrupt[45] ^= 1;
  for (const bytes of [png().subarray(0, 8), png().subarray(0, 40), corrupt,
    png({ tail: Buffer.from('x') }), png({ filter: 5 })]) assert.throws(() => decodePng(bytes));
});

test('PNG enforces file size and decoded pixel bounds before allocating pixels', () => {
  const oversized = Buffer.alloc(20_000_001); signature.copy(oversized);
  assert.throws(() => decodePng(oversized), /PNG_SIGNATURE_OR_SIZE/);
  for (const h of [header(0), header(1, 0), header(4_000_001), header(2001, 2000)]) {
    assert.throws(() => decodePng(png({ head: h })), /PNG_UNSUPPORTED_OR_TOO_LARGE/);
  }
});

test('PNG rejects unsupported depth, color, interlace and chunks rather than claiming browser compatibility', () => {
  for (const h of [header(1, 1, 16), header(1, 1, 8, 2), header(1, 1, 8, 6, 1)]) {
    assert.throws(() => decodePng(png({ head: h })), /PNG_UNSUPPORTED_OR_TOO_LARGE/);
  }
  assert.throws(() => decodePng(png({ middle: chunk('tEXt', Buffer.from('fixture')) })), /PNG_UNSUPPORTED_CHUNK/);
});

test('PNG bounds inflate output and rejects short or trailing compressed streams', () => {
  assert.throws(() => decodePng(png({ packed: deflateSync(Buffer.alloc(10_000)) })));
  assert.throws(() => decodePng(png({ packed: deflateSync(Buffer.alloc(4)) })), /PNG_DEFLATE_LENGTH/);
  assert.throws(() => decodePng(png({ packed: Buffer.concat([deflateSync(raw()), Buffer.from('extra')]) })), /PNG_DEFLATE_LENGTH/);
});

test('PNG requires valid header/data/end ordering and a complete image', () => {
  assert.throws(() => decodePng(Buffer.concat([signature, chunk('IDAT', deflateSync(raw())), chunk('IEND', Buffer.alloc(0))])), /PNG_ORDER/);
  assert.throws(() => decodePng(Buffer.concat([signature, chunk('IHDR', header()), chunk('IEND', Buffer.alloc(0))])), /PNG_END/);
  assert.throws(() => decodePng(png().subarray(0, png().length - 12)), /PNG_NO_END/);
});
