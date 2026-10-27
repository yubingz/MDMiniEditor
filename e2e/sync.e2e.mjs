// 编辑↔预览 同步的端到端测试（真实 Chromium）。
//
// 覆盖：
//   1. 预览块带 data-line 锚点（同步的基础）
//   2. 编辑器滚动 -> 预览跟随
//   3. 预览滚动 -> 编辑器跟随
//   4. 编辑器选中一段 -> 预览对应块高亮
//   5. 取消选中 -> 高亮清除
//   6. 点击预览块 -> 编辑器定位过去
//
// 为什么必须用真浏览器：offsetTop、行高、滚动范围全是真实布局量，
// 假 DOM 测不出"看着对不齐"。
//
// 载入文档必须走 window.__PRELOAD_MD__（页面自带的钩子，最终调 loadMarkdown）。
// 直接给 textarea 赋值只会触发预览局部刷新，页面仍停在 is-empty，
// 此时 scrollHeight 全为 0，任何滚动断言都会假失败（2026-10-26 踩过）。
//
// Run: node --test e2e/sync.e2e.mjs   （MDR_CHROME=<path> 可指定浏览器）

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

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

// 一份足够长的文档：滚动、锚点都需要真实的纵向空间
function longDoc() {
  const parts = [];
  for (let i = 1; i <= 40; i++) {
    parts.push(`## 第 ${i} 节 Section ${i}`, '');
    parts.push(`这是第 ${i} 节的正文段落，用来撑起足够的滚动高度。`.repeat(3), '');
  }
  return parts.join('\n') + '\n';
}

async function startServer() {
  const doc = longDoc();
  const srv = createServer(async (req, res) => {
    const pth = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pth === '/' || pth === '/md-editor.html') {
      let html = await readFile(join(ROOT, 'md-editor.html'), 'utf8');
      // 注入预载文档：走页面自己的 loadMarkdown，否则 is-empty 不摘、滚动高度为 0
      const inject = `<script>window.__PRELOAD_MD__=${JSON.stringify(doc)};`
        + `window.__PRELOAD_NAME__='sync-test.md';</script>`;
      html = html.replace('<body class="is-empty">', inject + '<body class="is-empty">');
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(html);
      return;
    }
    const file = join(ROOT, normalize(pth).replace(/^([.\/\\])+/, ''));
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
      }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, port: srv.address().port };
}

