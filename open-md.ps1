<#
    open-md.ps1 — build a reading page for a Markdown file and open it in the reader.

    The two Windows launchers differ only in how they get a path:

        Open-MD-File.bat   drag a .md onto it, or pass it on the command line  -> -MdPath
        Open-Editor.bat    double-clicked                                      -> -Pick

    The reader is one self-contained HTML file, so a document is opened by injecting its
    text into a copy of that HTML (window.__PRELOAD_MD__) and opening the copy in the
    user's default browser. With -Pick and nothing selected, the reader itself is opened
    instead — both launchers end in the same place, one browser window.
#>
param(
    [string]$MdPath,
    [string]$Reader,
    [string]$Out,
    [switch]$Pick
)

$ErrorActionPreference = 'Stop'

if (-not $Reader) { $Reader = Join-Path $PSScriptRoot 'md-editor.html' }
if (-not (Test-Path -LiteralPath $Reader)) { throw "Reader not found: $Reader" }

function ConvertTo-JsLiteral([string]$Value) {
    ($Value | ConvertTo-Json -Compress).Replace('</', '<\/')
}

# Resolve where to write the generated HTML — alongside the md file so the browser's
# relative references (if any) keep working, and so the user sees where it came from.
function Get-OutDir([string]$ForMdPath) {
    if ($ForMdPath) {
        $dir = [IO.Path]::GetDirectoryName($ForMdPath)
        if ($dir -and (Test-Path -LiteralPath $dir)) { return $dir }
    }
    $readerDir = [IO.Path]::GetDirectoryName($Reader)
    if ($readerDir -and (Test-Path -LiteralPath $readerDir)) { return $readerDir }
    return [IO.Path]::GetTempPath()
}

if (-not $MdPath -and $Pick) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title  = 'Open Markdown file'
    $dialog.Filter = 'Markdown (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All files (*.*)|*.*'
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $MdPath = $dialog.FileName }
}

if (-not $MdPath) {
    # No file to open — just launch the bare reader
    Start-Process $Reader
    return
}

if (-not (Test-Path -LiteralPath $MdPath)) { throw "Markdown file not found: $MdPath" }

$html = [IO.File]::ReadAllText($Reader, [Text.Encoding]::UTF8)

# ── Inline KaTeX (js + css) so file:/// works without external loads ──
# Inject CSS before </head>, JS right before the main <script> opening.
# We do this BEFORE the preload injection so $ signs in KaTeX minified code
# are never near the md content literal — avoids any chance the parser sees them.
#
# The KaTeX script goes in its OWN self-contained tag, immediately ahead of the reader's
# <script>. It must not be prepended *inside* that tag: the reader's script opens with a
# `(function () { 'use strict';` prologue, so a second program folded in front of it either
# swallows the prologue or silently puts the whole reader into strict mode.
$katexJsPath = Join-Path $PSScriptRoot 'katex\katex.min.js'
$katexCssPath = Join-Path $PSScriptRoot 'katex\katex.min.css'
if ((Test-Path $katexJsPath) -and (Test-Path $katexCssPath)) {
    $katexJs = [IO.File]::ReadAllText($katexJsPath, [Text.Encoding]::UTF8)
    $katexCss = [IO.File]::ReadAllText($katexCssPath, [Text.Encoding]::UTF8)
    # The generated page is written beside the *document*, so the stylesheet's
    # relative `url(fonts/…)` would resolve next to the document and 404 —
    # KaTeX then typesets with fallback fonts (‖ renders as //). Rewrite every
    # font reference to a base64 data URI so the page is truly self-contained.
    $fontDir = Join-Path $PSScriptRoot 'katex\fonts'
    $katexCss = [regex]::Replace($katexCss, 'url\((fonts/[^)]+)\)', {
        param($m)
        $rel = $m.Groups[1].Value
        $f = Join-Path $fontDir ([IO.Path]::GetFileName($rel))
        if (-not (Test-Path -LiteralPath $f)) { return $m.Value }
        $mime = switch ([IO.Path]::GetExtension($f).ToLowerInvariant()) {
            '.woff2' { 'font/woff2' }
            '.woff'  { 'font/woff' }
            default  { 'font/ttf' }
        }
        return 'url(data:' + $mime + ';base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($f)) + ')'
    })
    $html = $html.Replace('</head>', "`n<style>`n$katexCss`n</style>`n</head>")
    $html = $html.Replace('<script>', "<script>`n$katexJs`n</script>`n<script>")
}

$marker = '/* PARSER:BEGIN */'
$idx = $html.IndexOf($marker, [StringComparison]::Ordinal)
if ($idx -lt 0) { throw 'Reader script marker not found' }

$text = [IO.File]::ReadAllText($MdPath, [Text.Encoding]::UTF8)

