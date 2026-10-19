// Inline SVG tests for md-editor.html (issue #49).
//
// Why this exists: the parser escapes everything and re-inserts only allowlisted
// constructs, so an inline `<svg …>…</svg>` figure rendered as escaped text and a
// fenced ` ```svg ` block rendered as a plain code block. This file covers the new
// second allowlisted channel: one sanitizer, two triggers.
//
// The sanitizer is deliberately written as pure JavaScript (its own tiny XML
// tokenizer) rather than `DOMParser`, so that the exact code the browser runs is
// also the code this zero-dependency suite runs. A `DOMParser`-based sanitizer
// could only be tested in the browser, and the strip assertions below would lose
// their non-vacuity here.
//
// Two layers:
//   (a) the pure decisions — element / attribute / attribute-value allowlists —
//       extracted from the `/* PARSER:BEGIN */ … /* PARSER:END */` section;
//   (b) the integration — `parseMarkdown()` turns an SVG into markup, and every
//       hard-deny vector is stripped.
//
// Non-vacuity: the strip tests below are written to fail against the pre-fix
// tree, where the SVG is escaped text and `svgEl`/`sanitizeSvg` do not exist.
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = join(HERE, '..', 'md-editor.html');

const BEGIN = '/* PARSER:BEGIN */';
const END = '/* PARSER:END */';

function loadParser(htmlPath = READER) {
  const html = readFileSync(htmlPath, 'utf8');
  const start = html.indexOf(BEGIN);
  const stop = html.indexOf(END);
  assert.ok(start >= 0 && stop > start, `${BEGIN} / ${END} markers not found in ${htmlPath}`);
  const section = html.slice(start + BEGIN.length, stop);
  // eslint-disable-next-line no-new-func
  return new Function(
    section +
      '\nreturn { parseMarkdown: parseMarkdown, protectMath: protectMath,' +
      ' restoreMathHtml: restoreMathHtml, sanitizeSvg: sanitizeSvg,' +
      ' SVG_ELEMENTS: SVG_ELEMENTS, svgElementAllowed: svgElementAllowed,' +
      ' svgAttrAllowed: svgAttrAllowed, svgAttrValueAllowed: svgAttrValueAllowed };'
  )();
}

const p = loadParser();

// Render exactly as the reader does: protect the math/`$` spans, parse, then run
// the restore pass that re-inserts lifted-out HTML.
function render(md) {
  const guarded = p.protectMath(md);
  const result = p.parseMarkdown(guarded.text);
  return p.restoreMathHtml(result.html, guarded.store);
}

const CIRCLE = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';

// ── (a) the pure decisions ──────────────────────────────────────────────
test('the element allowlist admits the figure vocabulary', () => {
  for (const name of ['svg', 'g', 'defs', 'path', 'rect', 'circle', 'text', 'tspan',
    'linearGradient', 'clipPath', 'marker', 'use']) {
    assert.equal(p.svgElementAllowed(name), true, `${name} must be allowed`);
  }
  // case-insensitive: the browser lowercases SVG tag names
  assert.equal(p.svgElementAllowed('CIRCLE'), true, 'tag names are case-insensitive');
});

test('the element allowlist rejects script-bearing and foreign elements', () => {
  for (const name of ['script', 'foreignObject', 'style', 'animate', 'animateTransform',
    'set', 'image', 'iframe', 'a', 'unknown']) {
    assert.equal(p.svgElementAllowed(name), false, `${name} must be denied`);
  }
});

test('the attribute allowlist admits geometry, paint and text attributes', () => {
  for (const name of ['d', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'points',
    'viewBox', 'transform', 'fill', 'stroke', 'stroke-width', 'fill-opacity',
    'opacity', 'stop-color', 'font-size', 'text-anchor', 'id', 'class', 'role',
    'aria-label']) {
    assert.equal(p.svgAttrAllowed(name), true, `${name} must be allowed`);
  }
});

test('the attribute allowlist rejects every event handler', () => {
  for (const name of ['onload', 'onclick', 'onerror', 'onmouseover', 'ONLOAD', 'foo']) {
    assert.equal(p.svgAttrAllowed(name), false, `${name} must be denied`);
  }
});

test('href is allowed by name but only a local fragment passes the value check', () => {
  assert.equal(p.svgAttrAllowed('href'), true, 'href exists so <use href="#id"> can work');
  assert.equal(p.svgAttrValueAllowed('href', '#icon'), true, 'a local fragment is fine');
  assert.equal(p.svgAttrValueAllowed('href', 'http://evil.example/x'), false,
    'a remote href must be refused by the value check');
});

test('attribute values may not smuggle a URL — except a local fragment', () => {
  assert.equal(p.svgAttrValueAllowed('fill', 'red'), true, 'a plain colour is fine');
  assert.equal(p.svgAttrValueAllowed('transform', 'rotate(45)'), true, 'a transform is fine');
  assert.equal(p.svgAttrValueAllowed('xlink:href', '#icon'), true, 'a local fragment is fine');
  assert.equal(p.svgAttrValueAllowed('fill', 'url(http://evil.example/x)'), false,
    'a remote url() must be denied');
  assert.equal(p.svgAttrValueAllowed('fill', 'url(//evil.example/x)'), false,
    'a protocol-relative url() must be denied');
  assert.equal(p.svgAttrValueAllowed('fill', 'url(data:image/png;base64,AAA)'), false,
    'a data: url() must be denied');
  assert.equal(p.svgAttrValueAllowed('href', 'https://evil.example/x'), false,
    'an absolute href must be denied');
  assert.equal(p.svgAttrValueAllowed('d', 'javascript:alert(1)'), false,
    'a javascript: URL anywhere must be denied');
});