test('编辑↔预览 同步', OPTS, async (t) => {
  const { srv, port } = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  try {
    await page.goto(`http://127.0.0.1:${port}/md-editor.html`, { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // 切到分栏，等布局稳定
    await page.evaluate(() => document.getElementById('btnModeSplit').click());
    await page.waitForTimeout(1000);

    await t.test('布局就绪且预览带 data-line 锚点', async () => {
      const r = await page.evaluate(() => ({
        anchors: document.querySelectorAll('#content [data-line]').length,
        esScrollable: document.getElementById('editorScroll').scrollHeight
          - document.getElementById('editorScroll').clientHeight,
        cwScrollable: document.getElementById('contentWrap').scrollHeight
          - document.getElementById('contentWrap').clientHeight,
        empty: document.body.classList.contains('is-empty'),
      }));
      assert.equal(r.empty, false, '页面不应停留在 is-empty 状态');
      assert.ok(r.anchors > 10, `锚点应多于一打，实际 ${r.anchors}`);
      assert.ok(r.esScrollable > 500, `编辑器应可滚动，实际 ${r.esScrollable}`);
      assert.ok(r.cwScrollable > 500, `预览应可滚动，实际 ${r.cwScrollable}`);
    });

    await t.test('编辑器滚动 -> 预览首行对齐', async () => {
      const r = await page.evaluate(async () => {
        const es = document.getElementById('editorScroll');
        const cw = document.getElementById('contentWrap');
        cw.scrollTop = 0;
        await new Promise((res) => setTimeout(res, 250));   // 等同步锁释放
        es.scrollTop = 800;
        await new Promise((res) => setTimeout(res, 450));

        // 编辑器顶部是第几行？
        const lh = parseFloat(getComputedStyle(document.getElementById('editorHl')).lineHeight) || 21;
        const editorLine = Math.round(es.scrollTop / lh);

        // 预览顶部是哪个块，它的 data-line 是多少？
        const kids = Array.from(document.getElementById('content').children);
        let topLine = null;
        for (const el of kids) {
          if (el.offsetTop <= cw.scrollTop + 6) topLine = Number(el.getAttribute('data-line'));
          else break;
        }
        return { esTop: es.scrollTop, cwTop: cw.scrollTop, editorLine, topLine };
      });
      assert.ok(r.cwTop > 100, `预览应被带动，实际 ${r.cwTop}`);
      // 预览顶部块不应比编辑器顶部行号落后太多（同一段内容）
      assert.ok(r.topLine != null, '预览应有顶部块');
      const gap = r.editorLine - r.topLine;
      assert.ok(gap >= -2 && gap <= 12,
        `两侧首行应对齐：编辑器 ${r.editorLine} 行，预览块起始 ${r.topLine} 行（差 ${gap}）`);
    });

    await t.test('预览滚动 -> 编辑器跟随', async () => {
      const r = await page.evaluate(async () => {
        const es = document.getElementById('editorScroll');
        const cw = document.getElementById('contentWrap');
        es.scrollTop = 0;
        await new Promise((res) => setTimeout(res, 250));   // 等同步锁释放
        cw.scrollTop = Math.round((cw.scrollHeight - cw.clientHeight) * 0.6);
        await new Promise((res) => setTimeout(res, 400));
        return { esTop: es.scrollTop, esMax: es.scrollHeight - es.clientHeight };
      });
      assert.ok(r.esTop > 100, `编辑器应被带动，实际 ${r.esTop}`);
      assert.ok(r.esTop <= r.esMax + 2,
        `编辑器滚动不应越界，实际 ${r.esTop} > 上限 ${r.esMax}`);
    });

    await t.test('编辑器选中 -> 预览高亮对应块', async () => {
      const r = await page.evaluate(async () => {
        const ta = document.getElementById('editor');
        const cw = document.getElementById('contentWrap');
        cw.scrollTop = 0;
        const v = ta.value;
        const idx = v.indexOf('## 第 20 节');
        if (idx < 0) return { count: -1, lines: [], reason: 'anchor text not found' };
        ta.focus();
        ta.setSelectionRange(idx, idx + 120);
        ta.dispatchEvent(new Event('select'));
        await new Promise((res) => setTimeout(res, 450));
        const hits = document.querySelectorAll('#content .sync-hit');
        let centered = null;
        if (hits.length) {
          const el = hits[0];
          const view = cw.clientHeight;
          const midOfEl = el.offsetTop + el.offsetHeight / 2;
          const midOfView = cw.scrollTop + view / 2;
          centered = Math.abs(midOfEl - midOfView);
        }
        return { count: hits.length, centered,
                 lines: Array.from(hits).map((h) => h.getAttribute('data-line')) };
      });
      assert.ok(r.count > 0, '预览应有高亮块，实际没有');
      // 选中的是第 20 节附近，高亮行号应落在文档中段而不是开头
      const nums = r.lines.map(Number).filter((n) => !isNaN(n));
      assert.ok(nums.length > 0 && Math.min(...nums) > 10,
        `高亮应落在中段，实际行号 ${nums.slice(0, 5).join(',')}`);
      // 居中：高亮块中心与视口中心的距离不应超过视口高度的 1/3
      assert.ok(r.centered != null, '应能算出居中偏差');
      const limit = await page.evaluate(() =>
        document.getElementById('contentWrap').clientHeight / 3);
      assert.ok(r.centered <= limit,
        `选中项应居中，偏差 ${Math.round(r.centered)}px 超过 ${Math.round(limit)}px`);
    });

    await t.test('取消选中 -> 高亮清除', async () => {
      const n = await page.evaluate(async () => {
        const ta = document.getElementById('editor');
        ta.setSelectionRange(0, 0);
        ta.dispatchEvent(new Event('select'));
        await new Promise((res) => setTimeout(res, 400));
        return document.querySelectorAll('#content .sync-hit').length;
      });
      assert.equal(n, 0, '取消选中后高亮应清除');
    });

    await t.test('点击预览块 -> 编辑器定位且获得焦点', async () => {
      const r = await page.evaluate(async () => {
        const blocks = document.querySelectorAll('#content [data-line]');
        const target = blocks[Math.floor(blocks.length / 2)];
        const line = Number(target.getAttribute('data-line'));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((res) => setTimeout(res, 250));
        const ta = document.getElementById('editor');
        const lines = ta.value.split('\n');
        const pos = ta.selectionStart;
        const caretLine = ta.value.slice(0, pos).split('\n').length - 1;
        return { line, focused: document.activeElement === ta,
                 caretLine, totalLines: lines.length };
      });
      assert.ok(r.focused, '点击预览后焦点应在编辑器');
      assert.ok(Math.abs(r.caretLine - r.line) <= 1,
        `光标应停在目标行附近，目标 ${r.line} 实际 ${r.caretLine}`);
    });

    assert.deepEqual(errors, [], `不应有未捕获异常：${errors.join('; ')}`);
  } finally {
    await browser.close();
    srv.close();
  }
});
