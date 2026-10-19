# Changelog

## 2.0.0 — 2026-10-14

### Changed
- The project is now called **MDMiniEditor** (it reads *and* edits Markdown, and the editor is the newer half). The GitHub repository was renamed from `yubingz/MD-Reader`, so old links redirect. Display names, the copyright line and the repository links in the credits bar point at the new name (#36)
- The main file is now **`md-editor.html`** (was `md-reader.html`), matching the project. If you bookmarked the old path or associated `.md` files with a shortcut to it, re-point them: the launchers and the READMEs are updated, but nothing outside this folder can be (#36)
- The double-click launcher is now **`Open-Editor.bat`** (was `Open-Reader.bat`), matching the project. If you associated `.md` files or made a shortcut pointing at the old name, re-point it. `Open-MD-File.bat` — the one that takes a file path, for drag-and-drop and file associations — keeps its name and is unaffected (#38)

### Fixed
- The launcher no longer aborts on Windows PowerShell 5.1 with `[System.Convert] does not contain a method named 'ToHexString'`. The write-back token generator called a .NET 5+ API, but `powershell.exe` on every supported Windows is 5.1 on .NET Framework, where the method does not exist — and because the script sets `$ErrorActionPreference = 'Stop'`, double-clicking a document failed with "Could not build the reading page" instead of opening it. The token is now built with `-f` formatting, which works on both runtimes (#48)
- An image or link URL containing a space now renders. `![Fig 1](fig/Fig 1.png)` used to show the raw markdown because the URL pattern excluded whitespace; `fig/Fig 1.png` is an ordinary file name for a paper's figures (#40)
- Markdown inside inline code is no longer interpreted: `` `![alt](a.png)` `` and `` `[t](http://a.com)` `` stay literal instead of becoming an image or a link. Code spans are now lifted out before the image and link passes run (#40)
- Unclosed code fence no longer drops the rest of the document (#1)
- Link and image URLs are restricted to http/https/mailto, fragments and relative paths (#3)
- KaTeX no longer renders with a blanket `trust: true`: `\href{javascript:…}` cannot become a link and `\includegraphics` cannot fetch a remote image (#5)
- `Open-Reader.bat` and `Open-MD-File.bat` were committed with LF line endings, so cmd.exe misread them and every launch died with `'xxx' is not recognized as an internal or external command` (#9)
- Double-clicking `Open-Reader.bat` no longer stops at an empty reader: it asks for a `.md` and opens it in the same step (#10)
- Link and image titles (`[t](url "T")`) are rendered instead of being left as literal text (#7)
- The offline math fallback renders operator names (`\max`, `\min`, `\log`, …) and drops unknown commands instead of printing the raw TeX (#12)
- Nested lists nest inside their parent item, 4-backtick fences keep an inner fenced block, a setext h2 renders as a heading, and `\|` no longer splits a table cell (#14)
- The launcher anchors the preload on the unique `/* PARSER:BEGIN */` marker instead of a repeated literal, and deletes the temp reading page it creates after opening it (#16)
- `md-editor.html` ships with CRLF line endings only, so editing it no longer shows unrelated EOF/line-ending noise; `.gitattributes` pins `*.html` to CRLF and normalises every other file, and a `.gitignore` keeps local build artefacts out of the repository (#18)
- Opening a document works again: the launcher writes the reading page next to the source file as `<name>.reader.html` instead of creating and then deleting a copy in `%TEMP%`, which raced the browser and made it report "File not found. It may have been moved, edited or deleted." for every file (#20, #22)
- A `$` that does not open a formula no longer swallows the text after it. The old `$...$` detection required the span to look "math-ish", so an unmatched `$` was consumed and the rest of the line disappeared. Any closed `$...$` span is now treated as a formula; only a span that contains Chinese — a mis-paired pair straddling prose, as in `税费 $5.50 和 $6.00 元` where the first `$` pairs with the second — is kept as literal text
- A numerical formula such as `$0.87$`, `$15$` or `$0.0679$` is typeset. An earlier version of the rule above keyed on "starts with a digit" to catch prices, which rejected 554 such spans in this project's own 140 KB paper and rendered every one as literal text
- A line holding two prices no longer loses its middle: `税费 $5.50 和 $6.00 元` used to render as `税费 <math>6.00 元` because the first `$` paired with the second

### Added
- Inline SVG figures render as pictures. A fenced ` ```svg ` block or a top-level pasted `<svg>…</svg>` block used to show as escaped text (the parser escapes everything); both now go through one sanitizer — a fixed element and attribute allowlist, no `script`, `foreignObject`, `style`, `on*` handler, remote `href` or `url(…)` paint, and no fetchable sub-resource, so the offline guarantee is unchanged. A block the sanitizer cannot read falls back to a normal code block with the content kept (#49)
- Formulas render with no network access: the launcher inlines a bundled KaTeX 0.16.11 build (JS + CSS + fonts) into every generated reading page, so opening a document offline no longer falls back to the plain-text renderer. `node --test` treats a pruned font as an error and asserts the KaTeX script is written as its own closed tag
- Both launchers now call `open-md.ps1`, which hands the page to the browser the user has registered for `.html` (instead of probing for Edge), converts paths through `[Uri]` (spaces, non-ASCII, `#`) and shows the real error instead of a generic "failed to build reading page"
- `Open-Reader.bat` accepts a dragged file as well as a double-click (`-MdPath` alongside `-Pick`), and the file dialog opens in the current folder when it already holds Markdown documents
- The launchers switch the console to UTF-8 (`chcp 65001`) first, so their bilingual messages are readable on a GBK console instead of mojibake
- `.gitattributes` pins `*.bat`, `*.cmd` and `*.ps1` to CRLF, so a clone, download or ZIP always lands with working launchers
- Markdown containing `</script>` can no longer break the generated reading page (the injected text escapes `</`)
- Refresh re-reads the document instead of reloading the page: `Ctrl+R` / `F5` re-render the open document in place — from disk when a file handle is available, from memory otherwise — and keep the scroll position, so a refresh never wipes the reader (#28)
- An edit pane with a live preview: `预览 / 编辑 / 分栏` switch between reading, editing and both at once. The source is highlighted by structure (headings, emphasis, code, math, links), `Ctrl+S` saves back to the file the document came from, and unsaved edits are marked next to the file name and warned about before the tab closes (#32)
- Split view in both directions — side by side (editor left, preview right) or stacked (editor on top) — with a draggable divider whose position is remembered (#32)
- A credits bar shows `© 2026 yubingz`, the MIT licence, and links to the repository and its issue tracker, and invites stars, issues and pull requests. It is plain markup — the page still loads nothing until you click — and it is hidden when you print (#34)
- The README feature lists name the editor pane, the split view and image rendering. Both files introduce the project as a reader *and editor* (#36), but the lists still described a read-only reader, so a visitor scanning them saw half the tool (#42)
- `Ctrl+S` saves back to the opened file even when it was opened by double-clicking (the launcher flow, where the page has no file handle): the launcher starts a loopback-only, token-gated writer that overwrites the one opened document, and Save falls back to a file dialog or a copy only when no writer answers. A separate `另存为 / Save As` (`Ctrl+Shift+S`) always opens a save dialog with a file-name box (#46)

### Changed
- Typesetting is spread over animation frames. The project's own 140 KB paper holds 1307 formulas at ~0.9 ms each, so a single synchronous pass blocked the first paint for over a second
- Typesetting budgets each frame by elapsed time (~10 ms) rather than a fixed number of formulas, so a heavy document cannot overrun the frame and drop scroll/input responsiveness regardless of how complex its formulas are

## 1.0.0 — 2026-09-29

### Added
- Minimal offline Markdown reader (single HTML)
- GFM: headings, lists, tasks, tables, code, quotes
- LaTeX math (`$...$`, `$$...$$`) with KaTeX + offline fallback
- Dark / light theme, TOC, font size, print-to-PDF
- Windows launchers: `Open-Reader.bat`, `Open-MD-File.bat`
- Bilingual README (zh-CN / en)

### Fixed
- Math no longer broken by markdown `_italic_` rules
- Normalize escaped `\\` in TeX sources
- Blockquotes no longer show `[object Object]`
