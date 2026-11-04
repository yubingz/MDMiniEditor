// Offline math fallback tests for md-editor.html
//
// The reader renders math with KaTeX when it can load it and with the built-in
// `fallbackTexToHtml()` when it cannot (no network, no `katex/` folder, CDN
// blocked). That fallback used to print the raw command for every operator
// name it did not know (`\max`, `\min`, `\log`, …), for the sizing commands
// (`\Big`, `\big`) and for any unknown control word, so the project's own
// `sample.md` showed `λ\max` instead of `λmax`.
//
// These tests exercise the real fallback source, extracted from the reader the
// same way the app runs it, and assert that no TeX command residue survives.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = join(HERE, '..', 'md-editor.html');

// The math fallback lives between the "LaTeX / Math rendering" section header
// and `renderMathHtml()`, i.e. outside the `/* PARSER:BEGIN */` block. Extract
// that span and run it as-is; only comments are stripped.
function loadMathRegion() {
  const html = readFileSync(READER, 'utf8');
  const lines = html.split(/\r?\n/);
  const a = lines.findIndex((l) => l.includes('LaTeX / Math rendering'));
  const b = lines.findIndex((l) => l.includes('function renderMathHtml'));
  assert.ok(a >= 0 && b > a, 'math region markers not found');
  let section = lines.slice(a + 1, b - 1).join('\n');
  section = section.slice(section.indexOf('*/') + 2); // drop the box header comment
  section = section.replace(/\/\*[\s\S]*?\*\//g, ''); // drop remaining block comments
  // `normalizeTex` sits just above the region in the reader; keep the same shape.
  // Read it out of the reader instead of re-writing the escapes here.
  const marker = 'function normalizeTex(tex) {';
  const at = html.indexOf(marker);
  assert.ok(at >= 0, 'normalizeTex not found in md-editor.html');
  const prefix = html.slice(at, html.indexOf('\n  }', at) + 4) + '\n';
  // eslint-disable-next-line no-new-func
  return new Function(
    prefix +
      section +
      '\nreturn { fallbackTexToHtml: fallbackTexToHtml, normalizeTex: normalizeTex, OPERATORS: (typeof OPERATORS === "undefined" ? null : OPERATORS) };'
  )();
}

const math = loadMathRegion();
const asText = (html) => html.replace(/<[^>]+>/g, '');
const render = (tex) => asText(math.fallbackTexToHtml(math.normalizeTex(tex)));

// ── Regression: issue #12 ───────────────────────────────────────────────
test('operator names render upright instead of leaking the command', () => {
  assert.equal(render('\\lambda_{\\max}'), 'λmax', '\\max must render as max');
  assert.equal(render('\\min_{w}'), 'minw', '\\min must render as min');
  assert.equal(render('\\log x'), 'log x', '\\log must render as log');
  assert.equal(render('\\exp y'), 'exp y', '\\exp must render as exp');
  assert.equal(render('\\lim_{n\\to\\infty} z'), 'limn→∞ z', '\\lim must render as lim');
});

test('sizing commands drop the name and keep their delimiter', () => {
  assert.equal(render('\\Big\\{1-\\eta\\lambda_{\\max}\\}^\\tau'), '{1-ηλmax}τ');
  assert.equal(render('\\big(a\\big)'), '(a)');
  assert.equal(render('\\Bigg[ x \\Bigg]'), '[ x ]');
});

test('sample.md formulas render without a backslash residue', () => {
  const demo = [
    '\\C_{\\tau,k}\\|2\\le c\\tau^{+}:=\\max\\Big\\{1-\\eta\\lambda_{\\max}\\}^\\tau',
    '\\min_{w}\\; \\frac{1}{N}\\sum_{i=1}^{N}\\ell(f(x_i;w),y_i)+\\lambda\\|w\\|_2^2'
  ];
  for (const tex of demo) {
    assert.ok(!render(tex).includes('\\'), `raw TeX leaked for: ${tex}\n  got: ${render(tex)}`);
  }
});

test('an unknown command degrades to its name, without the backslash', () => {
  const out = render('\\foo_{bar}');
  assert.ok(!out.includes('\\'), `backslash leaked: ${out}`);
  assert.equal(out, 'foobar');
});

test('known fallback rendering is unchanged', () => {
  assert.equal(render('\\alpha\\beta\\gamma'), 'αβγ', 'Greek letters still map');
  assert.equal(render('\\left(\\frac{a}{b}\\right)'), '(ab)', '\\left/\\right and \\frac still work');
  assert.equal(render('\\sqrt{x}'), '√x', '\\sqrt still works');
  const frac = math.fallbackTexToHtml(math.normalizeTex('\\frac{a}{b}'));
  assert.match(frac, /math-frac/, '\\frac still uses the fraction structure');
  assert.match(math.fallbackTexToHtml('\\text{abc}'), /math-text/, '\\text still renders as text');
});

test('norm bars render as ‖, not as a bare pipe (2026-11-04 bug report)', () => {
  // The regression: \| fell through the escaped-punct branch and printed '|'.
  assert.equal(render('\\|\\ell_S\\|^2'), '∥ℓS∥2');
  assert.equal(render('\\Vert x \\Vert'), '∥ x ∥');
  assert.equal(render('\\lvert a \\rvert'), '∣ a ∣');
  assert.ok(!render('\\|x\\|').includes('|'), 'a bare pipe leaked');
});

// Non-vacuity: the assertions above must fail if the tables/unknown-command
// handling are reverted. Guard the pieces the tests depend on.
test('the operator table and the no-backslash degrade are both present', () => {
  assert.equal(typeof math.OPERATORS, 'object', 'OPERATORS table must exist in the math region');
  assert.equal(math.OPERATORS.max, 'max', 'OPERATORS must carry the operator names');
  assert.equal(math.OPERATORS.Big, '', 'sizing commands must map to an empty string');
  const html = readFileSync(READER, 'utf8');
  assert.ok(
    !/htmlEscape\('\\\\\\\\' \+ name\)/.test(html),
    'the old `\\` + name fallback must be gone'
  );
});
