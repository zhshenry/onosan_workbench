import { inflateSync } from 'node:zlib';
import { marked } from 'marked';
import { hash, requireThat, targetKey } from './core.mjs';

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

// Traverse parsed Markdown, not a regex that would count image syntax inside examples.
export function embeddedImages(markdown) {
  const found = [];
  function walk(tokens) {
    for (const token of tokens) {
      if (['code', 'codespan', 'blockquote', 'html'].includes(token.type)) continue;
      if (token.type === 'image') found.push(token.href);
      if (token.tokens) walk(token.tokens);
      if (token.items) for (const item of token.items) walk(item.tokens);
      if (token.type === 'table') {
        for (const cell of [...token.header, ...token.rows.flat()]) walk(cell.tokens);
      }
    }
  }
  requireThat(typeof markdown === 'string' && markdown.length <= 500_000, 'MARKDOWN_MISSING_OR_TOO_LARGE');
  walk(marked.lexer(markdown)); return found;
}
const https = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
};

export async function checkDesign({ target, ui, nonUiReason, plan, comment, images, visual }, readImage, verifyVisual = async () => false) {
  targetKey(target);
  requireThat(typeof ui === 'boolean', 'UI_SCOPE_REQUIRED');
  if (!ui) {
    requireThat(typeof nonUiReason === 'string' && nonUiReason.trim().length > 0, 'NON_UI_REASON_REQUIRED');
    return { valid: true, targetKey: targetKey(target), visual: 'not-applicable', reason: nonUiReason };
  }
  requireThat(Array.isArray(images) && images.length > 0 && images.length <= 20, 'DESIGN_IMAGES_MISSING');
  requireThat(typeof plan === 'string' && hash(plan) === target.planDigest, 'PLAN_CONTENT_CHANGED');
  const planImages = embeddedImages(plan), commentImages = embeddedImages(comment);
  const urls = images.map(i => i.url);
  requireThat(new Set(urls).size === urls.length && [planImages, commentImages].every(list =>
    list.length === urls.length && new Set(list).size === urls.length && list.every(url => urls.includes(url))), 'DESIGN_NOT_EMBEDDED_IN_BOTH');
  let total = 0;
  for (const item of images) {
    requireThat(https(item.url) && item.planVersion === target.planVersion && item.planDigest === target.planDigest &&
      typeof item.state === 'string' && item.state.trim() && /^[a-f0-9]{64}$/.test(item.sha256), 'DESIGN_VERSION_OR_MANIFEST');
    const bytes = await readImage(item.url); // Safe bounded resolver supplied by adapter; no HTTP client in this core.
    requireThat(bytes instanceof Uint8Array, 'IMAGE_UNREADABLE');
    total += bytes.length; requireThat(total <= 20_000_000, 'DESIGN_TOTAL_TOO_LARGE');
    requireThat(hash(bytes) === item.sha256, 'IMAGE_CHANGED'); decodePng(bytes);
  }
  // No dimension or byte threshold can prove high fidelity or requirement coverage.
  const binding = hash(JSON.stringify([targetKey(target), hash(plan), hash(comment), images]));
  requireThat(visual?.decision === 'approved-high-fidelity' && visual.binding === binding &&
    typeof visual.reviewer === 'string' && visual.reviewer.trim() && typeof visual.notes === 'string' && visual.notes.trim(), 'VISUAL_REVIEW_REQUIRED');
  requireThat(await verifyVisual({ binding, review: structuredClone(visual) }) === true, 'VISUAL_REVIEW_UNVERIFIED');
  return { valid: true, targetKey: targetKey(target), binding, images: structuredClone(images), visual: structuredClone(visual), bytes: total };
}
export function visualBinding(target, plan, comment, images) {
  return hash(JSON.stringify([targetKey(target), hash(plan), hash(comment), images]));
}

