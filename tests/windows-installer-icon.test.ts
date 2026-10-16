import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
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
  return Array.from({ length: buf.readUInt16LE(4) }, (_, index) => {
    const at = 6 + index * 16;
    const bytes = buf.readUInt32LE(at + 8), offset = buf.readUInt32LE(at + 12);
    assert.ok(bytes > 0 && offset >= 6 + buf.readUInt16LE(4) * 16 && offset + bytes <= buf.length);
    return { width: buf[at] || 256, height: buf[at + 1] || 256, bitCount: buf.readUInt16LE(at + 6), image: buf.subarray(offset, offset + bytes) };
  });
}

test('Windows 应用、安装器和卸载器明确共用原始原子轨道图标', () => {
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
  assert.equal(pkg.build.nsis.installerIcon, 'assets/icon.ico');
  assert.equal(pkg.build.nsis.uninstallerIcon, 'assets/icon.ico');
  assert.equal(pkg.build.win.signExecutable, false);
  assert.ok(pkg.build.files.includes('assets/icon.ico'));
  assert.ok(pkg.build.files.includes('assets/tray.png'));
});

test('原始 ICO 保留 16/32/48/256 帧及其真实位图或 PNG 编码', () => {
  const frames = icoFrames(ico);
  assert.deepEqual(frames.map(frame => frame.width), [16, 32, 48, 256]);
  for (const frame of frames) {
    assert.equal(frame.height, frame.width);
    assert.equal(frame.bitCount, 32);
    if (frame.image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
      assert.equal(pngSize(frame.image).width, frame.width);
    } else {
      assert.equal(frame.image.readUInt32LE(0), 40);
      assert.equal(frame.image.readInt32LE(4), frame.width);
      assert.equal(frame.image.readInt32LE(8), frame.height * 2);
      assert.equal(frame.image.readUInt16LE(14), frame.bitCount);
    }
  }
});

test('托盘和通知 PNG 与 ICO 内嵌的 256px 原始图片完全一致', () => {
  assert.deepEqual(pngSize(source), { width: 256, height: 256, colorType: 6 });
  assert.deepEqual(source, icoFrames(ico).find(frame => frame.width === 256)!.image);
  assert.deepEqual(tray, source);
});

test('外部图标保持 v0.2.0 原始资源指纹，避免被圆环图或其他默认安装图替换', () => {
  const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
  assert.equal(digest(ico), '5459056126ab45350c04e42e5fe4f85acd8a3c77b7b671d14e86830ad25368ad');
  assert.equal(digest(source), 'f6d386ce78023523091cd810437c7994531c4b739712841e69572487f36fb43b');
});
