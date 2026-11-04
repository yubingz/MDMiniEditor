// AMS / LaTeX2e delimiter tests: \( ... \) and \[ ... \]
//
// Documents exported from Word or older LaTeX toolchains write math with
// `\( \)` and `\[ \]` instead of `$`/`$$`. The reader's `$` channel never saw
// them, so the whole formula rendered as escaped literal text. These tests
// exercise the real protectMath()/protectInlineMath()/splitTexSegments() source
// extracted from md-editor.html — the same code the page runs.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = join(HERE, '..', 'md-editor.html');

// Extract the math-protection surface as three precise slices — the helpers,
// protectMath (parser-side), and splitTexSegments (DOM safety-net side) — and
// run them as-is. The same code the page runs.
function loadMathProtection() {
  const html = readFileSync(READER, 'utf8');
  const fnBody = (name) => {
    const at = html.indexOf('function ' + name);
    assert.ok(at >= 0, `missing ${name} in md-editor.html`);
    // brace-match from the first '{' so nested blocks are included — protectMath
    // contains inner functions and an IIFE; a naive '\n  }' search truncates it.
    let depth = 0;
    let i = html.indexOf('{', at);
    for (; i < html.length; i++) {
      const c = html[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return html.slice(at, i) + '\n';
  };
  const helpersAt = html.indexOf('const PH_OPEN');
  const helpersEnd = html.indexOf('function protectMath');
  assert.ok(helpersAt >= 0 && helpersEnd > helpersAt, 'math helper block not found');
  let section = html.slice(helpersAt, helpersEnd) + fnBody('protectMath') + fnBody('splitTexSegments');
  section = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(
    section +
      '\nreturn { protectMath: protectMath, splitTexSegments: splitTexSegments };'
  )();
}

const mp = loadMathProtection();
const PH = /\uE000(\d+)\uE001/g;

const storeOf = (r) => r.store;
const texAt = (r, i) => r.store[i].tex;

// ── inline \( ... \) ────────────────────────────────────────────────────
test('\\(...\\) becomes an inline formula in the same store as $', () => {
  const r = mp.protectMath('能量守恒 \\(E = mc^2\\) 众所周知');
  assert.equal(r.store.length, 1, 'one formula expected');
  assert.equal(texAt(r, 0), 'E = mc^2');
  assert.equal(r.store[0].display, false);
  assert.ok(r.text.includes('\uE000' + '0' + '\uE001'), 'placeholder must surround the index');
});

test('\\[...\\] becomes a display formula', () => {
  const r = mp.protectMath('\\[\\frac{a}{b}\\]');
  assert.equal(r.store.length, 1);
  assert.equal(texAt(r, 0), '\\frac{a}{b}');
  assert.equal(r.store[0].display, true);
});

test('multi-line \\[ ... \\] spans lines like $$', () => {
  const r = mp.protectMath('\\[\n\\sum_{i=1}^{N} x_i\n\\]\n后文');
  assert.equal(r.store.length, 1);
  assert.equal(texAt(r, 0), '\\sum_{i=1}^{N} x_i');
  assert.equal(r.store[0].display, true);
  // The placeholder lands on the line where \] closes (the opener's own line
  // contributes only its pre-\[ remnant), same as multi-line $$.
  assert.ok(r.text.includes('\uE000' + '0' + '\uE001'), 'placeholder must be in the text');
});

test('an unclosed \\[ keeps its text instead of swallowing the document', () => {
  const r = mp.protectMath('前\n\\[\nx = 1\n没有闭合');
  assert.equal(r.store.length, 0, 'nothing may be stored');
  assert.ok(r.text.includes('\\['), 'the raw opener must survive to render as text');
  assert.ok(r.text.includes('没有闭合'), 'trailing prose must not be eaten');
});

test('\\\\( is a hard break plus paren, not math', () => {
  // In TeX-exported markdown, `\\` ends a line and `(` starts prose.
  const r = mp.protectMath('换行\\\\(下一句)');
  assert.equal(r.store.length, 0);
});

test('a \\(...\\) span straddling CJK prose stays text', () => {
  const r = mp.protectMath('说明 \\(见下表的)价格 (另一定价\\) 结束');
  assert.equal(r.store.length, 0, 'mis-paired AMS pair around prose must not become math');
});

test('Chinese inside \\text{} does not veto the AMS formula', () => {
  // The regression (2026-11-04, user screenshot): an exporter wrote
  // \(\gamma_0^{\rm trial}=10^{(\text{起点}+0.5k)/10}\) — a real formula whose only
  // CJK sits inside \text{}. The bare-CJK prose guard rejected the whole span and it
  // rendered as raw source. Masking \text{…}/\mbox{…} bodies before the test keeps the
  // price case dead (bare CJK between the delimiters) while letting this render.
  const r = mp.protectMath('向上扫；\\(\\gamma_0^{\\rm trial}=10^{(\\text{起点}+0.5k)/10}\\)。');
  assert.equal(r.store.length, 1);
  assert.equal(texAt(r, 0), '\\gamma_0^{\\rm trial}=10^{(\\text{起点}+0.5k)/10}');
  // …and the prose case must STILL be rejected: CJK outside any \text group.
  const p = mp.protectMath('税费 \\(5.50 和 \\)6.00 元');
  assert.equal(p.store.length, 0, 'bare CJK in an AMS span is still prose');
});

test('$ formulas keep working next to AMS delimiters', () => {
  const r = mp.protectMath('对比 $x^2$ 与 \\(y^2\\) 和 \\[z^2\\]');
  assert.equal(r.store.length, 3);
  // Store order follows the reader's processing order (\[ is claimed before the
  // inline pass). restoreMathHtml looks items up BY INDEX, so what must hold is
  // that each formula is present with the right display flag.
  const byTex = {};
  r.store.forEach((it) => { byTex[it.tex] = it.display; });
  assert.deepEqual(byTex, { 'x^2': false, 'y^2': false, 'z^2': true });
  const seen = [];
  r.text.replace(/\uE000(\d+)\uE001/g, (_, i) => { seen.push(Number(i)); return ''; });
  assert.equal(seen.length, 3, 'three placeholders must remain in the text');
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test('AMS math inside a fenced code block is left alone', () => {
  const r = mp.protectMath('```tex\n\\[ a \\]\n```');
  assert.equal(r.store.length, 0);
});

// ── DOM safety-net path (splitTexSegments) ──────────────────────────────
const segTypes = (segs) => segs.map((s) => s.type).join(',');

test('splitTexSegments recognizes \\(..\\) and \\[..\\]', () => {
  const segs = mp.splitTexSegments('式 \\(x_i\\) 中');
  assert.equal(segTypes(segs), 'text,math,text');
  assert.equal(segs[1].value, 'x_i');
  assert.equal(segs[1].display, false);
  const d = mp.splitTexSegments('\\[a+b\\]');
  assert.equal(d[0].type, 'math');
  assert.equal(d[0].display, true);
});

test('splitTexSegments rejects \\(..\\) across a newline and keeps the characters', () => {
  const segs = mp.splitTexSegments('开 \\(a\nb\\) 尾');
  assert.equal(segTypes(segs), 'text');
  assert.ok(segs[0].value.includes('\\('), 'source characters must be preserved verbatim');
});

test('splitTexSegments does not treat \\\\( as math', () => {
  const segs = mp.splitTexSegments('换行\\\\(下一句)');
  assert.equal(segTypes(segs), 'text');
});

// ── non-vacuity guards ──────────────────────────────────────────────────
test('both entry points share one closer rule via findMathClose', () => {
  const html = readFileSync(READER, 'utf8');
  const fn = html.match(/function\s+findMathClose[\s\S]*?\n  \}/);
  assert.ok(fn, 'findMathClose must exist');
  assert.match(fn[0], /evenBackslashes\(text, ci\)/, 'closer must skip escaped closers');
  // protectInlineMath and splitTexSegments must both call it — a guard in only
  // one entry point leaves the other eating or missing text.
  const pim = html.match(/function\s+protectInlineMath[\s\S]*?\n  \}/)[0];
  const sts = html.match(/function\s+splitTexSegments[\s\S]*?\n  \}/)[0];
  assert.match(pim, /findMathClose\(line, '\)'/, 'protectInlineMath must use findMathClose');
  assert.match(sts, /findMathClose\(text, closeTok/, 'splitTexSegments must use findMathClose');
});
