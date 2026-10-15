import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateBrandAssets } from '../tooling/gen-icon.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
const ico = readFileSync(new URL('../assets/icon.ico', import.meta.url));
const source = readFileSync(new URL('../assets/icon-source.png', import.meta.url));
const tray = readFileSync(new URL('../assets/tray.png', import.meta.url));

function pngSize(buf: Buffer) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

function icoFrames(buf: Buffer) {
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1);
  const count = buf.readUInt16LE(4);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const width = buf[at] || 256;
    const height = buf[at + 1] || 256;
    const bytes = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    const dib = buf.subarray(offset, offset + 40);
    frames.push({
      width,
      height,
      bitCount: buf.readUInt16LE(at + 6),
      bytes,
      offset,
      headerSize: dib.readUInt32LE(0),
      dibWidth: dib.readInt32LE(4),
      dibHeight: dib.readInt32LE(8),
      dibBitCount: dib.readUInt16LE(14),
    });
  }
  return frames;
}

test('Windows 打包指向多尺寸品牌 ico，并继续带上托盘图', () => {
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
  assert.equal(pkg.build.nsis.installerIcon, 'assets/icon.ico');
  assert.equal(pkg.build.nsis.uninstallerIcon, 'assets/icon.ico');
  assert.equal(pkg.build.win.signExecutable, false);
  assert.ok(pkg.build.files.includes('assets/icon.ico'));
  assert.ok(pkg.build.files.includes('assets/tray.png'));
  assert.match(main, /assets\/tray\.png/);
});

test('icon.ico 含安装器需要的 16/32/48/256，且是 32 位 DIB', () => {
  const frames = icoFrames(ico);
  const sizes = frames.map((frame) => frame.width);
  assert.deepEqual(sizes, [16, 20, 24, 32, 40, 48, 64, 128, 256]);
  for (const frame of frames) {
    assert.equal(frame.height, frame.width);
    assert.equal(frame.bitCount, 32);
    assert.equal(frame.headerSize, 40);
    assert.equal(frame.dibWidth, frame.width);
    assert.equal(frame.dibHeight, frame.width * 2);
    assert.equal(frame.dibBitCount, 32);
    assert.ok(frame.offset + frame.bytes <= ico.length);
  }
});

test('高清源图是 1024 透明 PNG，托盘点仍是 16×16', () => {
  const icon = pngSize(source);
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.equal(icon.colorType, 6);
  const dot = pngSize(tray);
  assert.equal(dot.width, 16);
  assert.equal(dot.height, 16);
});

test('提交的图标与生成器一致，且圆环和轨道点都画得出来', () => {
  const generated = generateBrandAssets();
  assert.deepEqual(ico, generated.ico);
  assert.deepEqual(source, generated.sourcePng);
  assert.deepEqual(tray, generated.trayPng);

  const frame = icoFrames(ico).find((item) => item.width === 48);
  assert.ok(frame);
  const xor = ico.subarray(frame.offset + 40, frame.offset + 40 + 48 * 48 * 4);
  let dark = 0;
  let blue = 0;
  let clear = 0;
  for (let i = 0; i < xor.length; i += 4) {
    const b = xor[i];
    const g = xor[i + 1];
    const r = xor[i + 2];
    const a = xor[i + 3];
    if (a < 16) clear += 1;
    if (a > 200 && r < 50 && g < 55 && b < 60) dark += 1;
    if (a > 200 && b > r && b > g && b > 120) blue += 1;
  }
  assert.ok(clear > 40, 'corners stay transparent');
  assert.ok(dark > 80, 'ink ring is present');
  assert.ok(blue > 8, 'accent orbit dot is present');
});
