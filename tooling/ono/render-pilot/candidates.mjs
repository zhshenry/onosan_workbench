// Code-owned closed set. Workflow inputs select only a state, never source paths,
// selectors, dimensions, hashes, destinations or publication wording.
import { createHash } from 'node:crypto';

export const CANDIDATE = 'design/mockups/design-a-glass.html';
export const STATE = 'historical-design-a-home';
export const ISSUE13_STATE = 'issue-13-year-picker-v1';
export const CANDIDATES = Object.freeze({
  [STATE]: Object.freeze({
    state: STATE, source: CANDIDATE, width: 1440, height: 1024,
    purpose: 'historical-prototype-render-pilot', issue: null, sourceSha256: null,
    description: 'Historical Design A, initial home',
    disclaimer: 'Render/attachment pilot only; not current product acceptance or plan approval.',
    attachmentLabel: 'Historical Design A initial home',
  }),
  [ISSUE13_STATE]: Object.freeze({
    state: ISSUE13_STATE, source: 'design/mockups/issue-13-year-picker-v1.html', width: 1440, height: 1024,
    purpose: 'issue-13-design-prototype', issue: '13',
    // Exact reviewed source bytes. Update only alongside a source review; never an input.
    sourceSha256: 'd70bbcb521974b7ca94740a06729b9cd4f787fb5c1579e18de118bb9aae8a240',
    description: 'Issue #13 year picker v1, three-state design prototype',
    disclaimer: 'Design prototype only; not product implementation, product acceptance or plan approval.',
    attachmentLabel: 'Issue 13 year picker v1 three-state design prototype',
  }),
});
export function getCandidate(state) {
  if (typeof state !== 'string' || !Object.hasOwn(CANDIDATES, state)) throw new Error('UNSUPPORTED_STATE');
  return CANDIDATES[state];
}
export function verifySource(candidate, bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (candidate.sourceSha256 !== null && hash !== candidate.sourceSha256) throw new Error('SOURCE_HASH_MISMATCH');
  return hash;
}
export function validatePublicationTarget(candidate, issue) {
  if (candidate.issue !== null && issue !== candidate.issue) throw new Error('PUBLICATION_TARGET_MISMATCH');
}
