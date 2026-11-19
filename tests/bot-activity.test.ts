import test from 'node:test';
import assert from 'node:assert/strict';
import { botToolActivity } from '../shared/bot-activity';

test('tool expressions distinguish reading, delegation and writes without inspecting user content', () => {
  for (const name of ['list_tasks', 'read_resource', 'read_book_note', 'browser_snapshot', 'browser_screenshot']) assert.equal(botToolActivity(name), 'searching', name);
  assert.equal(botToolActivity('send_to_bot'), 'sending');
  for (const name of ['propose_create', 'propose_update', 'save_artifact', 'browser_click', 'browser_type', 'unknown_tool']) assert.equal(botToolActivity(name), 'working', name);
});