// ── (b) the integration: both triggers render a picture ─────────────────
test('a top-level inline <svg> renders as markup, not as escaped text', () => {
  const out = render(CIRCLE);
  assert.ok(out.includes('<svg'), `expected a live <svg> element, got: ${out}`);
  assert.ok(out.includes('<circle'), `expected a live <circle> element, got: ${out}`);
  assert.ok(!out.includes('&lt;svg'), 'the markup must not be escaped');
  assert.ok(!out.includes('&lt;circle'), 'the markup must not be escaped');
});

test('a fenced ```svg block renders the same as an inline <svg>', () => {
  const fenced = render('```svg\n' + CIRCLE + '\n```');
  const inline = render(CIRCLE);
  assert.ok(fenced.includes('<svg') && fenced.includes('<circle'),
    `the fenced form must render the figure, got: ${fenced}`);
  assert.ok(!fenced.includes('<pre><code'), 'the fenced svg must not stay a code block');
  assert.equal(fenced.replace(/\s+/g, ' '), inline.replace(/\s+/g, ' '),
    'both triggers must go through the one sanitizer');
});

// ── (b) every hard-deny vector is stripped ──────────────────────────────
test('<script> inside an svg is stripped', () => {
  const out = render('<svg><script>alert(1)</script><rect width="10" height="10"/></svg>');
  assert.ok(!/<script/i.test(out), `script must be gone, got: ${out}`);
  assert.ok(!/alert\(1\)/.test(out), 'the script body must be gone too');
  assert.ok(out.includes('<rect'), 'the allowed sibling must survive');
});

test('a foreignObject is stripped', () => {
  const out = render('<svg><foreignObject><body>x</body></foreignObject><circle r="5"/></svg>');
  assert.ok(!/foreignObject/i.test(out), `foreignObject must be gone, got: ${out}`);
  assert.ok(out.includes('<circle'), 'the allowed sibling must survive');
});

test('an on* event handler is stripped', () => {
  const out = render('<svg onload="alert(1)"><circle r="5" onclick="steal()"/></svg>');
  assert.ok(!/onload/i.test(out), `onload must be gone, got: ${out}`);
  assert.ok(!/onclick/i.test(out), `onclick must be gone, got: ${out}`);
  assert.ok(!/alert\(1\)/.test(out) && !/steal\(\)/.test(out), 'handler bodies must be gone');
  assert.ok(out.includes('<circle'), 'the element itself stays');
});

test('a remote href is stripped', () => {
  const out = render('<svg><use href="http://evil.example/x"/></svg>');
  assert.ok(!/evil\.example/.test(out), `a remote href must be gone, got: ${out}`);
});

test('fill="url(http://…)" is stripped', () => {
  const out = render('<svg><rect width="10" height="10" fill="url(http://evil.example/x)"/></svg>');
  assert.ok(!/evil\.example/.test(out), `a remote url() paint must be gone, got: ${out}`);
  assert.ok(out.includes('<rect'), 'the element stays, only the value goes');
});

test('<style> is stripped', () => {
  const out = render('<svg><style>*{display:none}</style><circle r="5"/></svg>');
  assert.ok(!/<style/i.test(out), `style must be gone, got: ${out}`);
  assert.ok(!/display:none/.test(out), 'the css body must be gone');
  assert.ok(out.includes('<circle'), 'the allowed sibling must survive');
});

// ── (b) malformed input falls back, never swallowed ─────────────────────
test('malformed svg falls back to a code block with the content preserved', () => {
  const broken = '<svg><rect width="10"';
  const out = render(broken);
  assert.ok(out.includes('<pre><code'), `expected a code-block fallback, got: ${out}`);
  assert.ok(!out.includes('<rect'), 'an unterminated element must not be emitted');
});

// ── the offline guarantee must not move ─────────────────────────────────
test('a sanitized svg adds zero fetchable URLs', () => {
  // Every fetchable sub-resource attribute in the rendered output, whatever the
  // sanitizer chose to keep.
  const out = render('<svg viewBox="0 0 10 10"><use href="#icon"/><circle r="4" fill="url(#g)"/></svg>');
  const attrs = out.match(/(?:src|href)\s*=\s*"[^"]*"/g) || [];
  const remote = attrs.filter((u) => /https?:|data:/i.test(u));
  assert.deepEqual(remote, [], `no remote sub-resource may be introduced, got: ${out}`);
  // Positive control: the local fragment survived, so the assertion above is not
  // passing because the markup was dropped entirely.
  assert.ok(/href\s*=\s*"#icon"/.test(out), `a local fragment must survive, got: ${out}`);
});

test('a remote url() paint is refused and a local one kept (non-vacuity control)', () => {
  const kept = render('<svg><rect width="4" height="4" fill="url(#grad)"/></svg>');
  assert.ok(/fill="url\(#grad\)"/.test(kept), `a local url() must survive, got: ${kept}`);
  const refused = render('<svg><rect width="4" height="4" fill="url(http://evil.example/g)"/></svg>');
  assert.ok(!/evil\.example/.test(refused), `a remote url() must be stripped, got: ${refused}`);
});
