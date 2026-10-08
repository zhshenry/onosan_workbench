import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync, renameSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { normalizePng, encodeRgba } from '../tooling/ono/render-pilot/png.mjs';
import { validateRenderContext, CANDIDATE, STATE } from '../tooling/ono/render-pilot/render.mjs';
import { checkManifest, publish } from '../tooling/ono/render-pilot/publish.mjs';

// All images below are generated test fixtures, never design or acceptance evidence.
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sha = 'a'.repeat(40);
const marker = '<!-- ono-prototype-render:render-test-approval -->';
const attachment = 'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc';
const baseEnv = {
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'zhshenry/onosan_workbench',
  GITHUB_REPOSITORY_ID: '1372377655', GITHUB_ACTOR: 'zhshenry', GITHUB_ACTOR_ID: '54107847', GITHUB_TRIGGERING_ACTOR: 'zhshenry',
  GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, APPROVED_SHA: sha, PROTOTYPE_STATE: STATE,
  GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', TARGET_ISSUE: '42',
  APPROVAL_ID: 'render-test-approval', POST_ATTACHMENT: 'true',
};

// Independent PNG fixture encoder: does not use the adapter's chunk or CRC helpers.
function pngChunk(type: string, data: Uint8Array = Buffer.alloc(0)) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); result.write(type, 4, 4, 'ascii'); Buffer.from(data).copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, result.length - 4)) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function header(width = 3, height = 5, channels = 3, patch: Record<number, number> = {}) {
  const value = Buffer.alloc(13);
  value.writeUInt32BE(width); value.writeUInt32BE(height, 4); value[8] = 8; value[9] = channels === 3 ? 2 : 6;
  for (const [index, byte] of Object.entries(patch)) value[Number(index)] = byte;
  return pngChunk('IHDR', value);
}
function paeth(a: number, b: number, c: number) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  if (da <= db && da <= dc) return a;
  return db <= dc ? b : c;
}
function fixture(channels = 3, filters = [0, 1, 2, 3, 4]) {
  const width = 3, height = filters.length, stride = width * channels;
  const pixels = Buffer.from(Array.from({ length: stride * height }, (_, i) => (i * 97 + Math.floor(i / stride) * 31) & 255));
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = filters[y]; rows[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? pixels[i - channels] : 0;
      const b = y ? pixels[i - stride] : 0, c = y && x >= channels ? pixels[i - stride - channels] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter] ?? 0;
      rows[y * (stride + 1) + x + 1] = (pixels[i] - predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels.copy(rgba, i * 4, i * channels, i * channels + 3);
    rgba[i * 4 + 3] = channels === 4 ? pixels[i * 4 + 3] : 255;
  }
  const packed = deflateSync(rows);
  return { width, height, rows, rgba, packed, head: header(width, height, channels),
    bytes: Buffer.concat([signature, header(width, height, channels), pngChunk('IDAT', packed), pngChunk('IEND')]) };
}
function chunkNames(bytes: Buffer) {
  const names = [];
  for (let p = 8; p < bytes.length; p += bytes.readUInt32BE(p) + 12) names.push(bytes.toString('ascii', p + 4, p + 8));
  return names;
}

for (const channels of [3, 4]) for (const filter of [0, 1, 2, 3, 4]) {
  test(`normalizer preserves every RGB${channels === 4 ? 'A' : ''} sample with PNG filter ${filter}`, () => {
    const source = fixture(channels, [filter, filter, filter]);
    const normalized = normalizePng(source.bytes);
    assert.equal(normalized.width, source.width); assert.equal(normalized.height, source.height);
    assert.deepEqual(normalized.pixels, source.rgba);
    assert.deepEqual(chunkNames(normalized.bytes), ['IHDR', 'IDAT', 'IEND']);
    assert.equal(normalized.bytes[24], 8); assert.equal(normalized.bytes[25], 6);
    assert.deepEqual(normalizePng(normalized.bytes).pixels, source.rgba);
    assert.deepEqual(normalizePng(normalized.bytes).bytes, normalized.bytes);
    if (channels === 3) for (let p = 3; p < normalized.pixels.length; p += 4) assert.equal(normalized.pixels[p], 255);
  });
}

