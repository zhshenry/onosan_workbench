import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('对话模型与决策模型区块用约 250ms 高度/透明度过渡，减少动效时不动画', () => {
  const view = readFileSync(new URL('../src/views/AiSettings.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/shell.css', import.meta.url), 'utf8');
  const toggle = view.slice(view.indexOf('className="ai-config-surface-toggle"'), view.indexOf('className="ai-config-list">'));
  assert.match(toggle, /aria-expanded=\{sectionOpen\[surface\]\}/);
  assert.match(toggle, /aria-controls=\{`ai-surface-\$\{surface\}`\}/);
  assert.match(toggle, /id=\{`ai-surface-\$\{surface\}`\}/);
  assert.match(toggle, /data-open=\{sectionOpen\[surface\] \? 'true' : 'false'\}/);
  assert.match(toggle, /inert=\{!sectionOpen\[surface\]\}/);
  assert.match(toggle, /aria-hidden=\{!sectionOpen\[surface\]\}/);
  assert.match(view, /className="ai-config-models" id=\{`ai-models-\$\{provider\.id\}`\} hidden=\{!open\}/);
  assert.doesNotMatch(view, /ai-config-models[^>]*ai-config-surface-panel|ai-config-surface-panel[^>]*ai-config-models/);

  const rule = css.slice(css.indexOf('.ai-config-surface-panel {'), css.indexOf('.ai-config-status'));
  assert.match(rule, /\.ai-config-surface-panel \{[^}]*grid-template-rows:\s*1fr;[^}]*opacity:\s*1;/s);
  assert.match(rule, /\.ai-config-surface-panel\[data-open='false'\] \{[^}]*grid-template-rows:\s*0fr;[^}]*opacity:\s*0;/s);
  assert.match(rule, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ai-config-surface-panel \{ transition: grid-template-rows 250ms ease, opacity 250ms ease; \}/);
  assert.match(view, /aria-expanded=\{sectionOpen\[surface\]\}[\s\S]*setSectionOpen\(previous => \(\{ \.\.\.previous, \[surface\]: !previous\[surface\] \}\)\)/);
  assert.equal(rule.includes('250ms'), true);
});
