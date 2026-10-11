// Parameter preparation only. No GitHub client, credential access or dispatch.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKFLOW = 'ono-prototype-render.yml';
import { STATE, getCandidate, validatePublicationTarget } from './candidates.mjs';
export { STATE };
const need = (ok, code) => { if (!ok) throw new Error(code); };
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const fields = ['approved_sha', 'current_main_sha', 'publish', 'target_issue', 'approval_id', 'prototype_state'];

// Both SHAs are caller-supplied statements, NOT approval/authentication evidence.
// The assistant must independently read current main and check the exact active
// main-chat approval before preparation and again immediately before dispatch.
export function prepareDispatch(input) {
  need(input !== null && typeof input === 'object' && !Array.isArray(input), 'INPUT_OBJECT_REQUIRED');
  need(Object.keys(input).every(key => fields.includes(key)), 'UNKNOWN_FIELD');
  need(isSha(input.approved_sha) && isSha(input.current_main_sha), 'FULL_SHA_REQUIRED');
  need(input.approved_sha === input.current_main_sha, 'MAIN_MOVED');
  need(input.publish === undefined || typeof input.publish === 'boolean', 'BOOLEAN_PUBLICATION_REQUIRED');
  const publish = input.publish ?? false;
  const candidate = getCandidate(input.prototype_state === undefined ? STATE : input.prototype_state);
  if (publish) {
    need(typeof input.target_issue === 'string' && /^[1-9][0-9]{0,8}$/.test(input.target_issue), 'EXACT_ISSUE_REQUIRED');
    validatePublicationTarget(candidate, input.target_issue);
    need(typeof input.approval_id === 'string' && /^[a-z0-9][a-z0-9-]{7,63}$/.test(input.approval_id), 'APPROVAL_MARKER_REQUIRED');
  } else {
    need(input.target_issue === undefined && input.approval_id === undefined, 'PUBLICATION_FIELDS_WITHOUT_PUBLICATION');
  }
  return {
    ref: 'main',
    inputs: {
      approved_sha: input.approved_sha,
      prototype_state: candidate.state,
      post_attachment: publish,
      target_issue: publish ? input.target_issue : '',
      approval_id: publish ? input.approval_id : '',
    },
  };
}

export function parseArgs(args) {
  need(Array.isArray(args) && args.length <= 11, 'INVALID_ARGUMENTS');
  const names = new Map([
    ['--approved-sha', 'approved_sha'], ['--current-main-sha', 'current_main_sha'],
    ['--target-issue', 'target_issue'], ['--approval-id', 'approval_id'],
    ['--publish', 'publish'], ['--prototype-state', 'prototype_state'],
  ]);
  const input = {};
  for (let index = 0; index < args.length; index++) {
    const key = names.get(args[index]);
    need(key && !Object.hasOwn(input, key), 'UNKNOWN_OR_DUPLICATE_ARGUMENT');
    if (key === 'publish') input[key] = true;
    else {
      const value = args[++index];
      need(typeof value === 'string' && value.length <= 64 && !value.startsWith('--'), 'ARGUMENT_VALUE_REQUIRED');
      input[key] = value;
    }
  }
  return input;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const payload = prepareDispatch(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(payload, null, 2));
    console.error(`Prepared ${WORKFLOW} parameters only. No dispatch performed; verify current main and main-chat approval before use.`);
  } catch {
    // Do not echo untrusted arguments or any accidental credential pasted here.
    console.error('Parameter preparation refused. Use full matching approved/current-main SHAs; publication also requires an exact issue and unique approval ID.');
    process.exitCode = 1;
  }
}
