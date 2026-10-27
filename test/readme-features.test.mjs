// Tests for the README feature lists (issue #42).
//
// Why this exists: both READMEs introduce the project as a reader *and editor*, but their
// feature lists still described a read-only reader — no edit pane, no split view, no images.
// The feature list is the part a visitor actually reads, and it was the least accurate part
// of the page, contradicting the rename to MDMiniEditor (#36).
//
// These tests pin the three shipped features that were missing, in both language editions.
// They assert on list *items*, not on loose keywords, so prose elsewhere in the file cannot
// satisfy the assertion by accident — the mutant at the bottom of this file is the check
// that each assertion can really fail.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const readmeEn = readFileSync(join(ROOT, 'README.md'), 'utf8');
const readmeCn = readFileSync(join(ROOT, 'README.cn.md'), 'utf8');

// The bullet items of the first `## Features` / `## 功能` section: everything between the
// heading and the next `###`/`##`/`---` line that starts as a list item.
function featureItems(src, heading) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.ok(start >= 0, `heading not found: ${heading}`);
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,3}\s/.test(line) || /^-{3,}\s*$/.test(line)) break;
    if (/^\s*-\s+/.test(line)) items.push(line);
  }
  return items;
}

// One item must carry every keyword of the feature (case-insensitive), so a stray word in a
// neighbouring bullet cannot pass the assertion for a feature that is not listed.
function hasItem(items, keywordSets) {
  return keywordSets.some((keywords) =>
    items.some((item) => keywords.every((k) => item.toLowerCase().includes(k.toLowerCase())))
  );
}

const EN_FEATURES = featureItems(readmeEn, '## Features');
const CN_FEATURES = featureItems(readmeCn, '## 功能');

test('the English feature list names the editor pane', () => {
  assert.ok(
    hasItem(EN_FEATURES, [['edit', 'preview'], ['editor']]),
    `no English item lists the editor pane; items: ${EN_FEATURES.join(' | ')}`
  );
});

test('the English feature list names the split view', () => {
  assert.ok(
    hasItem(EN_FEATURES, [['split', 'side by side']]),
    `no English item lists the split view; items: ${EN_FEATURES.join(' | ')}`
  );
});

test('the English feature list names image rendering', () => {
  assert.ok(
    hasItem(EN_FEATURES, [['image']]),
    `no English item lists image rendering; items: ${EN_FEATURES.join(' | ')}`
  );
});

test('the Chinese feature list names the editor pane', () => {
  assert.ok(
    hasItem(CN_FEATURES, [['编辑', '预览'], ['编辑器']]),
    `no Chinese item lists the editor pane; items: ${CN_FEATURES.join(' | ')}`
  );
});

test('the Chinese feature list names the split view', () => {
  assert.ok(
    hasItem(CN_FEATURES, [['分栏']]),
    `no Chinese item lists the split view; items: ${CN_FEATURES.join(' | ')}`
  );
});

test('the Chinese feature list names image rendering', () => {
  assert.ok(
    hasItem(CN_FEATURES, [['图片']]),
    `no Chinese item lists image rendering; items: ${CN_FEATURES.join(' | ')}`
  );
});

test('non-vacuity: the feature items are real list items, not the whole file', () => {
  // If `featureItems` ever returned every line, the assertions above would be satisfied by
  // prose alone. Pin the shape: a handful of short dash items, each a single line.
  assert.ok(EN_FEATURES.length >= 8 && EN_FEATURES.length < 40, `English items: ${EN_FEATURES.length}`);
  assert.ok(CN_FEATURES.length >= 8 && CN_FEATURES.length < 40, `Chinese items: ${CN_FEATURES.length}`);
  for (const item of [...EN_FEATURES, ...CN_FEATURES]) {
    assert.match(item, /^\s*-\s+\S/, `not a list item: ${item}`);
  }
});

test('non-vacuity: hasItem can fail', () => {
  assert.equal(hasItem(EN_FEATURES, [['zzznotpresent']]), false);
  assert.equal(hasItem(CN_FEATURES, [['不存在的词']]), false);
});

test('the English feature list names the two-way scroll sync', () => {
  assert.ok(
    hasItem(EN_FEATURES, [['sync'], ['scroll']]),
    `no English item lists the scroll sync; items: ${EN_FEATURES.join(' | ')}`
  );
});

test('the Chinese feature list names the two-way scroll sync', () => {
  assert.ok(
    hasItem(CN_FEATURES, [['同步']]),
    `no Chinese item lists the scroll sync; items: ${CN_FEATURES.join(' | ')}`
  );
});
