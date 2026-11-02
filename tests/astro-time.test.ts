import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveAstroTime, type AstroTimeInput } from '../shared/astro-time';
import { baziProfileInputSchema } from '../shared/bazi-contracts';
import { BaziStore } from '../modules/bazi/store';
import { buildAstro } from '../modules/bazi/astro';
import { buildBaziContribution } from '../modules/bazi/ai';

const birth = { name: '时区测试', gender: 1, date: '1990-08-16', time: '14:30' };
function ready(input: AstroTimeInput) {
  const result = resolveAstroTime(input);
  assert.equal(result.status, 'ready', JSON.stringify(result));
  if (result.status !== 'ready') throw new Error('unreachable');
  return result.value;
}

test('旧档固定东八区保持原 UTC 时刻；只有明确选地区后才启用历史夏令时', () => {
  const legacy = ready(birth);
  assert.equal(legacy.epochMs, Date.UTC(1990, 7, 16, 6, 30));
  assert.equal(legacy.legacy, true);
  const automatic = ready({ ...birth, astroTimeZone: 'Asia/Shanghai' });
  assert.equal(automatic.offset, '+09:00');
  assert.equal(automatic.utc, '1990-08-16T05:30:00Z');
  assert.equal(ready({ ...birth, astroTimeZone: '+08:00' }).epochMs, legacy.epochMs);
  for (const year of [1986, 1987, 1988, 1989, 1990, 1991]) {
    assert.equal(ready({ ...birth, date: `${year}-08-16`, astroTimeZone: 'Asia/Shanghai' }).offset, '+09:00');
    assert.equal(ready({ ...birth, date: `${year}-01-16`, astroTimeZone: 'Asia/Shanghai' }).offset, '+08:00');
  }
  assert.equal(ready({ ...birth, date: '1992-08-16', astroTimeZone: 'Asia/Shanghai' }).offset, '+08:00');
});

// IANA tzdb asia PRC rules: 1986 May 4 02:00; 1987–1991 Apr Sun>=11 02:00;
// Sep Sun>=11 02:00 is a wall-clock rollback to 01:00. Do not hardcode a generic 02:00 fold.
test('中国历史拨快空档禁止排盘，拨回重复时段必须明确选择', () => {
  for (const date of ['1986-05-04', '1990-04-15']) {
    const input = { date, time: '02:30', astroTimeZone: 'Asia/Shanghai' };
    assert.match(JSON.stringify(resolveAstroTime(input)), /时间不存在/);
    assert.throws(() => buildAstro(input), /时间不存在/);
  }
  const input = { date: '1990-09-16', time: '01:30', astroTimeZone: 'Asia/Shanghai' };
  assert.equal(resolveAstroTime(input).status, 'ambiguous');
  assert.equal(ready({ ...input, astroTimeChoice: 'earlier' }).utc, '1990-09-15T16:30:00Z');
  assert.equal(ready({ ...input, astroTimeChoice: 'later' }).utc, '1990-09-15T17:30:00Z');
  assert.equal(ready({ ...input, time: '02:00' }).choice, undefined);
});

test('北美与南半球换时，包括半小时重复时段和整日跳过', () => {
  assert.equal(resolveAstroTime({ date: '2020-03-08', time: '02:30', astroTimeZone: 'America/New_York' }).status, 'invalid');
  const ny = { date: '2020-11-01', time: '01:30', astroTimeZone: 'America/New_York' };
  assert.equal(resolveAstroTime(ny).status, 'ambiguous');
  assert.equal(ready({ ...ny, astroTimeChoice: 'earlier' }).utc, '2020-11-01T05:30:00Z');
  assert.equal(ready({ ...ny, astroTimeChoice: 'later' }).utc, '2020-11-01T06:30:00Z');
  const lh = { date: '2020-04-05', time: '01:45', astroTimeZone: 'Australia/Lord_Howe' };
  assert.equal(ready({ ...lh, astroTimeChoice: 'later' }).epochMs - ready({ ...lh, astroTimeChoice: 'earlier' }).epochMs, 30 * 60_000);
  assert.equal(resolveAstroTime({ ...lh, date: '2020-10-04', time: '02:15' }).status, 'invalid');
  assert.equal(resolveAstroTime({ date: '2011-12-30', time: '12:00', astroTimeZone: 'Pacific/Apia' }).status, 'invalid');
});

test('非整小时偏移、历史秒级偏移、南半球夏令时和跨日换算不被截断', () => {
  for (const [date, time, astroTimeZone, utc, offset] of [
    ['2020-04-09', '11:34', 'Asia/Kathmandu', '2020-04-09T05:49:00Z', '+05:45'],
    ['2020-01-01', '00:15', 'Australia/Sydney', '2019-12-31T13:15:00Z', '+11:00'],
    ['2020-07-01', '12:00', 'Australia/Sydney', '2020-07-01T02:00:00Z', '+10:00'],
    ['2020-07-01', '12:00', 'Europe/London', '2020-07-01T11:00:00Z', '+01:00'],
    ['1900-01-01', '12:00', 'Asia/Shanghai', '1900-01-01T03:54:17Z', '+08:05:43'],
  ]) {
    const value = ready({ date, time, astroTimeZone });
    assert.equal(value.utc, utc);
    assert.equal(value.offset, offset);
  }
});

