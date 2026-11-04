// End-to-end: a launcher-generated page typesets ‖ with real KaTeX fonts over file://.
//
// The regression (2026-11-04): open-md.ps1 inlined katex.min.css verbatim, keeping its
// relative `url(fonts/KaTeX_Main-Regular.woff2)` references. The generated page is written
// beside the DOCUMENT, not beside `katex/`, so every font 404'd. KaTeX still typeset —
// in fallback fonts, where U+2225 (∥, the norm bars from `\|`) renders as slanted "//".
// The launcher now rewrites every font url to a base64 data URI.
//
// This file proves the *fixed* pipeline end to end in a real browser over file://: it
// replicates the launcher's CSS rewrite (same regex, same mime rules) in JS, writes the
// page into a directory that has NO katex/ folder — exactly like a document folder — and
// asserts that all font faces load and the norm glyph comes from KaTeX_Main.
//
// The rewrite here MUST mirror open-md.ps1. test/offline-katex.test.mjs pins the PowerShell
// side (regex shape, base64 call, missing-file passthrough); this file pins the outcome.
//
// Run: npm run test:browser   (override the binary with MDR_CHROME=<path>)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function findChrome() {
  if (process.env.MDR_CHROME) return process.env.MDR_CHROME;
  const cache = join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort();
  for (const d of dirs.reverse()) {
    for (const sub of ['chrome-linux64', 'chrome-linux']) {
      const exe = join(cache, d, sub, 'chrome');
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

const CHROME = findChrome();
const OPTS = CHROME ? {} : { skip: 'no Chromium found — set MDR_CHROME' };

// The launcher's CSS rewrite, mirrored from open-md.ps1 (must stay in sync):
// every url(fonts/<file>) becomes url(data:<mime>;base64,<bytes>); a font file that
// is not shipped keeps its relative url.
function inlineFontUrls(css, fontDir) {
  return css.replace(/url\((fonts\/[^)]+)\)/g, (m, rel) => {
    const f = join(fontDir, rel.split('/').pop());
    if (!existsSync(f)) return m;
    const ext = f.slice(f.lastIndexOf('.') + 1).toLowerCase();
    const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf';
    return 'url(data:' + mime + ';base64,' + readFileSync(f).toString('base64') + ')';
  });
}

test('the generated page typesets ‖ with KaTeX fonts over file://', OPTS, async () => {
  const katexCss = readFileSync(join(ROOT, 'katex/katex.min.css'), 'utf8');
  const katexJs = readFileSync(join(ROOT, 'katex/katex.min.js'), 'utf8');
  const fontDir = join(ROOT, 'katex/fonts');

  const css = inlineFontUrls(katexCss, fontDir);
  // The modern sources must all be inlined now; the .ttf refs are not shipped and stay relative.
  assert.ok(!/url\(fonts\/[^)]*\.woff2?\)/.test(css), 'a woff/woff2 url survived the rewrite');
  assert.ok((css.match(/url\(data:font\/woff2/g) || []).length >= 20, 'woff2 fonts were not inlined');

  // A document folder: the page and nothing else. No katex/, no fonts/.
  const docDir = mkdtempSync(join(tmpdir(), 'mdr-offline-fonts-'));
  const page = join(docDir, 'doc.reader.html');
  // \(\gamma_{eff} = \|\ell_S\|^2\) — the formula from the bug report, AMS delimiters included.
  const doc = '公式 $\\gamma_{eff} = \\|\\ell_S\\|^2\\|\\ell_N\\|^2$，其中';
  const html = '<!doctype html><html><head><meta charset="utf-8">\n'
    + '<style>\n' + css + '\n</style>\n'
    + '<script>\n' + katexJs + '\n</script>\n'
    + '<script>window.__PRELOAD_MD__=' + JSON.stringify(doc) + ';</script>\n'
    + '</head><body><div id="m"></div>\n'
    + '<script>\n'
    + 'document.getElementById("m").innerHTML = katex.renderToString("\\\\gamma_{eff} = \\\\|\\\\ell_S\\\\|^2\\\\|\\\\ell_N\\\\|^2", { throwOnError: false });\n'
    + 'window.__done = true;\n'
    + '</script></body></html>';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(page, html, 'utf8');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const errors = [];
  try {
    const pg = await browser.newPage();
    pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    pg.on('pageerror', (e) => errors.push(String(e)));
    await pg.goto('file://' + page, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.__done === true);
    await pg.waitForTimeout(500);

    const out = await pg.evaluate(async () => {
      await document.fonts.ready;
      const bar = [...document.querySelectorAll('#m .mord')].find((s) => s.textContent === '∥');
      const failed = [...document.fonts].filter((f) => f.status !== 'loaded' && f.status !== 'unloaded').length;
      const used = [];
      for (const f of document.fonts) {
        if (f.status === 'loaded') used.push(f.family);
      }
      return {
        // KaTeX_Main must actually be usable for the norm glyph's span
        mainLoaded: await document.fonts.check('16px KaTeX_Main'),
        loadedFamilies: [...new Set(used)].sort(),
        failedFontFaces: failed,
        // the rendered span for ‖ must carry the KaTeX font, not a system fallback
        barFont: bar ? getComputedStyle(bar).fontFamily : null,
        barText: bar ? bar.textContent : null
      };
    });

    assert.equal(errors.length, 0, 'console/page errors: ' + errors.join(' | ').slice(0, 400));
    assert.ok(out.mainLoaded, 'KaTeX_Main did not load over file:// — the page still has broken font urls');
    assert.ok(out.loadedFamilies.includes('KaTeX_Main'), 'KaTeX_Main is not among the loaded faces: ' + out.loadedFamilies.join(','));
    assert.equal(out.failedFontFaces, 0, 'some @font-face failed to load');
    assert.equal(out.barText, '∥', 'the norm glyph span does not hold U+2225');
    assert.match(out.barFont, /KaTeX_Main/, 'the norm glyph is not styled with the KaTeX font, so a fallback would draw it');
  } finally {
    await browser.close();
  }
});

test('non-vacuity: without the rewrite the fonts fail and the fallback draws ‖', OPTS, async () => {
  // Same page, but with the launcher's OLD behaviour: CSS inlined verbatim, fonts left
  // relative. Over file:// next to a document with no katex/ folder, every face must fail.
  const katexCss = readFileSync(join(ROOT, 'katex/katex.min.css'), 'utf8');
  const katexJs = readFileSync(join(ROOT, 'katex/katex.min.js'), 'utf8');
  const docDir = mkdtempSync(join(tmpdir(), 'mdr-offline-nofont-'));
  const page = join(docDir, 'doc.reader.html');
  const html = '<!doctype html><html><head><meta charset="utf-8">\n<style>\n' + katexCss + '\n</style>\n'
    + '<script>\n' + katexJs + '\n</script>\n</head><body><div id="m"></div>\n'
    + '<script>\ndocument.getElementById("m").innerHTML = katex.renderToString("\\\\|x\\\\|", { throwOnError: false });\nwindow.__done = true;\n</script></body></html>';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(page, html, 'utf8');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const pg = await browser.newPage();
    await pg.goto('file://' + page, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.__done === true);
    const out = await pg.evaluate(async () => {
      await document.fonts.ready;
      return { mainLoaded: await document.fonts.check('16px KaTeX_Main') };
    });
    assert.equal(out.mainLoaded, false,
      'the un-rewritten page loaded KaTeX_Main — this test is no longer proving anything');
  } finally {
    await browser.close();
  }
});