export async function checkAcceptance({ target, expected, checks, artifacts }, readArtifact, verifyPersistence = async () => false, now = Date.now()) {
  requireThat(target.kind !== 'plan', 'ACCEPTANCE_REQUIRES_COMMIT'); targetKey(target);
  requireThat(expected?.head === target.sha && /^[a-f0-9]{40}$/.test(expected.tested) &&
    (target.kind === 'merge' ? expected.event === 'pull_request' && /^[a-f0-9]{40}$/.test(expected.base) :
      expected.event === 'push' && expected.tested === target.sha), 'TEST_BINDING');
  const required = ['linux-test', 'linux-verify', 'windows-test', 'windows-verify', 'windows-install', 'windows-persistence'];
  requireThat(Array.isArray(checks) && required.every(name => checks.filter(c => c.name === name).length === 1), 'REQUIRED_CHECKS_MISSING');
  for (const check of checks) {
    requireThat(['passed', 'failed', 'skipped', 'uncovered'].includes(check.status) && check.run === expected.run &&
      check.attempt === expected.attempt && check.head === expected.head && check.base === expected.base &&
      check.tested === expected.tested && check.event === expected.event, 'STALE_TEST_EVIDENCE');
    requireThat(check.status === 'passed', 'ACCEPTANCE_NOT_PASSED'); // Exceptions require a later approved policy, never silent skipping.
  }
  requireThat(Number.isSafeInteger(expected.run) && expected.run > 0 && Number.isSafeInteger(expected.attempt) && expected.attempt > 0 &&
    Array.isArray(artifacts) && artifacts.length > 0, 'EVIDENCE_MANIFEST');
  let total = 0;
  const seen = new Set();
  for (const artifact of artifacts) {
    requireThat(!seen.has(artifact.url) && https(artifact.url) && /\.(png|json|md)$/.test(artifact.name) &&
      !/[\\/]/.test(artifact.name) && artifact.run === expected.run && artifact.attempt === expected.attempt &&
      artifact.sha === expected.head && /^[a-f0-9]{64}$/.test(artifact.sha256) && typeof artifact.critical === 'boolean', 'ARTIFACT_BINDING');
    seen.add(artifact.url);
    requireThat((Number.isFinite(Date.parse(artifact.expiresAt)) && Date.parse(artifact.expiresAt) > now) ||
      (artifact.critical && artifact.expiresAt === null), 'EVIDENCE_EXPIRED');
    if (artifact.critical) requireThat(await verifyPersistence(structuredClone(artifact)) === true, 'PERSISTENCE_UNVERIFIED');
    const bytes = await readArtifact(artifact.url);
    requireThat(bytes instanceof Uint8Array && bytes.length === artifact.bytes && hash(bytes) === artifact.sha256, 'ARTIFACT_CHANGED');
    total += bytes.length; requireThat(total <= 20_000_000, 'EVIDENCE_TOTAL_TOO_LARGE');
    if (artifact.name.endsWith('.png')) decodePng(bytes);
    else {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      requireThat(text.trim().length > 0, 'EMPTY_REPORT');
      if (artifact.name.endsWith('.json')) JSON.parse(text);
    }
  }
  requireThat(artifacts.some(a => a.critical), 'CRITICAL_EVIDENCE_MISSING');
  return { valid: true, targetKey: targetKey(target), bytes: total, expected: structuredClone(expected), checks: structuredClone(checks), artifacts: structuredClone(artifacts) };
}

/** Compose the mandatory guards. All readers/verifiers are trusted infrastructure adapters;
 * none is implemented by accepting claims supplied in issue text.
 */
export async function checkTaskEvidence(task, adapters) {
  const target = task.target;
  const design = await checkDesign({ ...task.design, target: { ...target, kind: 'plan' } }, adapters.readImage, adapters.verifyVisual);
  let acceptance = null;
  if (target.kind !== 'plan') {
    acceptance = await checkAcceptance({ ...task.acceptance, target }, adapters.readArtifact, adapters.verifyPersistence, adapters.now);
    if (task.design.ui) {
      requireThat(task.acceptance.artifacts.some(a => a.critical && a.name.endsWith('.png')), 'IMPLEMENTATION_SCREENSHOT_MISSING');
      const binding = hash(JSON.stringify([targetKey(target), task.acceptance.expected, task.acceptance.artifacts]));
      const review = task.implementationReview;
      requireThat(review?.decision === 'approved-implementation' && review.binding === binding &&
        typeof review.notes === 'string' && review.notes.trim() && typeof review.reviewer === 'string' && review.reviewer.trim(), 'IMPLEMENTATION_VISUAL_REVIEW_REQUIRED');
      requireThat(await adapters.verifyVisual?.({ binding, review }) === true, 'VISUAL_REVIEW_UNVERIFIED');
    }
  }
  return { valid: true, targetKey: targetKey(target), design, acceptance, implementationReview: task.implementationReview ?? null };
}