# ── Write-back writer (issue #46) ──
# A page opened over file:// cannot write to disk itself. Spin up a loopback
# HTTP writer so Save can overwrite the opened document. Security contract:
#   * binds 127.0.0.1 only  (never 0.0.0.0 / *);
#   * holds exactly one target path, the document the launcher resolved —
#     the page never names a destination, so a crafted document cannot repoint it;
#   * is gate by a per-page random token, injected into the page and echoed back;
#   * exits after an idle timeout (or when told to stop), so it never lingers.
$writerPort = $null
$writerToken = ''

function Get-FreePort {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $l.Start()
    $port = ([System.Net.IPEndPoint]$l.LocalEndpoint).Port
    $l.Stop()
    return $port
}

function Get-RandomToken {
    $bytes = New-Object byte[] 24
    ([System.Security.Cryptography.RandomNumberGenerator]::Create()).GetBytes($bytes)
    # [Convert]::ToHexString is .NET 5+ only; Windows PowerShell 5.1 (the
    # powershell.exe the launchers spawn) is .NET Framework and lacks it.
    # -f formatting over the byte array works on both runtimes.
    return (($bytes | ForEach-Object { '{0:x2}' -f $_ }) -join '')
}

# Start the writer as a detached process so it outlives this script. The
# command runs an HttpListener that answers POST /write/<token> on 127.0.0.1,
# checks the token, writes the body to $writerPath, and stops when idle.
function Start-WritebackWriter([string]$WriterPath, [string]$Token, [int]$Port) {
    $script = @"
`$ErrorActionPreference = 'Stop'
`$idleMs = [int]`$env:MDR_WRITER_IDLE_MS
if (-not `$idleMs) { `$idleMs = 600000 }   # 10 min without a Save -> exit
`$listener = [System.Net.HttpListener]::new()
`$listener.Prefixes.Add('http://127.0.0.1:$Port/write/$Token/')
`$listener.Start()
`$stop = [System.Threading.ManualResetEvent]::new(`$false)
`$timer = [System.Threading.Timer]::new({ param(`$s) `$s.Stop() }, `$listener, `$idleMs, -1)
try {
    while (-not `$stop.WaitOne(0)) {
        try {
            `$ctx = `$listener.GetContext()
        } catch {
            break                       # listener stopped -> exit
        }
        `$req = `$ctx.Request
        `$res = `$ctx.Response
        if (`$req.HttpMethod -ne 'POST') { `$res.StatusCode = 405; `$res.Close(); continue }
        if (-not (`$req.Url.AbsolutePath -match '/write/$Token/')) { `$res.StatusCode = 401; `$res.Close(); continue }
        `$reader = New-Object IO.StreamReader(`$req.InputStream, [Text.Encoding]::UTF8)
        `$body = `$reader.ReadToEnd()
        `$reader.Close()
        [IO.File]::WriteAllText('$WriterPath', `$body, [Text.UTF8Encoding]::new(`$false))
        `$timer.Change(`$idleMs, -1)    # a real Save resets the idle clock
        # A file:// page is a null origin; only an explicit ACAO:* lets it read
        # the 200 back, which is how the reader confirms the write happened.
        `$res.Headers.Add('Access-Control-Allow-Origin', '*')
        `$res.StatusCode = 200
        `$res.Close()
    }
} finally {
    `$timer.Dispose()
    `$listener.Stop()
    `$listener.Close()
    `$stop.Dispose()
}
"@
    $args = @('-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', $script)
    Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WindowStyle Hidden
}

if (-not $env:MDR_NO_WRITER) {
    $writerPort = Get-FreePort
    $writerToken = Get-RandomToken
    Start-WritebackWriter $MdPath $writerToken $writerPort
}

$preload = "window.__PRELOAD_MD__ = $(ConvertTo-JsLiteral $text);`n" +
           "window.__PRELOAD_NAME__ = $(ConvertTo-JsLiteral ([IO.Path]::GetFileName($MdPath)));`n" +
           "window.__PRELOAD_PATH__ = $(ConvertTo-JsLiteral $MdPath);`n" +
           "window.__PRELOAD_WRITER__ = $(ConvertTo-JsLiteral "http://127.0.0.1:$writerPort/write/$writerToken/");`n" +
           "window.__PRELOAD_WRITER_TOKEN__ = $(ConvertTo-JsLiteral $writerToken);`n"

if (-not $Out) {
    $dir = Get-OutDir $MdPath
    $base = [IO.Path]::GetFileNameWithoutExtension($MdPath)
    $Out = Join-Path $dir ("$base.reader.html")
}

[IO.File]::WriteAllText($Out, $html.Substring(0, $idx) + $preload + $html.Substring($idx), [Text.UTF8Encoding]::new($false))

# ShellExecute = whatever handler the user registered for .html. That IS the default browser.
Start-Process $Out
