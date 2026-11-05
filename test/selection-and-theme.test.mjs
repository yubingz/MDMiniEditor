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

test('the selected run is painted in a legible colour, not left transparent', () => {
  // The real defect: the visible glyphs live in .editor-hl UNDER the textarea,
  // and the textarea's own text is transparent. During selection the browser
  // re-paints the selected run itself using ::selection's `color`. Setting that
  // to transparent (which the pane used to do) painted nothing on top of the
  // band, and the band covered the highlight layer: the selected line went
  // blank. So the selection must carry BOTH an opaque-enough band and a text
  // colour that contrasts with it.
  // Match the rule itself, not the selector mentioned inside a comment. Strip
  // comments first: the explanation block names the selector and quotes the old
  // broken declarations, so a raw slice would read the comment as CSS.
  const stripped = html.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = stripped.search(/\.editor-ta::selection\s*\{/);
  assert.ok(at > 0, '.editor-ta::selection rule missing');
  const open = stripped.indexOf('{', at);
  const close = stripped.indexOf('}', open);
  const decls = stripped.slice(open, close);

  assert.match(decls, /color:\s*var\(--sel-fg\)/, 'selection text colour must come from --sel-fg');
  assert.ok(
    !/color:\s*transparent/.test(decls),
    'selection text is transparent — the browser paints the selected run with this colour, so the line renders blank'
  );
  assert.match(decls, /background:\s*var\(--sel-bg\)/, 'selection band must come from --sel-bg');

  // Contrast of the two variables in both schemes: a selection is still text.
  const vars = {};
  for (const m of html.matchAll(/--sel-(bg|fg):\s*(#[0-9a-f]{3,8})/gi)) {
    const scheme = html.slice(0, m.index).includes('data-theme="dark"') ? 'dark' : 'light';
    vars[scheme] = vars[scheme] || {};
    vars[scheme][m[1].toLowerCase()] = m[2];
  }
  assert.ok(vars.light && vars.dark, `both schemes need --sel-bg/--sel-fg, got ${JSON.stringify(vars)}`);

  const lum = (hex) => {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  for (const scheme of ['light', 'dark']) {
    const { bg, fg: fgHex } = vars[scheme];
    const [hi, lo] = [lum(bg), lum(fgHex)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    assert.ok(ratio >= 4.5, `${scheme} selection contrast is ${ratio.toFixed(2)}:1, below the 4.5:1 body-text floor`);
  }
});

test('selection colour is defined for both schemes', () => {
  // A rule that only lands in light mode ships a broken dark mode.
  const stripped = html.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = stripped.search(/\.editor-ta::selection\s*\{/);
  const open = stripped.indexOf('{', at);
  const close = stripped.indexOf('}', open);
  const decls = stripped.slice(open, close);
  assert.ok(/var\(--sel-/.test(decls), 'must derive from theme variables, not a fixed colour');
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
