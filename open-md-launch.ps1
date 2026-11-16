# open-md-launch.ps1 — .md 文件关联的入口
#
# 为什么需要这个文件：把 .md 关联写成 `something.bat "%1"` 时，cmd.exe 会在**调用 bat 之前**
# 就解析失败——路径里的 `)` 被当成块语法（报 "was unexpected at this time"），bat 从不执行，
# 双击的窗口一闪而过、也不会有日志。走 PowerShell 直接调用可绕开 cmd 的块解析。
#
# 注册表（install-file-association.ps1 会写）：
#   powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File "<本文件>" -MdPath "%1"
#
# 日志不在这里记：所有入口都转发到 open-md.ps1，由它统一写 %TEMP%\mdminieditor-open.log。

param(
    [Parameter(Mandatory = $false)]
    [string]$MdPath
)

if ([string]::IsNullOrWhiteSpace($MdPath)) {
    Write-Host 'Please drop a .md file onto this shortcut, or pass -MdPath "C:\path\file.md" / 请把 .md 文件拖到此快捷方式上，或传入 -MdPath'
    exit 1
}

if (-not (Test-Path -LiteralPath $MdPath)) {
    Write-Host ("File not found / 文件不存在: {0}" -f $MdPath)
    exit 1
}

$ps1 = Join-Path $PSScriptRoot 'open-md.ps1'

# 直接调用而不是 Start-Process -Wait：从双击启动的嵌套 Start-Process 可能让外层控制台
# 挂在一个已分离的子进程上，表现为"窗口一闪就没"。`&` 在当前进程内同步执行并返回退出码。
& powershell.exe -NoProfile -Sta -ExecutionPolicy Bypass -File $ps1 -MdPath $MdPath
exit $LASTEXITCODE
