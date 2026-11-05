// Tests for offline KaTeX: the shipped distribution and the launcher that inlines it.
//
// Why this exists: the reader used to reach jsDelivr for every page, so a reading page opened
// through `file:///` pulled katex.min.js from the network on each load. Offline (or behind a
// proxy that eats the request) the formulas silently fell back to the plain-text renderer. The
// launcher now inlines a shipped copy instead.
//
// Two things can break that quietly, so both are asserted here:
//
//   1. The vendored dist must stay complete and self-consistent. `katex.min.css` declares
//      `@font-face` rules pointing at `fonts/…`; if the font files are pruned the page still
//      loads and still typesets, it just renders in the browser's fallback font. Nothing else
//      in the repo would notice.
//   2. The inlining must not corrupt the base reader, the document, or the reader's script.
//
// `open-md.ps1` cannot run under Node, so the tests assert the script's shape and the
// invariants of the snippets it assembles. That is the part a regression would break.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const reader = readFileSync(join(ROOT, 'md-editor.html'), 'utf8');
const ps1 = readFileSync(join(ROOT, 'open-md.ps1'), 'utf8');
const katexJs = readFileSync(join(ROOT, 'katex', 'katex.min.js'), 'utf8');
const katexCss = readFileSync(join(ROOT, 'katex', 'katex.min.css'), 'utf8');

// Pull a PowerShell function body out of open-md.ps1 by brace balance.
//
// A regex like /function X[\s\S]*?\n\}/ looks fine but breaks on this file: PowerShell here is
// stored with CRLF endings, and `\n\}` matches the CR LF that *ends a line* whenever the next
// line happens to start with `}`, so the capture stops early. Balance braces on normalised
// text instead — the file's line endings must not decide what the tests see.
const PS1_LF = ps1.replace(/\r\n/g, '\n');

