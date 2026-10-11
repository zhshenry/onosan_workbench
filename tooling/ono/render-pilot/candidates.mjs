// Code-owned closed set. Workflow inputs select only a state, never source paths,
// selectors, dimensions, hashes, destinations or publication wording.
import { createHash } from 'node:crypto';

export const CANDIDATE = 'design/mockups/design-a-glass.html';
export const STATE = 'historical-design-a-home';
export const ISSUE13_STATE = 'issue-13-year-picker-v1';
export const ISSUE13_DROPDOWN_STATE = 'issue-13-year-dropdown-v2';
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
  [ISSUE13_DROPDOWN_STATE]: Object.freeze({
    state: ISSUE13_DROPDOWN_STATE, source: 'design/mockups/issue-13-year-dropdown-v2.html', width: 1440, height: 1024,
    purpose: 'issue-13-design-prototype', issue: '13',
    // Exact reviewed source bytes. Update only alongside a source review; never an input.
    sourceSha256: 'b81b3e38b7fdb33fa6a09c276ed8232af8c874d369500edf1106047081c4f536',
    description: '议题 #13 年份下拉 v2，三状态设计原型',
    disclaimer: '仅用于设计方案预览，不代表产品实现、产品验收或方案批准。',
    attachmentLabel: '议题 13 年份下拉 v2 三状态设计原型',
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
