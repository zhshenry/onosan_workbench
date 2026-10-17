// Heuristic starter for jev-gate --dynamic. It does not call JEV and it is not a decision.
// Replace the generated questions with 1–3 issue-specific noul propositions before an accept run.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(message) {
  const error = new Error(message);
  error.code = 'ARGS';
  return error;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) out[body] = true;
    else {
      out[body] = next;
      index += 1;
    }
  }
  return out;
}

function indentOf(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function isPreferredSection(trimmed) {
  // Chinese headings have no ASCII word boundary, so do not use \b after them.
  if (trimmed.startsWith('#') && !/^#{2,6}\s+\S/.test(trimmed)) return false;
  const heading = trimmed.replace(/^#{2,6}\s+/, '');
  return /^(?:验收要点|验收|acceptance(?:\s+criteria)?|expect)\s*[:：]?\s*$/i.test(heading);
}

function isStop(line, sectionIndent) {
  if (indentOf(line) > sectionIndent) return false;
  const trimmed = line.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;
  if (/^[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(trimmed)) return true;
  if (indentOf(line) === 0 && /^[\u4e00-\u9fffA-Za-z0-9].{0,40}[:：]\s*$/.test(trimmed)) return true;
  return false;
}

function bulletText(line) {
  const match = /^(\s*)(?:[-*•]|\d+[.)])\s+(\S.*)$/.exec(line);
  return match ? match[2].trim() : null;
}

export function acceptanceBullets(text, max = 3) {
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let sectionIndex = -1;
  let sectionIndent = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (isPreferredSection(trimmed)) {
        sectionIndex = index;
        sectionIndent = indentOf(lines[index]);
        break;
      }
      continue;
    }
    if (isPreferredSection(trimmed)) {
      sectionIndex = index;
      sectionIndent = indentOf(lines[index]);
      break;
    }
  }
  const start = sectionIndex === -1 ? 0 : sectionIndex + 1;
  const bullets = [];
  let fence = false;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (sectionIndex !== -1 && trimmed && isStop(line, sectionIndent)) break;
    const bullet = bulletText(line);
    if (!bullet || bullet.length < 4) continue;
    if (!bullets.includes(bullet)) bullets.push(bullet.length > 500 ? `${bullet.slice(0, 500)}…` : bullet);
    if (bullets.length >= max) break;
  }
  return bullets;
}

export function questionsFromIssueText(text, max = 3) {
  const limit = Number.isInteger(max) && max >= 1 && max <= 3 ? max : 3;
  const bullets = acceptanceBullets(text, limit);
  const source = bullets.length > 0 ? bullets : [];
  const questions = (source.length > 0 ? source : [null]).slice(0, limit).map((bullet, index) => {
    const placeholder = bullet == null;
    const point = bullet ?? 'REPLACE_WITH_AN_ISSUE_SPECIFIC_ACCEPTANCE_POINT';
    return {
      id: `dyn_${index + 1}`,
      type: 'noul',
      needs_review: true,
      source_bullet: bullet,
      instructions: placeholder
        ? 'Replace this starter before the accept run. Does the recorded evidence show that the issue acceptance criteria hold?'
        : `Does the recorded evidence for this head show that the following acceptance point holds? ${point}`,
      criteria: {
        true: placeholder
          ? 'Replace this starter. Do not send it unchanged if the issue text did not yield a specific acceptance point.'
          : `The evidence shows this acceptance point is met: ${point}`,
        false: placeholder
          ? 'The starter was not replaced, or the evidence does not show the acceptance criteria.'
          : `The evidence shows this acceptance point is missed, contradicted, or not demonstrated: ${point}`,
      },
    };
  });
  return {
    note: 'Starter only. Replace ids and tighten instructions to 1-3 issue-specific noul questions before jev-gate --dynamic. The gate ignores needs_review and source_bullet. This file is not a decision.',
    questions,
  };
}

function finish(summary, exitCode) {
  summary.exit_code = exitCode;
  summary.human = summary.ok
    ? `jev-dynamic starter wrote ${summary.question_count} question(s)`
    : `jev-dynamic ERROR (${summary.error ?? summary.reason}).`;
  return { summary, exitCode };
}

export function run(argv, options = {}) {
  try {
    const args = parseArgs(argv);
    if (args.help === true) {
      return finish({
        ok: false,
        reason: 'help',
        error: 'Usage: node tooling/jev-dynamic-from-issue.mjs --issue-body <file> [--out <file>] [--max 3]',
      }, 0);
    }
    if (args._.length) throw fail(`unexpected arguments: ${args._.join(' ')}`);
    if (typeof args['issue-body'] !== 'string' || !args['issue-body'].trim()) throw fail('missing --issue-body');
    const max = args.max === undefined ? 3 : Number(args.max);
    if (!Number.isInteger(max) || max < 1 || max > 3) throw fail('--max must be 1, 2, or 3');
    const file = path.resolve(options.cwd ?? process.cwd(), args['issue-body'].trim());
    const text = options.readFile ? options.readFile(file) : readFileSync(file, 'utf8');
    const payload = questionsFromIssueText(text, max);
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    let outPath = null;
    if (typeof args.out === 'string' && args.out.trim()) {
      outPath = path.resolve(options.cwd ?? process.cwd(), args.out.trim());
      if (options.writeFile) options.writeFile(outPath, json);
      else writeFileSync(outPath, json, 'utf8');
    }
    return finish({
      ok: true,
      placeholder: true,
      question_count: payload.questions.length,
      out_path: outPath,
      questions: payload,
      json,
    }, 0);
  } catch (error) {
    return finish({ ok: false, reason: 'invalid_input', error: error.message, questions: null }, error.code === 'ENOENT' ? 1 : 1);
  }
}

function invokedDirectly() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (invokedDirectly()) {
  const result = run(process.argv.slice(2));
  if (result.summary.ok) process.stdout.write(result.summary.json);
  else process.stdout.write(`${JSON.stringify({ ok: false, reason: result.summary.reason, error: result.summary.error, exit_code: result.exitCode }, null, 2)}\n`);
  process.stderr.write(`${result.summary.human}\n`);
  process.exit(result.exitCode);
}