test('错误日期、时间和地区不归一化成其他日期或电脑时区', () => {
  for (const extra of [{ date: '2020-02-30' }, { date: '2021-02-29' }, { time: '24:00' }, { time: '12:60' }, { time: '9:30' }, { astroTimeZone: 'Mars/Olympus' }, { astroTimeZone: '' }, { astroTimeZone: '2020-01-01T00:00+08:00' }]) {
    assert.equal(resolveAstroTime({ ...birth, ...extra }).status, 'invalid');
    assert.equal(baziProfileInputSchema.safeParse({ ...birth, ...extra }).success, false);
  }
});

test('相同时刻的不同地区钟表时间给出相同星体、宫头、上升与天顶', () => {
  const geo = { lat: 31.2304, lon: 121.4737 };
  const original = buildAstro({ date: '2020-04-09', time: '11:34', ...geo });
  for (const data of [
    { date: '2020-04-09', time: '11:34', astroTimeZone: 'Asia/Shanghai' },
    { date: '2020-04-09', time: '03:34', astroTimeZone: 'UTC' },
    { date: '2020-04-08', time: '23:34', astroTimeZone: 'America/New_York' },
  ]) {
    const { birthTime: _a, ...a } = original, { birthTime: _b, ...b } = buildAstro({ ...data, ...geo });
    assert.deepEqual(a, b);
  }
});

test('主机时区不参与换算', () => {
  const code = "import {resolveAstroTime} from './shared/astro-time.ts'; console.log(JSON.stringify(resolveAstroTime({date:'1990-08-16',time:'14:30',astroTimeZone:'Asia/Shanghai'})))";
  const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(TZ => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  });
  assert.equal(new Set(results).size, 1);
});

test('时区与重复时间选择持久化；合并旧字段后再次校验，失败不改文件', t => {
  const dir = mkdtempSync(join(tmpdir(), 'astro-time-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new BaziStore(dir);
  const input = { ...birth, id: 'fold', date: '1990-09-16', time: '01:30', astroTimeZone: 'Asia/Shanghai', astroTimeChoice: 'later' };
  const original = store.saveProfile(input).profiles[0];
  store.saveNote('fold', '旧笔记保留');
  const before = new BaziStore(dir).all();
  assert.equal(before.profiles[0].astroTimeChoice, 'later');
  assert.equal(before.profiles[0].createdAt, original.createdAt);
  assert.throws(() => store.saveProfile({ ...birth, id: 'fold', date: '1990-04-15', time: '02:30' }), /时间不存在/);
  assert.throws(() => store.saveProfile({ ...birth, id: 'fold', date: '1991-09-15', time: '01:30' }), /出现过两次/);
  assert.deepEqual(new BaziStore(dir).all(), before);
  store.saveProfile({ ...input, time: '03:00', astroTimeChoice: undefined });
  const reloaded = new BaziStore(dir).all();
  assert.equal(reloaded.profiles[0].astroTimeChoice, undefined);
  assert.equal(reloaded.profiles[0].astroTimeZone, 'Asia/Shanghai');
  assert.equal(reloaded.notes.fold, '旧笔记保留');
});

test('载入无法识别的历史时区仍保留命例库，交给编辑页修正', t => {
  const dir = mkdtempSync(join(tmpdir(), 'astro-time-invalid-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'bazi-profiles.json'), JSON.stringify({ profiles: [{ ...birth, id: 'bad-zone', createdAt: '2020-01-01', astroTimeZone: 'Old/Unknown' }], notes: {} }));
  const data = new BaziStore(dir).all();
  assert.equal(data.profiles.length, 1);
  assert.throws(() => buildAstro(data.profiles[0]), /未识别这个时区/);
});

test('占星 AI 上下文写明时间依据和重复时间选择，不二次扣夏令时', () => {
  const profile = baziProfileInputSchema.parse({ ...birth, date: '1990-09-16', time: '01:30', astroTimeZone: 'Asia/Shanghai', astroTimeChoice: 'later' });
  const context = buildBaziContribution({ ...profile, id: 'test', createdAt: '2020-01-01' }, 'astro').contextText(new Date('2020-01-01T00:00:00Z'));
  for (const expected of ['Asia/Shanghai', 'UTC+08:00', '1990-09-15T17:30:00Z', '第二次（拨回后）', '无需再次扣除夏令时']) assert.ok(context.includes(expected), expected);
});