function ps1Function(name) {
  const start = PS1_LF.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `open-md.ps1 has no ${name} function`);
  const open = PS1_LF.indexOf('{', start);
  assert.notEqual(open, -1, `${name} has no body`);
  let depth = 0;
  for (let i = open; i < PS1_LF.length; i++) {
    if (PS1_LF[i] === '{') depth++;
    else if (PS1_LF[i] === '}') {
      depth--;
      if (depth === 0) return PS1_LF.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body is not brace-balanced`);
}

// The splitTexSegments function body, reused by more than one test.
function segsOf(src) {
  return src.match(/function\s+splitTexSegments[\s\S]*?\n  \}/)?.[0] ?? '';
}

// Every `url(...)` in the stylesheet, normalised to a repository-relative path.
function fontRefs(css) {
  return [...css.matchAll(/url\(([^)]+)\)/g)]
    .map(m => m[1].trim().replace(/^['"]|['"]$/g, ''))
    .filter(u => !/^[a-z]+:/i.test(u));
}

test('the shipped KaTeX distribution is present and complete', () => {
  assert.ok(katexJs.length > 100_000, 'katex/katex.min.js is missing or truncated');
  assert.ok(katexCss.length > 10_000, 'katex/katex.min.css is missing or truncated');
  // The version the reader hardcodes as its CDN fallback must match the vendored copy, or an
  // offline page and an online page would typeset with different KaTeX builds.
  assert.match(reader, /katex@0\.16\.11\//, 'the reader no longer pins katex@0.16.11');
  assert.match(katexJs, /0\.16\.11/, 'katex.min.js is not the 0.16.11 build');
});

test('every modern font the stylesheet references is shipped', () => {
  // The stylesheet lists three sources per face: woff2, woff, then ttf (legacy IE). The
  // official 0.16.11 dist ships only woff2 + woff, so the .ttf entries are expected to 404
  // and are not a regression. What must hold is that every *modern* source resolves — if a
  // woff2 is pruned, the page still typesets but silently renders in the fallback font.
  const refs = fontRefs(katexCss).filter(u => !u.endsWith('.ttf'));
  assert.ok(refs.length > 0, 'katex.min.css declares no modern @font-face sources');
  const missing = refs.filter(u => !existsSync(join(ROOT, 'katex', u)));
  assert.deepEqual(missing, [], `katex.min.css references fonts that are not shipped: ${missing.join(', ')}`);
  // Guard the assumption above: if the dist ever drops .woff and ships .ttf only, the filter
  // would silently stop checking anything.
  assert.ok(
    refs.some(u => u.endsWith('.woff2')),
    'no woff2 source found — this test is no longer checking the sources browsers actually use'
  );
});

test('the inlined CSS keeps the font URLs resolvable from the generated page', () => {
  // The generated page is written beside the source document, so `fonts/…` no longer resolves
  // relative to the page. Renderers therefore take the base64 route, and the vendored files
  // must exist for that to be possible.
  const refs = fontRefs(katexCss);
  assert.ok(refs.every(u => u.startsWith('fonts/')), 'a font reference is not under fonts/');
  assert.ok(existsSync(join(ROOT, 'katex', 'fonts')), 'katex/fonts does not exist');
});

test('open-md.ps1 rewrites font urls to base64 data URIs', () => {
  // The regression this guards (2026-11-04): the launcher inlined the CSS with its relative
  // `url(fonts/…)` intact. The generated page sits beside the DOCUMENT, not beside katex/,
  // so every font 404'd and KaTeX typeset with fallback fonts — ‖ (U+2225, the norm bars)
  // then rendered as slanted "//" glyphs. Verified: inlined-fonts simulation loads 0/20 faces,
  // the fixed pipeline rewrites all 40 woff2/woff urls and keeps the .ttf refs that the
  // distribution does not ship.
  assert.ok(
    ps1.includes("[regex]::Replace($katexCss, 'url\\((fonts/[^)]+)\\)'"),
    'open-md.ps1 must rewrite url(fonts/…) in the inlined CSS'
  );
  assert.match(ps1, /ToBase64String\(\[IO\.File\]::ReadAllBytes\(\$f\)\)/,
    'open-md.ps1 must inline the font bytes as base64');
  assert.match(ps1, /return \$m\.Value/,
    'a font file that is missing must be left as-is, not blanked');
});

test('open-md.ps1 inlines from the sibling katex/ folder, and tolerates it being absent', () => {
  // Both files are required; a half-present distribution must be treated as absent rather
  // than inlined as a broken page.
  assert.match(ps1, /Join-Path \$PSScriptRoot 'katex\\katex\.min\.js'/,
    'open-md.ps1 does not read katex.min.js from its own folder');
  assert.match(ps1, /Join-Path \$PSScriptRoot 'katex\\katex\.min\.css'/,
    'open-md.ps1 does not read katex.min.css from its own folder');
  assert.match(ps1, /if \(\(Test-Path \$katexJsPath\) -and \(Test-Path \$katexCssPath\)\) \{/,
    'the inlining is not guarded on both files being present');
});

test('the KaTeX script is written as its own closed tag, ahead of the reader script', () => {
  // The reader's script opens with `(function () { 'use strict';`. KaTeX must be its own
  // <script> element: prepending it *inside* the reader's tag would fold two programs into
  // one element, which swallows the prologue or silently makes the whole reader strict-mode.
  const m = ps1.match(/\$html = \$html\.Replace\('<script>',\s*"([^"]*)"\)/);
  assert.ok(m, 'open-md.ps1 has no <script> replacement for the KaTeX payload');
  const replacement = m[1];
  assert.ok(
    replacement.includes('</script>'),
    'the KaTeX payload is not closed with </script>, so it shares an element with the reader script'
  );
  assert.match(replacement, /\$katexJs/, 'the replacement does not contain the KaTeX source');
  // The reader's own <script> must be re-emitted after ours, or the tag is lost entirely.
  assert.match(replacement, /<script>$/, 'the reader <script> opening is not re-emitted after the payload');
  // And the payload must come first.
  assert.ok(
    replacement.indexOf('</script>') < replacement.lastIndexOf('<script>'),
    'the KaTeX payload is emitted after the reader script opening'
  );
});

test('the CSS lands inside <head>, and neither snippet closes the wrong element', () => {
  const m = ps1.match(/\$html = \$html\.Replace\('<\/head>',\s*"([^"]*)"\)/);
  assert.ok(m, 'open-md.ps1 has no </head> replacement for the stylesheet');
  const replacement = m[1];
  assert.match(replacement, /\$katexCss/, 'the head replacement does not contain the KaTeX CSS');
  assert.ok(replacement.includes('</style>'), 'the inlined stylesheet is not closed');
  // If a snippet contained </head> itself the two replacements would fight.
  assert.ok(!katexJs.includes('</head>'), 'katex.min.js contains </head> and would corrupt the head insertion');
  assert.ok(!katexCss.includes('</head>'), 'katex.min.css contains </head> and would corrupt the head insertion');
  assert.ok(!katexCss.includes('</script>'), 'katex.min.css contains </script> and would close a script tag');
});

test('the insertion anchor identifies the reader script unambiguously', () => {
  // The anchor is the reader's script opening tag matched as one whole string. A document is
  // injected *after* this step, so the only way the anchor can misfire is if the base reader
  // itself grows a second bare `<script>` — in which case the KaTeX tag could land after the
  // code that needs it.
  const bare = reader.split('<script>').length - 1;
  assert.equal(bare, 1, `md-editor.html has ${bare} bare <script> tags; the anchor expects exactly one`);
  assert.ok(
    reader.indexOf('<script>') < reader.indexOf('/* PARSER:BEGIN */'),
    'the reader script must open before the parser marker for the anchor to precede it'
  );
});

test('the reader prefers an inlined KaTeX over network loading', () => {
  // This is the line that actually makes the page offline-capable. Without it the launcher
  // still ships the bytes and the reader still fetches from the CDN.
  assert.match(
    reader,
    /if\s*\(\s*window\.katex\s*\)\s*\{\s*katexReady\s*=\s*true;\s*return\s+Promise\.resolve\(true\);\s*\}/,
    'loadKatex() does not short-circuit when KaTeX is already present'
  );
});

test('formulas are typeset against a frame time budget, not a fixed count', () => {
  // A long document (the project's own 140 KB paper) holds ~1300 formulas at ~0.9 ms each.
  // A single synchronous pass holds the first paint for over a second, so the work is spread
  // over animation frames. The budget must be measured in *time*, not a fixed batch count:
  // a bare `x` and a nested `\frac` differ by an order of magnitude, so any fixed count is
  // either too small for heavy documents (dropped frames) or needlessly slow for light ones.
  const fn = reader.match(/function\s+upgradeMathWithKatex[\s\S]*?\n  \}/);
  assert.ok(fn, 'could not read upgradeMathWithKatex');
  assert.match(fn[0], /requestAnimationFrame\(step\)/, 'upgradeMathWithKatex renders in one blocking pass');
  assert.match(fn[0], /performance\.now\(\)/, 'upgradeMathWithKatex does not measure elapsed time');
  assert.match(fn[0], /FRAME_BUDGET_MS/, 'no frame budget constant');
  // A fixed-count batch would show up as `Math.min(idx + N, ...)`; that is the regression.
  assert.doesNotMatch(fn[0], /Math\.min\(idx\s*\+/,
    'upgradeMathWithKatex went back to a fixed per-frame count');
});

test('a $ that is not a formula is kept as text instead of swallowing the line', () => {
  // The `$` in `$100` and a stray `$` are not math delimiters. The old code required the body
  // to look "math-ish" and dropped the span when it did not — so an unmatched `$` was consumed
  // and the text after it was lost. Both entry points must keep the source text intact.
  const inline = reader.match(/function\s+protectInlineMath[\s\S]*?\n  \}/);
  assert.ok(inline, 'could not read protectInlineMath');
  assert.doesNotMatch(inline[0], /mathish/,
    'protectInlineMath still gates on a math-ish heuristic, so a non-formula $ span is dropped');
  // The prose test must be the \text{}-aware one: a formula may carry Chinese inside
  // \text{} (a cases branch labelled 不可识别), and isNonFormulaSpan() would reject it.
  assert.match(inline[0], /if \(!hasBareCJK\(body\)\) \{/,
    'protectInlineMath does not store every closed $ span that is not bare prose');

  const segs = reader.match(/function\s+splitTexSegments[\s\S]*?\n  \}/);
  assert.ok(segs, 'could not read splitTexSegments');
  assert.doesNotMatch(segs[0], /mathish/,
    'splitTexSegments still gates on a math-ish heuristic');
  // The else-branch is the actual pairing fix: when the span spans a newline it is not a
  // formula, and the original characters (both $ included) must be appended verbatim.
  assert.match(segs[0], /else\s*\{\s*buf \+= text\.slice\(i, end \+ 1\);\s*\}/,
    'splitTexSegments drops a multi-line $ span instead of keeping it as text');
});

test('a $ span straddling prose is text, and the whole line survives two prices', () => {
  // The regression this guards: with the math-ish test removed, a line holding two prices
  // pairs the first `$` with the second and swallows everything between them —
  // "税费 $5.50 和 $6.00 元" rendered as "税费 <math>6.00 元". The span there contains
  // Chinese, which is what the test keys on.
  const fn = reader.match(/function\s+hasBareCJK[\s\S]*?\n  \}/);
  assert.ok(fn, 'could not read hasBareCJK');
  assert.match(fn[0], /CJK\.test\(s\.replace\(TEX_GROUP_RE/,
    'the prose test must strip \\text{} groups and then test for bare CJK, not for a leading digit');
  // Both entry points must use it — a guard in only one of them leaves the other eating text.
  assert.match(segsOf(reader), /if \(!hasBareCJK\(body\) && body\.indexOf\('\\n'\) < 0\) \{/,
    'splitTexSegments does not apply the prose test');
});

test('a numerical result is a formula, not a price', () => {
  // The regression this guards, measured on this project's own 140 KB paper: the first
  // version of the prose guard keyed on "starts with a digit", which rejected 554 spans of
  // the form `$0.87$`, `$15$`, `$13$` — a paper's normal way of writing a number. Every one
  // of them rendered as literal text.
  const fn = reader.match(/function\s+hasBareCJK[\s\S]*?\n  \}/);
  assert.ok(fn, 'could not read hasBareCJK');
  assert.doesNotMatch(fn[0], /\[0-9\]/,
    'the prose test keys on a leading digit, so `$15$` and `$0.87$` become text');
  // And a price span really does contain CJK, which is the signal the rule relies on.
  assert.ok(!/[\u4E00-\u9FFF]/.test('0.87'), 'a bare number must not look like prose');
  assert.ok(/[\u4E00-\u9FFF]/.test('5.50 和 '), 'a price span must look like prose');
});