test('normalized RGB/RGBA mixed-filter fixtures pass the unchanged production evidence decoder', async t => {
  let decodePng: (bytes: Uint8Array) => { width: number; height: number; pixelDigest: string };
  try { ({ decodePng } = await import('../tooling/ono/evidence.mjs')); }
  catch (error: any) {
    // Dependency-free local review can still run the remaining tests. Normal CI must never skip this integration.
    if (!process.env.CI && error.code === 'ERR_MODULE_NOT_FOUND' && /package 'marked'/.test(error.message)) {
      t.skip('Local marked dependency is absent; production decoder integration must run in normal npm/CI setup.'); return;
    }
    throw error;
  }
  for (const channels of [3, 4]) {
    const source = fixture(channels), normalized = normalizePng(source.bytes), decoded = decodePng(normalized.bytes);
    assert.deepEqual(decoded, { width: source.width, height: source.height, pixelDigest: digest(source.rgba) });
    if (channels === 3) assert.throws(() => decodePng(source.bytes), /PNG_UNSUPPORTED_OR_TOO_LARGE/);
  }
});

test('normalizer joins contiguous IDAT chunks without changing pixels', () => {
  const f = fixture(), middle = Math.floor(f.packed.length / 2);
  const bytes = Buffer.concat([signature, f.head, pngChunk('IDAT', f.packed.subarray(0, middle)), pngChunk('IDAT', f.packed.subarray(middle)), pngChunk('IEND')]);
  assert.deepEqual(normalizePng(bytes).pixels, f.rgba);
});

test('normalizer rejects invalid signatures, truncated chunks, CRC errors and trailing bytes', () => {
  const f = fixture(), badCrc = Buffer.from(f.bytes); badCrc[29] ^= 1;
  const invalid = [Buffer.alloc(0), Buffer.from('not a PNG'), f.bytes.subarray(0, 7), f.bytes.subarray(0, 15),
    f.bytes.subarray(0, -1), badCrc, Buffer.concat([f.bytes, Buffer.from([0])]), Buffer.concat([signature, Buffer.from('ffffffff49484452', 'hex')])];
  for (const bytes of invalid) assert.throws(() => normalizePng(bytes));
  const oversized = Buffer.alloc(20_000_001); signature.copy(oversized);
  assert.throws(() => normalizePng(oversized));
});

test('normalizer rejects dimensions, colour formats and PNG methods outside the bounded adapter', () => {
  const f = fixture();
  for (const head of [header(0, 1), header(1, 0), header(4000001, 1), header(0xffffffff, 0xffffffff),
    ...[1, 2, 4, 16].map(bits => header(3, 5, 3, { 8: bits })),
    ...[0, 3, 4, 5].map(type => header(3, 5, 3, { 9: type })),
    header(3, 5, 3, { 10: 1 }), header(3, 5, 3, { 11: 1 }), header(3, 5, 3, { 12: 1 })]) {
    assert.throws(() => normalizePng(Buffer.concat([signature, head, pngChunk('IDAT', f.packed), pngChunk('IEND')])));
  }
});

test('normalizer rejects bad ordering, unsupported colour metadata and animation', () => {
  const f = fixture(), data = pngChunk('IDAT', f.packed), end = pngChunk('IEND');
  for (const body of [[data, f.head, end], [f.head, f.head, data, end], [f.head, end], [f.head, data],
    [f.head, data, pngChunk('IEND', Buffer.from([0]))],
    [f.head, data, pngChunk('tEXt', Buffer.from('note\0fixture')), data, end],
    ...['PLTE', 'tRNS', 'iCCP', 'gAMA', 'cHRM', 'acTL', 'fcTL', 'fdAT', 'ABCD'].map(type => [f.head, pngChunk(type), data, end])]) {
    assert.throws(() => normalizePng(Buffer.concat([signature, ...body])));
  }
});

test('normalizer rejects invalid filters and short, excess or trailing compressed scanline data', () => {
  const f = fixture(), badFilter = Buffer.from(f.rows); badFilter[0] = 5;
  for (const packed of [deflateSync(badFilter), deflateSync(f.rows.subarray(0, -1)), deflateSync(Buffer.concat([f.rows, Buffer.from([0])])),
    Buffer.concat([f.packed, Buffer.from([0])]), Buffer.concat([f.packed, deflateSync(f.rows)]), Buffer.from([1, 2, 3])]) {
    assert.throws(() => normalizePng(Buffer.concat([signature, f.head, pngChunk('IDAT', packed), pngChunk('IEND')])));
  }
});

