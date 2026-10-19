# MDMiniEditor

A tiny, offline Markdown reader **and editor** for Windows — one HTML file plus small launchers. No build step, no runtime dependencies: open the HTML and it works, with or without a network.

![Offline](https://img.shields.io/badge/offline-yes-blue) ![License](https://img.shields.io/badge/license-MIT-green)

[中文文档 / Chinese README](./README.cn.md)

---

## Features

- Open and drag-and-drop `.md` files
- GFM: headings, lists, task lists, tables, code blocks, quotes
- Images: `![alt](fig/diagram.png)` renders, resolved relative to the document
- Inline SVG figures: a ```svg block or a pasted `<svg>…</svg>` renders as a picture, sanitized to a fixed element/attribute allowlist
- LaTeX math (`$inline$` / `$$display$$`) via KaTeX, with offline fallback
- An edit pane with a live preview, switched by `预览 / 编辑 / 分栏`
- Split view: editor and preview side by side or stacked, with a draggable divider
- Save-back: `Ctrl+S` overwrites the opened file — even when opened by double-clicking (the launcher's loopback writer); `Ctrl+Shift+S` (Save As) opens a file dialog
- Table of contents
- Dark / light theme
- Font size controls
- Print / export PDF
- Fully offline for file reading — nothing is uploaded

### Math notes

- Uses [KaTeX](https://katex.org/) when network is available.
- Without network, a built-in fallback covers Greek letters, sub/superscripts, sums, and fractions.
- Math is extracted before Markdown parsing, so `_italic_` rules will not break formulas.
- Escaped backslashes in sources (e.g. `\\le`) are normalized to `\le`.

---

## Quick start (Windows)

1. Download and unzip this folder.
2. Double-click **`Open-Editor.bat`** — a file dialog appears; pick a `.md` and it opens in the
   app-mode window (Edge/Chrome if available). Cancel the dialog for an empty reader.
3. Drag a `.md` file into the window, or click **Open**, to switch documents.

Open a specific file:

```bat
Open-MD-File.bat "C:\path\to\your.md"
```

Or drag `your.md` onto **`Open-MD-File.bat`**.

### Any browser

Open `md-editor.html` directly (double-click or `file://` URL).

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save (overwrite the opened file) |
| `Ctrl+Shift+S` | Save As (file dialog) |
| `Ctrl+Shift+L` | Toggle theme |
| `Ctrl+=` / `Ctrl+-` | Increase / decrease font size |
| `Ctrl+0` | Reset font size |

---

## Markdown & math syntax

```markdown
# Heading

**Bold**, *italic*, `code`, ~~strike~~

- [x] Task
- [ ] Todo

| Col | Value |
| --- | ---: |
| A | 1 |

> Quote

Inline math: $N,K$, $\sigma_{(u,k)}^2$

Display math:

$$
F_a=\sum_{k=1}^{K} a_k F_k
$$

Inline SVG (a fenced ```svg block, or a pasted `<svg>` block):

```svg
<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>
```
```

---

## Files

| File | Purpose |
| --- | --- |
| `md-editor.html` | Main reader |
| `Open-Editor.bat` | Launch the reader; asks for a `.md` when double-clicked |
| `Open-MD-File.bat` | Open a `.md` file via drag-and-drop, command line or file association |
| `open-md.ps1` | Builds the reading page and launches the browser; used by both launchers |
| `katex/` | Bundled KaTeX 0.16.11 (JS, CSS, fonts) that the launcher inlines so formulas render offline. MIT-licensed; not needed for editing the reader |
| `.gitattributes` | Pins `*.html` and the launcher scripts to CRLF and normalises every other file |
| `.gitignore` | Keeps local build, log and editor artefacts out of the repository |
| `sample.md` | Demo document |
| `README.md` | This document (English) |
| `README.cn.md` | Chinese documentation |
| `LICENSE` | MIT License |
| `CHANGELOG.md` | Release notes |

---

## Optional: open `.md` by double-click

Windows 10/11:

1. Right-click a `.md` file → **Open with** → **Choose another app**.
2. Enable **Always use this app**, then browse and select `Open-MD-File.bat` (or a shortcut to it).
3. If `.bat` cannot be selected on your build, keep using drag-and-drop onto `Open-MD-File.bat`.

> Association support depends on Windows version; drag-and-drop always works.

---

## Requirements

- Windows 10/11 recommended
- Microsoft Edge or Google Chrome optional (for app mode)
- No Node.js / Python / installer required for normal use
- Network optional: the launcher inlines the bundled KaTeX into every reading page, so formulas render offline. `md-editor.html` opened on its own still prefers a sibling `katex/` folder, then jsDelivr
- Each generated page is ~292 KB larger because of the inlined copy. Set `MDR_NO_INLINE_KATEX=1` before launching to skip the inlining — pages stay small, the reader then loads `katex/` from its own folder

---

## Privacy

- Files are opened locally only
- No telemetry, no upload
- Formulas are typeset from the bundled `katex/` folder, so no request leaves the machine when you open a document through a launcher
- Opening `md-editor.html` directly (without the launcher) falls back to the jsDelivr CDN if the bundled copy is not reachable

---

## Development

```bash
node --test        # parser and launcher-packaging tests (test/*.test.mjs, no dependencies)
```

Manual check:

```bat
Open-Editor.bat
```

Then pick or drop `sample.md`.

The launcher scripts must keep CRLF line endings. cmd.exe misreads LF-only batch files and
fails on every line with `'xxx' is not recognized as an internal or external command`.
`.gitattributes` handles this on checkout, and `node --test` fails loudly if it regresses.

---

## License

MIT — see [LICENSE](./LICENSE).

Copyright (c) 2026 MDMiniEditor Contributors.

---

## Credits

- Markdown: lightweight custom parser
- Math: [KaTeX](https://katex.org/) 0.16.11, bundled under `katex/` (MIT) + offline fallback
