// Maintenance only: fetch public JPL ephemerides. The app never calls Horizons.
// Usage: node tooling/generate-astro-small-bodies.mjs <cache-directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const cache = resolve(process.argv[2] ?? 'test-results/astro-ephemeris');
const endpoint = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const start = '1699-12-01', stop = '2201-02-01', stepDays = 4;
const startJd = Date.parse(`${start}T00:00:00Z`) / 86400000 + 2440587.5;
const targets = [
  ['Chiron', '凯龙星', '2060;', '2060 Chiron'],
  ['Ceres', '谷神星', '1;', '1 Ceres'],
  ['Pallas', '智神星', '2;', '2 Pallas'],
  ['Juno', '婚神星', '3;', '3 Juno'],
  ['Vesta', '灶神星', '4;', '4 Vesta'],
];
const common = {
  EPHEM_TYPE: 'OBSERVER', CENTER: '500@399', TIME_TYPE: 'TT', QUANTITIES: '31',
  CSV_FORMAT: 'YES', EXTRA_PREC: 'YES', CAL_FORMAT: 'JD', ANG_FORMAT: 'DEG',
};
const supportedStart = Date.parse('1700-01-01T00:00:00Z') / 86400000 + 2440587.5;
const supportedEnd = Date.parse('2201-01-01T00:00:00Z') / 86400000 + 2440587.5;
const fixtureTimes = [supportedStart + 0.00005, supportedEnd - 0.00005];
for (let i = 0; i < 96; i++) {
  fixtureTimes.push(supportedStart + ((i * 17977.273419 + 871.183729) % (supportedEnd - supportedStart)));
}
fixtureTimes.sort((a, b) => a - b);

await mkdir(cache, { recursive: true });
async function query(key, params) {
  const url = new URL(endpoint);
  url.searchParams.set('format', 'json');
  for (const [name, value] of Object.entries({ ...common, ...params })) url.searchParams.set(name, `'${value}'`);
  const file = resolve(cache, `${key}.json`);
  let json;
  try { json = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (response.ok || response.status < 500) break;
      await new Promise(done => setTimeout(done, 1000 * (attempt + 1)));
    }
    if (!response.ok) throw new Error(`Horizons ${response.status}: ${key}`);
    json = await response.json();
    if (json.error || !json.result?.includes('$$SOE')) throw new Error(json.error ?? json.result);
    json = { url: url.href, ...json };
    await writeFile(file, JSON.stringify(json));
  }
  if (json.url !== url.href) throw new Error(`Cache parameters differ: ${file}`);
  const text = json.result;
  const rows = text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').map(line => {
    const cells = line.split(',');
    return { jd: Number(cells[0]), lon: Number(cells[3]) };
  });
  if (rows.some(row => !Number.isFinite(row.jd) || !Number.isFinite(row.lon) || row.lon < 0 || row.lon >= 360)) throw new Error(`Invalid coordinates: ${key}`);
  return { rows, text, url: url.href, sha256: createHash('sha256').update(text).digest('hex') };
}

const bodies = [], fixtures = [];
for (const [key, name, command, targetName] of targets) {
  // Sequential requests follow JPL's API fair-use policy.
  const source = await query(key, { COMMAND: command, START_TIME: start, STOP_TIME: stop, STEP_SIZE: `${stepDays} d` });
  if (!source.text.includes(`Target body name: ${targetName}`)) throw new Error(`Wrong target: ${key}`);
  const count = Math.floor((Date.parse(`${stop}T00:00:00Z`) / 86400000 + 2440587.5 - startJd) / stepDays) + 1;
  if (source.rows.length !== count || source.rows.some((row, i) => Math.abs(row.jd - startJd - i * stepDays) > 1e-7)) throw new Error(`Incomplete sampling: ${key}`);
  const solution = source.text.match(/Target body name:[^\n]+/)?.[0].trim();
  bodies.push({ key, name, command, solution, sourceUrl: source.url, sourceSha256: source.sha256, longitude: source.rows.map(row => row.lon) });
  const values = [], sources = [];
  for (let i = 0; i < fixtureTimes.length; i += 24) {
    const times = fixtureTimes.slice(i, i + 24);
    const reference = await query(`${key}-reference-range-${i}`, { COMMAND: command, TLIST: times.map(value => value.toFixed(8)).join("' '") });
    if (reference.rows.length !== times.length || reference.rows.some((row, index) => Math.abs(row.jd - times[index]) > 1e-7)) throw new Error(`Incomplete references: ${key}`);
    values.push(...reference.rows);
    sources.push({ url: reference.url, sha256: reference.sha256 });
  }
  fixtures.push({ key, sources, values });
  console.log(`${key}: ${source.rows.length} samples, ${values.length} independent reference times`);
}
await mkdir('modules/bazi/data', { recursive: true });
await writeFile('modules/bazi/data/small-bodies.json', JSON.stringify({
  source: 'NASA/JPL Horizons, geocentric apparent ecliptic-of-date longitude (quantity 31), degrees',
  generatedAt: new Date().toISOString(), timeScale: 'TT', startJd, stepDays, bodies,
}) + '\n');
await writeFile('tests/fixtures/astro-small-bodies.json', JSON.stringify({ source: endpoint, timeScale: 'TT', fixtures }, null, 2) + '\n');