test('RGBA encoder rejects zero, negative, oversized dimensions and inconsistent buffers', () => {
  for (const [w, h, pixels] of [[0, 1, Buffer.alloc(0)], [-1, 1, Buffer.alloc(0)], [1, 0, Buffer.alloc(0)],
    [4000001, 1, Buffer.alloc(4)], [1, 1, Buffer.alloc(3)], [1.5, 1, Buffer.alloc(6)],
    [1, 1.5, Buffer.alloc(6)], [NaN, 1, Buffer.alloc(4)], [Infinity, 1, Buffer.alloc(4)]] as const) assert.throws(() => encodeRgba(w, h, pixels));
});

test('render guard permits only the approved owner-dispatched fixed state without credentials', () => {
  validateRenderContext(baseEnv);
  for (const patch of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'fork/repo' },
    { GITHUB_REPOSITORY_ID: '1' }, { GITHUB_ACTOR: 'someone' }, { GITHUB_TRIGGERING_ACTOR: 'someone' },
    { GITHUB_ACTOR: '' }, { GITHUB_ACTOR_ID: '1' }, { GITHUB_ACTOR_ID: '' }, { GITHUB_REF: 'refs/heads/feature' }, { APPROVED_SHA: '' },
    { APPROVED_SHA: 'A'.repeat(40) }, { GITHUB_SHA: 'b'.repeat(40) }, { PROTOTYPE_STATE: 'other' },
    { GITHUB_RUN_ID: '' }, { GITHUB_RUN_ATTEMPT: '0' }, { GH_TOKEN: 'test-only-token' }, { GITHUB_TOKEN: 'test-only-token' }]) assert.throws(() => validateRenderContext({ ...baseEnv, ...patch }));
});

let largePng: Buffer;
function outputFixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), 'ono-render-pilot-unit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'ono-render-output'); mkdirSync(output, { mode: 0o700 });
  if (!largePng) {
    const pixels = Buffer.alloc(1440 * 1024 * 4);
    for (let p = 3; p < pixels.length; p += 4) pixels[p] = 255;
    largePng = encodeRgba(1440, 1024, pixels);
  }
  const env = { ...baseEnv, RUNNER_TEMP: directory, GH_TOKEN: 'fake-for-unit-tests-only' };
  const manifest = { source: CANDIDATE, state: STATE, sha, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    sourceSha256: digest(readFileSync(CANDIDATE)), width: 1440, height: 1024, imageSha256: digest(largePng),
    rawSha256: digest(largePng), pixelSha256: digest(normalizePng(largePng).pixels), browser: '145.0.0.0',
    visualReview: 'not-performed', purpose: 'historical-prototype-render-pilot' };
  const imagePath = join(output, 'prototype.png'), manifestPath = join(output, 'manifest.json');
  writeFileSync(imagePath, largePng, { mode: 0o600 }); writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  return { env, manifest, bytes: largePng, output, imagePath, manifestPath };
}
const preflightResponse = () => ({ data: { viewer: { login: 'zhshenry' }, repository: {
  databaseId: 1372377655, nameWithOwner: 'zhshenry/onosan_workbench', isArchived: false, viewerPermission: 'WRITE',
  defaultBranchRef: { name: 'main', target: { oid: sha } }, issue: { number: 42, state: 'OPEN', locked: false },
} } });
function mockGithub(options: { failWrite?: boolean; failReconcile?: boolean; absentAfterWrite?: boolean;
  existingAtQuery?: number; wrongAuthor?: boolean; twoAttachments?: boolean; transformBody?: (body: string) => string;
  mutatePreflight?: (response: ReturnType<typeof preflightResponse>, index: number) => void } = {}) {
  const calls: string[][] = []; let written = false, comments = 0, preflights = 0, postedBody = '';
  const run = (args: string[]) => {
    calls.push(args);
    if (args[0] === 'issue') {
      written = true; postedBody = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      if (options.failWrite) throw new Error('ambiguous simulated timeout');
      return 'suppressed';
    }
    if (args[1] === 'graphql') {
      const response = preflightResponse(); options.mutatePreflight?.(response, ++preflights); return JSON.stringify(response);
    }
    comments++;
    if (written && options.failReconcile) throw new Error('simulated unavailable reconciliation');
    const existing = options.existingAtQuery !== undefined && comments >= options.existingAtQuery;
    if ((!written && !existing) || (written && options.absentAfterWrite)) return JSON.stringify([[]]);
    let body = `${postedBody || marker}\n![Historical fixture](${attachment})${options.twoAttachments ? `\n![Duplicate](${attachment})` : ''}`;
    if (options.transformBody) body = options.transformBody(body);
    return JSON.stringify([[{ id: 99, user: { login: options.wrongAuthor ? 'someone' : 'zhshenry' }, body }]]);
  };
  return { run, calls, writes: () => calls.filter(args => args[0] === 'issue') };
}

