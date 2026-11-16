# install-file-association.ps1 — 把 .md 关联到 MDMiniEditor
#
# 为什么不用 bat 做关联入口：把 .md 关联写成 `something.bat "%1"` 时，cmd.exe 会在调用 bat
# 之前就解析失败——路径里的 `)` 被当成块语法（报 "was unexpected at this time"），bat 从不
# 执行，双击的窗口一闪而过。走 PowerShell 直接调用可绕开 cmd 的块解析。
#
# 用法：右键本文件 → 使用 PowerShell 运行；或
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-file-association.ps1

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$launcher = Join-Path $root 'open-md-launch.ps1'

if (-not (Test-Path -LiteralPath $launcher)) {
    Write-Host ("找不到 {0} / not found: {0}" -f $launcher)
    exit 1
}

$command = 'powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "{0}" -MdPath "%1"' -f $launcher

# 两处都要写：
#  - MDMiniEditor.md 是"我们自己的" ProgId，干净、可控
#  - Applications\Open-MD-File.bat 是用户先前「打开方式 → 始终使用」时 Windows 实际选中的
#    ProgId；只写前者而用户已经选过后，双击仍然走后者（2026-11-16 排查中踩到）。
$targets = @(
    'HKCU:\Software\Classes\MDMiniEditor.md\shell\open\command',
    'HKCU:\Software\Classes\Applications\Open-MD-File.bat\shell\open\command'
)

foreach ($t in $targets) {
    if (-not (Test-Path $t)) { New-Item -Path $t -Force | Out-Null }
    Set-ItemProperty -Path $t -Name '(default)' -Value $command
    Write-Host ("已写入 / wrote: {0}" -f $t)
}

# 类型显示名与图标（不影响启动，缺失也不报错）
$typeKey = 'HKCU:\Software\Classes\MDMiniEditor.md'
if (-not (Test-Path $typeKey)) { New-Item -Path $typeKey -Force | Out-Null }
Set-ItemProperty -Path $typeKey -Name '(default)' -Value 'Markdown Document'

$iconKey = Join-Path $typeKey 'DefaultIcon'
if (-not (Test-Path $iconKey)) { New-Item -Path $iconKey -Force | Out-Null }
Set-ItemProperty -Path $iconKey -Name '(default)' -Value ('"{0}",0' -f (Join-Path $root 'md-editor.html'))

$extKey = 'HKCU:\Software\Classes\.md'
if (-not (Test-Path $extKey)) { New-Item -Path $extKey -Force | Out-Null }
Set-ItemProperty -Path $extKey -Name '(default)' -Value 'MDMiniEditor.md'

Write-Host ''
Write-Host '已写入注册表。' -ForegroundColor Green
Write-Host ''
Write-Host '还剩一步需要手动完成（Windows 对 UserChoice 有哈希保护，脚本无法代劳）：'
Write-Host '  右键任意 .md →「打开方式」→「选择其他应用」→'
Write-Host '  勾选「始终使用此应用」→ 选择 open-md-launch.ps1'
Write-Host ''
Write-Host '完成后再双击 .md 即可。若仍走旧的处理程序，请在「设置 → 应用 → 默认应用」里'
Write-Host '按文件类型重置一次 .md。'
