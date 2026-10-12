// Stage A: GitHub GET only. No credentials, scheduler, subprocess or writes.
export const REPOSITORY = 'zhshenry/onosan_workbench';
const PREFIX = `https://api.github.com/repos/${REPOSITORY}`;

export function createGitHubReader(get, { source = 'fixture', clock = Date.now } = {}) {
  if (typeof get !== 'function' || !['fixture', 'live-connector'].includes(source)) throw new Error('INVALID_READER');
  const reads = [];
  async function read(path) {
    // Repository-scoped, purpose-limited endpoint allowlist. Never follow supplied URLs.
    if (!/^\/(?:issues\/[1-9][0-9]*(?:\/comments)?|pulls\/[1-9][0-9]*|git\/ref\/heads\/main|actions\/runs(?:\/[1-9][0-9]*(?:\/jobs|\/artifacts)?)?|git\/commits\/[a-f0-9]{40})(?:\?[a-zA-Z0-9_=&-]+)?$/.test(path)) throw new Error('READ_ENDPOINT_DENIED');
    const startedAt = new Date(clock()).toISOString();
    const data = await get(`${PREFIX}${path}`); // Transport returns decoded GitHub JSON, not instructions.
    if (!data || typeof data !== 'object') throw new Error('INVALID_GITHUB_RESPONSE');
    reads.push({ url: `${PREFIX}${path}`, startedAt, completedAt: new Date(clock()).toISOString() });
    return structuredClone(data);
  }
  async function pages(path, key) {
    const result = [], ids = new Set();
    let expectedTotal = null;
    for (let page = 1; page <= 100; page++) {
      const data = await read(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = key ? data[key] : data;
      if (!Array.isArray(items)) throw new Error('PAGINATION_INVALID');
      if (key) {
        if (!Number.isSafeInteger(data.total_count) || data.total_count < 0 ||
            (expectedTotal !== null && expectedTotal !== data.total_count)) throw new Error('PAGINATION_TOTAL_INVALID_OR_CHANGED');
        expectedTotal = data.total_count;
        if (path.startsWith('/actions/runs?') && expectedTotal >= 1000) throw new Error('RUN_SEARCH_LIMIT_INCOMPLETE');
      }
      for (const item of items) {
        if (!Number.isSafeInteger(item.id) || item.id < 1 || ids.has(item.id)) throw new Error('PAGINATION_ID_INVALID_OR_DUPLICATE');
        ids.add(item.id);
      }
      result.push(...items);
      if (items.length < 100) {
        if (key && result.length !== expectedTotal) throw new Error('PAGINATION_INCOMPLETE');
        return result;
      }
    }
    throw new Error('PAGINATION_INCOMPLETE');
  }
  return { read, pages, source, clock, reads };
}

function identity(issue, pr, main) {
  return JSON.stringify({ issue: [issue.id, issue.number, issue.state, issue.state_reason, issue.updated_at],
    pr: pr && [pr.id, pr.number, pr.state, pr.head?.sha, pr.base?.sha, pr.merged, pr.merge_commit_sha, pr.updated_at],
    main: main.object?.sha });
}
function checkEntities(issueData, prData, main, issue, pr) {
  if (!Number.isSafeInteger(issueData.id) || issueData.id < 1 || issueData.pull_request || issueData.number !== issue ||
      issueData.url !== `${PREFIX}/issues/${issue}` || issueData.repository_url !== PREFIX) throw new Error('ISSUE_IDENTITY_MISMATCH');
  if (pr !== null && (!prData || !Number.isSafeInteger(prData.id) || prData.id < 1 || prData.number !== pr ||
      prData.url !== `${PREFIX}/pulls/${pr}` || prData.base?.repo?.id !== 1372377655)) throw new Error('PR_IDENTITY_MISMATCH');
  if (main.ref !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(main.object?.sha ?? '')) throw new Error('MAIN_IDENTITY_MISMATCH');
}

export async function collect(reader, { issue, pr = null }) {
  if (!Number.isSafeInteger(issue) || issue < 1 || (pr !== null && (!Number.isSafeInteger(pr) || pr < 1))) throw new Error('INVALID_TARGET');
  const startedAt = new Date(reader.clock()).toISOString();
  const readOffset = reader.reads.length;
  const firstIssue = await reader.read(`/issues/${issue}`);
  if (firstIssue.pull_request || firstIssue.number !== issue) throw new Error('ISSUE_IDENTITY_MISMATCH');
  const firstPr = pr === null ? null : await reader.read(`/pulls/${pr}`);
  if (firstPr && firstPr.number !== pr) throw new Error('PR_IDENTITY_MISMATCH');
  const firstMain = await reader.read('/git/ref/heads/main');
  checkEntities(firstIssue, firstPr, firstMain, issue, pr);
  const comments = await reader.pages(`/issues/${issue}/comments`);
  const prComments = pr === null ? [] : await reader.pages(`/issues/${pr}/comments`);
  const shas = [...new Set([firstMain.object?.sha, firstPr?.head?.sha].filter(Boolean))];
  if (!shas.length || shas.some(sha => !/^[a-f0-9]{40}$/.test(sha))) throw new Error('SHA_MISSING');
  const runs = [], runLists = [];
  for (const sha of shas) {
    const found = await reader.pages(`/actions/runs?head_sha=${sha}`, 'workflow_runs');
    runLists.push({ sha, found });
    for (const summary of found) {
      if (runs.some(run => run.id === summary.id)) continue;
      const run = await reader.read(`/actions/runs/${summary.id}`);
      if (run.id !== summary.id || run.head_sha !== sha || run.url !== `${PREFIX}/actions/runs/${summary.id}`) throw new Error('RUN_IDENTITY_MISMATCH');
      const jobs = await reader.pages(`/actions/runs/${summary.id}/jobs?filter=latest`, 'jobs');
      const artifacts = await reader.pages(`/actions/runs/${summary.id}/artifacts`, 'artifacts');
      const after = await reader.read(`/actions/runs/${summary.id}`);
      if (after.id !== summary.id || after.head_sha !== sha || after.url !== run.url) throw new Error('RUN_IDENTITY_MISMATCH');
      const stable = ['head_sha', 'run_attempt', 'status', 'conclusion', 'updated_at'].every(k => run[k] === after[k]);
      runs.push({ ...after, jobs, artifacts, stable });
    }
  }
  const lastIssue = await reader.read(`/issues/${issue}`);
  const lastPr = pr === null ? null : await reader.read(`/pulls/${pr}`);
  const lastMain = await reader.read('/git/ref/heads/main');
  checkEntities(lastIssue, lastPr, lastMain, issue, pr);
  // Re-read comments too: edited/deleted approvals need not change the PR head.
  const lastComments = await reader.pages(`/issues/${issue}/comments`);
  const lastPrComments = pr === null ? [] : await reader.pages(`/issues/${pr}/comments`);
  const runIdentity = list => JSON.stringify(list.map(r => [r.id, r.head_sha, r.run_attempt, r.status, r.conclusion, r.updated_at]).sort((a, b) => a[0] - b[0]));
  let runListsStable = true;
  for (const { sha, found } of runLists) {
    const last = await reader.pages(`/actions/runs?head_sha=${sha}`, 'workflow_runs');
    if (runIdentity(found) !== runIdentity(last)) runListsStable = false;
  }
  const stable = identity(firstIssue, firstPr, firstMain) === identity(lastIssue, lastPr, lastMain) &&
    JSON.stringify(comments) === JSON.stringify(lastComments) && JSON.stringify(prComments) === JSON.stringify(lastPrComments) && runs.every(run => run.stable) && runListsStable;
  return { schema: 'ono-read-only-snapshot-v1', repository: REPOSITORY, source: reader.source,
    startedAt, collectedAt: new Date(reader.clock()).toISOString(), complete: true, stable,
    issue: lastIssue, pr: lastPr, mainSha: lastMain.object?.sha,
    comments: lastComments, prComments: lastPrComments, runs,
    reads: structuredClone(reader.reads.slice(readOffset)),
    limits: ['Snapshot is not atomic; re-collect before any future action.', 'GitHub account identity does not prove a human author.',
      'Artifact metadata is not image access, byte integrity or visual review.', 'No workflow logs or tested merge parents are inferred from event metadata.'] };
}