test('manifest binds source, fixed state, exact revision and canonical PNG hash', t => {
  const f = outputFixture(t); checkManifest(f.manifest, f.bytes, f.env);
  for (const patch of [{ source: '../other.html' }, { state: 'other' }, { sha: 'b'.repeat(40) },
    { sourceSha256: '0'.repeat(64) }, { imageSha256: '0'.repeat(64) }, { pixelSha256: '0'.repeat(64) },
    { rawSha256: 'invalid' }, { width: 1 }, { height: 1 }, { run: '124' }, { attempt: '2' },
    { purpose: 'acceptance' }, { visualReview: 'approved' }, { browser: '' }]) assert.throws(() => checkManifest({ ...f.manifest, ...patch }, f.bytes, f.env));
  assert.throws(() => checkManifest(f.manifest, fixture().bytes, f.env));
  assert.throws(() => checkManifest(f.manifest, f.bytes, { ...f.env, GITHUB_TRIGGERING_ACTOR: 'someone' }));
});

test('publication requires explicit upload, first attempt and full context before any GitHub call', t => {
  const f = outputFixture(t);
  for (const patch of [{ POST_ATTACHMENT: 'false' }, { POST_ATTACHMENT: '' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GH_TOKEN: '' }, { GITHUB_EVENT_NAME: 'push' }, { TARGET_ISSUE: '42;bad' }, { APPROVED_SHA: 'b'.repeat(40) }]) {
    const fake = mockGithub(); assert.throws(() => publish({ ...f.env, ...patch }, fake.run)); assert.equal(fake.calls.length, 0);
  }
});

test('one approved publication posts one fixed-path attachment after two preflights and returns verified URL', t => {
  const f = outputFixture(t), fake = mockGithub(), result = publish(f.env, fake.run);
  assert.deepEqual(result, { commentId: 99, url: attachment, sha256: f.manifest.imageSha256 });
  assert.equal(fake.writes().length, 1);
  assert.deepEqual(fake.writes()[0], ['issue', 'comment', '42', '--repo', 'zhshenry/onosan_workbench', '--body-file',
    join(f.output, 'comment.txt'), '--attach', `${f.imagePath}#Historical Design A initial home`]);
  assert.equal(fake.calls.filter(args => args[1] === 'graphql').length, 2);
  assert.equal(fake.calls.at(-1)?.[0], 'api');
  const body = readFileSync(join(f.output, 'comment.txt'), 'utf8');
  assert.ok(body.includes(marker)); assert.ok(body.includes(f.manifest.imageSha256)); assert.ok(body.includes(sha));
  assert.match(body, /not current product acceptance or plan approval/);
});

test('existing or newly appearing marker blocks publication without a write', t => {
  const f = outputFixture(t);
  for (const existingAtQuery of [1, 2]) {
    const fake = mockGithub({ existingAtQuery }); assert.throws(() => publish(f.env, fake.run), /MARKER_/); assert.equal(fake.writes().length, 0);
  }
});

test('wrong PAT owner, issue status, repository or moved main blocks publication', t => {
  const f = outputFixture(t);
  const mutations = [r => { r.data.viewer.login = 'someone'; }, r => { r.data.repository.databaseId = 1; },
    r => { r.data.repository.issue.locked = true; }, r => { r.data.repository.issue.state = 'CLOSED'; },
    r => { r.data.repository.issue.number = 43; }, r => { r.data.repository.viewerPermission = 'READ'; },
    r => { r.data.repository.defaultBranchRef.target.oid = 'b'.repeat(40); }];
  for (const mutate of mutations) {
    const fake = mockGithub({ mutatePreflight: mutate }); assert.throws(() => publish(f.env, fake.run)); assert.equal(fake.writes().length, 0);
  }
  const changed = mockGithub({ mutatePreflight: (r, n) => { if (n === 2) r.data.repository.defaultBranchRef.target.oid = 'b'.repeat(40); } });
  assert.throws(() => publish(f.env, changed.run)); assert.equal(changed.writes().length, 0);
});

test('corrupt local evidence or noncanonical image prevents all GitHub calls', t => {
  const f = outputFixture(t), fake = mockGithub();
  writeFileSync(f.manifestPath, JSON.stringify({ ...f.manifest, imageSha256: '0'.repeat(64) }));
  assert.throws(() => publish(f.env, fake.run)); assert.equal(fake.calls.length, 0);
  writeFileSync(f.manifestPath, '{');
  assert.throws(() => publish(f.env, fake.run)); assert.equal(fake.calls.length, 0);
});

