// 生成托盘点与 Windows 安装器/应用图标。
// 托盘仍是 16×16 品牌蓝圆点。安装器图标按应用内 LogoMark
//（圆环 + 右上轨道点，src/icons.tsx）栅格化：浅色圆底保证深色任务栏可读，
// 圆环用 --ink，轨道点用 --acc-deep（小尺寸下比 --acc 更清楚）。
// 用法: node tooling/gen-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const INK = [0x1b, 0x1d, 0x22];
const ACC_DEEP = [0x4a, 0x67, 0xa3];
const DISC = [0xf4, 0xf6, 0xf8];
const DISC_EDGE = [0xc5, 0xc9, 0xd1];
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x + 0.5, y + 0.5, size);
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rgbaToPng(size, rgba) {
  return makePng(size, (x, y) => {
    const o = (Math.floor(y) * size + Math.floor(x)) * 4;
    return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]];
  });
}

function coverCircle(px, py, cx, cy, radius) {
  return Math.max(0, Math.min(1, radius - Math.hypot(px - cx, py - cy) + 0.5));
}

function coverRing(px, py, cx, cy, radius, stroke) {
  const distance = Math.hypot(px - cx, py - cy);
  const outer = Math.max(0, Math.min(1, radius + stroke / 2 - distance + 0.5));
  const inner = Math.max(0, Math.min(1, distance - (radius - stroke / 2) + 0.5));
  return outer * inner;
}

function blend(rgba, x, y, size, rgb, alpha) {
  if (alpha <= 0) return;
  const o = (y * size + x) * 4;
  const dstA = rgba[o + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) return;
  for (let i = 0; i < 3; i++) {
    const src = rgb[i] / 255;
    const dst = rgba[o + i] / 255;
    rgba[o + i] = Math.round(((src * alpha + dst * dstA * (1 - alpha)) / outA) * 255);
  }
  rgba[o + 3] = Math.round(outA * 255);
}

// LogoMark 在 24×24 视口中的几何。finalSize 决定小图标加粗，sampleScale 只提高采样。
function drawBrand(finalSize, sampleScale = 1) {
  const size = finalSize * sampleScale;
  const rgba = Buffer.alloc(size * size * 4);
  const pad = size * 0.08;
  const scale = (size - pad * 2) / 24;
  const pxOf = (v) => pad + v * scale;
  const cx = pxOf(12);
  const cy = pxOf(12);
  const ringR = 8 * scale;
  const minStroke = finalSize <= 20 ? 1.65 : finalSize <= 32 ? 1.8 : finalSize <= 48 ? 1.85 : 1.7;
  const stroke = Math.max(1.7 * scale, minStroke * sampleScale);
  const dotCx = pxOf(17.15);
  const dotCy = pxOf(6.85);
  // 小尺寸只略微加粗轨道点，避免 16px 上变成一大块色楔。
  const dotMin = finalSize <= 16 ? 1.45 : finalSize <= 24 ? 1.6 : finalSize <= 32 ? 1.85 : 0;
  const dotR = Math.max(2.15 * scale, dotMin * sampleScale);
  const discR = Math.max(ringR + stroke / 2, Math.hypot(dotCx - cx, dotCy - cy) + dotR) + 0.95 * scale;
  const edge = Math.max(sampleScale, Math.min(2.25 * sampleScale, size * 0.012));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const disc = coverCircle(px, py, cx, cy, discR);
      if (disc > 0) blend(rgba, x, y, size, DISC, disc);
      const rim = coverRing(px, py, cx, cy, discR - edge / 2, edge);
      if (rim > 0) blend(rgba, x, y, size, DISC_EDGE, rim);
      const ring = coverRing(px, py, cx, cy, ringR, stroke);
      if (ring > 0) blend(rgba, x, y, size, INK, ring);
      const dot = coverCircle(px, py, dotCx, dotCy, dotR);
      if (dot > 0) blend(rgba, x, y, size, ACC_DEEP, dot);
    }
  }
  return sampleScale === 1 ? rgba : downsample(rgba, size, finalSize);
}

function downsample(src, srcSize, dstSize) {
  const factor = srcSize / dstSize;
  const dst = Buffer.alloc(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const samples = factor * factor;
      for (let yy = 0; yy < factor; yy++) {
        for (let xx = 0; xx < factor; xx++) {
          const o = ((y * factor + yy) * srcSize + (x * factor + xx)) * 4;
          const pa = src[o + 3];
          r += src[o] * pa;
          g += src[o + 1] * pa;
          b += src[o + 2] * pa;
          a += pa;
        }
      }
      const o = (y * dstSize + x) * 4;
      if (a === 0) continue;
      dst[o] = Math.round(r / a);
      dst[o + 1] = Math.round(g / a);
      dst[o + 2] = Math.round(b / a);
      dst[o + 3] = Math.round(a / samples);
    }
  }
  return dst;
}

function dibImage(size, rgba) {
  const header = Buffer.alloc(40);
  const xorSize = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskSize = maskStride * size;
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(xorSize + maskSize, 20);
  const xor = Buffer.alloc(xorSize);
  const mask = Buffer.alloc(maskSize);
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const si = (srcY * size + x) * 4;
      const di = (y * size + x) * 4;
      xor[di] = rgba[si + 2];
      xor[di + 1] = rgba[si + 1];
      xor[di + 2] = rgba[si];
      xor[di + 3] = rgba[si + 3];
      if (rgba[si + 3] < 128) {
        mask[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([header, xor, mask]);
}

function makeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(count * 16);
  const blobs = images.map(({ size, rgba }) => dibImage(size, rgba));
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const size = images[i].size;
    const at = i * 16;
    entries[at] = size >= 256 ? 0 : size;
    entries[at + 1] = size >= 256 ? 0 : size;
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(blobs[i].length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += blobs[i].length;
  }
  return Buffer.concat([header, entries, ...blobs]);
}

export function generateBrandAssets() {
  // 玻璃蓝圆形托盘点(与品牌色 #2470b8 一致),带 1px 留白与边缘抗锯齿
  const trayPng = makePng(16, (x, y) => {
    const d = Math.hypot(x - 8, y - 8);
    const edge = 7 - d; // 正值在圆内
    const alpha = Math.max(0, Math.min(1, edge + 0.5));
    if (alpha <= 0) return [0, 0, 0, 0];
    return [36, 112, 184, Math.round(alpha * 255)];
  });
  const source = drawBrand(1024);
  const frames = ICO_SIZES.map((size) => ({
    size,
    rgba: drawBrand(size, size <= 48 ? 4 : 1),
  }));
  return {
    trayPng,
    sourcePng: rgbaToPng(1024, source),
    ico: makeIco(frames),
  };
}

const isDirectRun = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const assetsDir = join(root, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const { trayPng, sourcePng, ico } = generateBrandAssets();
  writeFileSync(join(assetsDir, 'tray.png'), trayPng);
  writeFileSync(join(assetsDir, 'icon-source.png'), sourcePng);
  writeFileSync(join(assetsDir, 'icon.ico'), ico);
  console.log(`assets/tray.png written, ${trayPng.length} bytes`);
  console.log(`assets/icon-source.png written, ${sourcePng.length} bytes`);
  console.log(`assets/icon.ico written, ${ico.length} bytes (${ICO_SIZES.join(', ')})`);
}
