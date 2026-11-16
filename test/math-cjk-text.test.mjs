// Regression: a formula carrying Chinese inside \text{} must still render.
//
// The bug: `$...$` was gated on isNonFormulaSpan(), which rejects any body
// containing CJK. That rule exists to keep a mis-paired price span like
// "$5.50 和 $6.00 元" from being eaten, but it also rejected real formulas whose
// text labels are Chinese — a cases branch annotated 不可识别 rendered as
// literal TeX in the preview. The \(...\) branch already masked \text{} groups
// before the prose test; the `$` branch did not, so the same document rendered
// differently depending on the delimiter.
//
// These run the shipped helpers, not a copy.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'md-editor.html'), 'utf8');

function loadProseTest() {
  const cut = (from, to) => html.slice(html.indexOf(from), html.indexOf(to));
  const grab = (name) => {
    const at = html.indexOf('function ' + name + '(');
    if (at < 0) throw new Error(name + ' not found');
    const ends = ['\n  function ', '\n  const '].map(t => html.indexOf(t, at + 1)).filter(i => i > 0);
    return html.slice(at, ends.length ? Math.min(...ends) : html.length);
  };
  const src = [
    cut('const CJK =', 'const TEX_GROUP_RE'),
    cut('const TEX_GROUP_RE', 'function hasBareCJK'),
    grab('hasBareCJK'),
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(src + '\nreturn hasBareCJK;')();
}

const hasBareCJK = loadProseTest();

test('a formula may label a cases branch in Chinese inside \\text{}', () => {
  // The exact shape from the report.
  const body = String.raw`n_{\rm grid} = \begin{cases} +\infty, & \Delta > \varepsilon/\beta \text{（不可识别）}, \\ \Theta\left(\dfrac{\log m}{\varepsilon^2}\right), & \Delta \le \varepsilon/\beta. \end{cases}`;
  assert.equal(
    hasBareCJK(body), false,
    'Chinese inside \\text{} is a label, not prose — this formula must render as math'
  );
});

test('a mis-paired price span is still prose, so the line survives', () => {
  // The regression the CJK rule was introduced for: in "税费 $5.50 和 $6.00 元"
  // the first `$` pairs with the second, and the span between them is Chinese
  // prose. Treating it as math swallowed the text.
  assert.equal(hasBareCJK('5.50 和 '), true);
});

test('bare Chinese outside \\text{} still means prose', () => {
  assert.equal(hasBareCJK('a + 中文'), true);
});

test('a plain formula and a bare number are formulas', () => {
  assert.equal(hasBareCJK('a + b'), false);
  assert.equal(hasBareCJK('0.87'), false);
});

test('every \\text-like group is masked, not just \\text', () => {
  for (const cmd of ['text', 'textrm', 'mbox', 'textbf', 'textit']) {
    assert.equal(
      hasBareCJK('a + \\' + cmd + '{中文}'), false,
      `${cmd}{} must be masked before the prose test`
    );
  }
});