test('uncertain write, missing result or failed reconciliation never causes another upload', t => {
  const f = outputFixture(t);
  for (const options of [{ failWrite: true }, { failWrite: true, absentAfterWrite: true }, { failReconcile: true },
    { failWrite: true, failReconcile: true }, { absentAfterWrite: true }, { wrongAuthor: true }, { twoAttachments: true }]) {
    const fake = mockGithub(options); assert.throws(() => publish(f.env, fake.run));
    assert.equal(fake.writes().length, 1); assert.equal(fake.calls.at(-1)?.[0], 'api');
  }
});

test('symlinked image, manifest or output directory is rejected before GitHub access', t => {
  for (const kind of ['image', 'manifest', 'directory']) {
    const f = outputFixture(t), fake = mockGithub();
    const target = kind === 'image' ? f.imagePath : kind === 'manifest' ? f.manifestPath : f.output;
    const relocated = `${target}-real`;
    renameSync(target, relocated); symlinkSync(relocated, target, kind === 'directory' ? 'dir' : 'file');
    assert.throws(() => publish(f.env, fake.run), /OUTPUT_/); assert.equal(fake.calls.length, 0);
  }
});

test('oversized local image and manifest are rejected before reading or GitHub access', t => {
  for (const kind of ['image', 'manifest']) {
    const f = outputFixture(t), fake = mockGithub();
    truncateSync(kind === 'image' ? f.imagePath : f.manifestPath, kind === 'image' ? 20_000_001 : 8193);
    assert.throws(() => publish(f.env, fake.run), /OUTPUT_NOT_REGULAR_OR_BOUNDED/); assert.equal(fake.calls.length, 0);
  }
});

test('image tampering during final preflight is caught before the sole upload', t => {
  const f = outputFixture(t);
  const fake = mockGithub({ mutatePreflight: (_response, index) => {
    if (index === 2) writeFileSync(f.imagePath, fixture().bytes);
  } });
  assert.throws(() => publish(f.env, fake.run)); assert.equal(fake.writes().length, 0);
});

test('changed returned comment body, malformed native URL and non-image links are not success', t => {
  const f = outputFixture(t);
  for (const transformBody of [
    (body: string) => body.replace('Historical Design A', 'Edited Design A'),
    (body: string) => body.replace(attachment, `${attachment}/extra`),
    (body: string) => body.replace(attachment, `${attachment}?query=extra`),
    (body: string) => body.replace(attachment, attachment.replace('github.com', 'example.com')),
    (body: string) => body.replace('![Historical fixture]', '[Historical fixture]'),
    (body: string) => body.replace('![Historical fixture]', '```\n![Historical fixture]') + '\n```',
  ]) {
    const fake = mockGithub({ transformBody }); assert.throws(() => publish(f.env, fake.run));
    assert.equal(fake.writes().length, 1); assert.equal(fake.calls.at(-1)?.[0], 'api');
  }
});

test('manual workflow keeps rendering token-free, network isolated, default nonpublishing and image-copy-free', () => {
  const workflow = readFileSync('.github/workflows/ono-prototype-render.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/); assert.doesNotMatch(workflow, /^  (push|pull_request|pull_request_target|schedule|workflow_run):/m);
  assert.match(workflow, /default: false/); assert.match(workflow, /sudo unshare --net -- setpriv/);
  assert.match(workflow, /env -i PATH=/); assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/); assert.doesNotMatch(workflow, /contents: write|issues: write/);
  assert.doesNotMatch(workflow, /upload-artifact|actions\/cache|base64|pull_request\.head/);
  assert.equal((workflow.match(/secrets\.ONOSAN_GH_TOKEN/g) ?? []).length, 1);
  const publication = workflow.indexOf('name: Publish once');
  assert.ok(publication > workflow.indexOf('name: Render with'));
  assert.ok(workflow.indexOf('secrets.ONOSAN_GH_TOKEN') > publication);
  assert.match(workflow.slice(publication), /if: inputs\.post_attachment == true/);
  assert.match(workflow, /if: always\(\)/);
  const renderer = readFileSync('tooling/ono/render-pilot/render.mjs', 'utf8');
  assert.match(renderer, /chromiumSandbox: true/); assert.doesNotMatch(renderer, /--no-sandbox/);
  assert.match(renderer, /acceptDownloads: false/); assert.match(renderer, /serviceWorkers: 'block'/);
});
