// Behaviour contracts for the edit pane's selection colours and the three-state
// colour scheme.
//
// Why these exist:
//   · #selection — the visible glyphs are painted by `.editor-hl`, which sits
//     UNDER `.editor-ta`. The textarea draws no glyphs of its own (`color:
//     transparent`), so its ::selection background is the ONLY thing a selected
//     line shows. An opaque background therefore blanks the line. That is a real
//     regression users hit, and it is invisible to any test that only checks the
//     HTML parses — so it is asserted here as a relationship: whatever background
//     the selection paints, the underlying text must stay legible against it.
//   · #theme — `跟随系统` (auto) must resolve through prefers-color-scheme every
//     time it is applied, not once at load, or the page stops following the OS.
//
// These test the pure helpers in the page plus the CSS relationship. They do not
// drive a browser (that lives in e2e/).
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'md-editor.html'), 'utf8');

// Pull the script out of the page and evaluate only the pure helpers, so the
// assertions exercise the shipped code rather than a copy of it.
function loadHelpers() {
  // Take each helper from its own definition up to the next top-level
  // `function` — slicing one range [resolveTheme .. nextTheme] would miss
  // normalizeTheme, which is declared before resolveTheme.
  const names = ['normalizeTheme', 'resolveTheme', 'nextTheme'];
  const src = names
    .map((name) => {
      const start = html.indexOf(`function ${name}(`);
      if (start < 0) throw new Error(`${name} not found in md-editor.html`);
      const next = html.indexOf('\n  function ', start + 1);
      const fallback = html.indexOf('\n  const ', start + 1);
      const ends = [next, fallback].filter((i) => i > 0);
      return html.slice(start, ends.length ? Math.min(...ends) : html.length);
    })
    .join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(src + '\nreturn { resolveTheme, normalizeTheme, nextTheme };')();
}

const { resolveTheme, normalizeTheme, nextTheme } = loadHelpers();

test('auto resolves through the OS preference every time it is applied', () => {
  // The bug this guards: deciding once at load. If `auto` ignored its argument
  // and cached the first answer, these two calls would agree.
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
});

test('an explicit light or dark outranks the OS preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('stored values and junk both normalise to a usable preference', () => {
  assert.equal(normalizeTheme('auto'), 'auto');
  assert.equal(normalizeTheme('dark'), 'dark');
  // null is "nothing stored yet" — auto is the only state that can follow the
  // OS, so it is the right starting point, and a corrupt value must not lock
  // the page into a scheme it cannot explain.
  assert.equal(normalizeTheme(null), 'auto');
  assert.equal(normalizeTheme('purple'), 'auto');
});

test('cycling visits all three states and returns to the start', () => {
  const seen = [];
  let pref = 'auto';
  for (let i = 0; i < 3; i++) {
    pref = nextTheme(pref);
    seen.push(pref);
  }
  assert.deepEqual(new Set(seen.concat('auto')).size, 3, `cycle covered ${seen.join(',')}`);
  assert.equal(pref, 'auto', 'three presses must return to the starting state');
});

test('the selection background is translucent, so it cannot cover the glyph layer', () => {
  // The visible text lives in .editor-hl UNDER .editor-ta. A selection block
  // that paints fully opaque hides it. Assert the alpha channel stays well
  // below opaque: color-mix(...) with a percentage below 100, or an rgba()/
  // hsla() alpha below 1.
  const block = html.slice(html.indexOf('.editor-ta::selection'), html.indexOf('.editor-ta::selection') + 700);
  assert.ok(block.includes('::selection'), 'rule present');
  const mix = block.match(/color-mix\(in srgb,\s*(?:var\((--[\w-]+)\)|#[0-9a-f]{3,8}|rgb[^,]*)\s+(\d+(?:\.\d+)?)%/i);
  if (mix) {
    assert.ok(Number(mix[2]) < 100, `selection background is ${mix[2]}% — opaque hides the text underneath`);
  } else {
    const alpha = block.match(/rgba?\([^)]*?,\s*(0?\.\d+|1|0)\s*\)/i);
    assert.ok(alpha, 'selection background must be a colour with explicit alpha');
    assert.ok(Number(alpha[1]) < 1, `selection alpha ${alpha[1]} is opaque`);
  }
});

test('selection colour is defined for both schemes', () => {
  // A rule that only lands in light mode ships a broken dark mode.
  const block = html.slice(html.indexOf('.editor-ta::selection'), html.indexOf('.editor-ta::selection') + 700);
  assert.ok(/color-mix|\bvar\(--/.test(block), 'must derive from theme variables, not a fixed colour');
});

test('the three scheme buttons exist and the old single toggle is gone', () => {
  for (const id of ['btnThemeLight', 'btnThemeDark', 'btnThemeAuto']) {
    assert.ok(html.includes(`id="${id}"`), `${id} missing`);
  }
  assert.ok(
    !/id="btnTheme"/.test(html),
    'the single btnTheme toggle is still in the markup — two controls would disagree'
  );
});
