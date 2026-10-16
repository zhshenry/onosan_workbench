// Placeholder for a future Chromium float accept pilot.
// Validates a simple scenario YAML file and writes a state blob jev-gate can read.
// It does not launch Electron or a browser, and it does not decide acceptance.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '..');
const MODES = new Set(['functional', 'important_ui', 'optimize']);

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

function parseScalar(raw) {
  const text = raw.trim();
  if ((text.startsWith('"') && text.endsWith('"') && text.length >= 2) || (text.startsWith("'") && text.endsWith("'") && text.length >= 2)) {
    const quote = text[0];
    const body = text.slice(1, -1);
    if (quote === '"') return body.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return body.replace(/''/g, "'");
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

function parseKey(line, lineNo) {
  const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
  if (!match) throw fail(`expected a key (line ${lineNo})`);
  const key = match[1];
  const rest = match[2];
  if (rest === '|' || rest === '>') throw fail(`block scalars are not supported (line ${lineNo})`);
  if (rest === '') return { key, value: undefined };
  return { key, value: parseScalar(rest) };
}

/**
 * YAML subset used by accept scenarios: maps, lists, scalars, nested indent, full-line comments.
 * List items are indented past their key. Block scalars, tabs, anchors, and flow collections are rejected.
 */
export function parseSimpleYaml(source) {
  const lines = String(source).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const root = {};
  const stack = [{ indent: -1, type: 'map', value: root }];
  const current = () => stack[stack.length - 1];
  const nextContent = from => {
    for (let index = from + 1; index < lines.length; index += 1) {
      const raw = lines[index];
      if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;
      if (raw.includes('\t')) throw fail(`tabs are not allowed (line ${index + 1})`);
      const indent = raw.match(/^ */)?.[0].length ?? 0;
      return { indent, line: raw.slice(indent) };
    }
    return null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;
    if (raw.includes('\t')) throw fail(`tabs are not allowed (line ${index + 1})`);
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const line = raw.slice(indent);
    const lineNo = index + 1;
    while (stack.length > 1 && indent <= current().indent) stack.pop();
    const parent = current();

    if (line.startsWith('- ')) {
      if (parent.type !== 'list') throw fail(`list item is not under a list (line ${lineNo})`);
      const rest = line.slice(2);
      if (/^[A-Za-z][A-Za-z0-9_-]*:\s*/.test(rest)) {
        const item = {};
        parent.value.push(item);
        const parsed = parseKey(rest, lineNo);
        if (parsed.value === undefined) {
          const upcoming = nextContent(index);
          const nestedList = Boolean(upcoming && upcoming.indent > indent && upcoming.line.startsWith('- '));
          const container = nestedList ? [] : {};
          // The key shares the dash line, so sibling keys are indented further than this line.
          const containerIndent = upcoming && upcoming.indent > indent ? upcoming.indent - 1 : indent;
          item[parsed.key] = container;
          stack.push({ indent, type: 'map', value: item });
          stack.push({ indent: containerIndent, type: nestedList ? 'list' : 'map', value: container });
        } else {
          item[parsed.key] = parsed.value;
          stack.push({ indent, type: 'map', value: item });
        }
      } else {
        parent.value.push(parseScalar(rest));
      }
      continue;
    }
    if (line === '-') throw fail(`bare list markers are not supported (line ${lineNo})`);
    if (parent.type !== 'map') throw fail(`expected a key (line ${lineNo})`);
    const parsed = parseKey(line, lineNo);
    if (Object.prototype.hasOwnProperty.call(parent.value, parsed.key)) throw fail(`duplicate key ${parsed.key} (line ${lineNo})`);
    if (parsed.value === undefined) {
      const upcoming = nextContent(index);
      const container = upcoming && upcoming.indent > indent && upcoming.line.startsWith('- ') ? [] : {};
      parent.value[parsed.key] = container;
      stack.push({ indent, type: Array.isArray(container) ? 'list' : 'map', value: container });
    } else {
      parent.value[parsed.key] = parsed.value;
    }
  }
  return root;
}

function displayPath(file) {
  const relative = path.relative(ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return file;
  return relative.split(path.sep).join('/');
}

function resolveCommit(ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw fail(`cannot resolve --head ${ref}`);
  return result.stdout.trim();
}

function dynamicQuestions(judge) {
  if (judge?.dynamic === undefined) return null;
  if (!Array.isArray(judge.dynamic) || judge.dynamic.length < 1 || judge.dynamic.length > 3) {
    throw fail('judge.dynamic must be 1 to 3 questions when it is present');
  }
  return {
    questions: judge.dynamic.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail(`judge.dynamic item ${index + 1} is not a map`);
      if (typeof item.id !== 'string' || !item.id) throw fail(`judge.dynamic item ${index + 1} needs an id`);
      if (item.type !== undefined && item.type !== 'noul') throw fail(`judge.dynamic ${item.id} must be type noul`);
      if (typeof item.instructions !== 'string' || !item.instructions.trim()) throw fail(`judge.dynamic ${item.id} needs instructions`);
      if (typeof item.criteria?.true !== 'string' || typeof item.criteria?.false !== 'string') {
        throw fail(`judge.dynamic ${item.id} needs criteria.true and criteria.false`);
      }
      return {
        id: item.id,
        type: 'noul',
        instructions: item.instructions,
        criteria: { true: item.criteria.true, false: item.criteria.false },
      };
    }),
  };
}

function finish(summary, exitCode) {
  summary.exit_code = exitCode;
  summary.human = summary.ok
    ? `accept-float placeholder wrote ${summary.state_path}`
    : `accept-float ERROR (${summary.error ?? summary.reason}).`;
  return { summary, exitCode };
}

export function run(argv) {
  try {
    const args = parseArgs(argv);
    if (args.help === true) {
      return finish({
        ok: false,
        reason: 'help',
        error: 'Usage: node tooling/accept-float.mjs --scenario <yaml> --head <sha> [--out-dir <dir>]',
      }, 0);
    }
    if (args._.length) throw fail(`unexpected arguments: ${args._.join(' ')}`);
    if (typeof args.scenario !== 'string' || !args.scenario.trim()) throw fail('missing --scenario');
    if (typeof args.head !== 'string' || !args.head.trim()) throw fail('missing --head');
    const scenarioPath = path.resolve(process.cwd(), args.scenario.trim());
    if (!existsSync(scenarioPath) || !statSync(scenarioPath).isFile()) throw fail(`scenario file not found: ${args.scenario}`);
    const bytes = readFileSync(scenarioPath);
    const doc = parseSimpleYaml(bytes.toString('utf8'));
    const issue = doc.issue;
    if (typeof issue !== 'number' || !Number.isInteger(issue) || issue < 1) throw fail('scenario issue must be a positive integer');
    if (!MODES.has(doc.mode)) throw fail('scenario mode must be functional, important_ui, or optimize');
    if (!Array.isArray(doc.steps) || doc.steps.length === 0) throw fail('scenario steps must be a non-empty list');
    if (!Array.isArray(doc.expect) || doc.expect.length === 0) throw fail('scenario expect must be a non-empty list');
    if (!doc.judge || typeof doc.judge !== 'object' || Array.isArray(doc.judge)) throw fail('scenario judge must be a map');
    const head = resolveCommit(args.head.trim());
    const dynamic = dynamicQuestions(doc.judge);
    const outDir = typeof args['out-dir'] === 'string' && args['out-dir'].trim()
      ? path.resolve(process.cwd(), args['out-dir'].trim())
      : path.join(ROOT, 'artifacts', 'accept', String(issue));
    mkdirSync(outDir, { recursive: true });
    const statePath = path.join(outDir, 'state.json');
    const dynamicPath = path.join(outDir, 'dynamic-questions.json');
    const state = {
      placeholder: true,
      automation: 'not_implemented',
      visual_evidence: false,
      note: 'Full Chromium float automation can be filled later. This blob is not screenshots and is not an accept decision.',
      scenario: displayPath(scenarioPath),
      scenario_sha256: createHash('sha256').update(bytes).digest('hex'),
      issue: String(issue),
      mode: doc.mode,
      head,
      title: doc.title ?? null,
      spec_version: doc.spec_version ?? null,
      steps: doc.steps,
      expect: doc.expect,
      judge: doc.judge,
      notes: doc.notes ?? null,
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    if (dynamic) writeFileSync(dynamicPath, `${JSON.stringify(dynamic, null, 2)}\n`, 'utf8');
    else if (existsSync(dynamicPath)) rmSync(dynamicPath);
    return finish({
      ok: true,
      placeholder: true,
      visual_evidence: false,
      issue: String(issue),
      mode: doc.mode,
      head,
      state_path: displayPath(statePath),
      dynamic_path: dynamic ? displayPath(dynamicPath) : null,
    }, 0);
  } catch (error) {
    return finish({ ok: false, reason: 'invalid_scenario', error: error.message, placeholder: true, visual_evidence: false }, 1);
  }
}

function invokedDirectly() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (invokedDirectly()) {
  const result = run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  process.stderr.write(`${result.summary.human}\n`);
  process.exit(result.exitCode);
}
