@echo off
chcp 65001 >nul
rem Open a .md file in the reader. / 用阅读器打开 .md 文件
rem Usage: drag a .md onto this script, or Open-MD-File.bat "C:\path\file.md"
rem
rem For file associations use open-md-launch.ps1 instead. When the association command is
rem `something.bat "%1"`, cmd.exe aborts on a ")" in the document path before this file runs.
rem / 文件关联请用 open-md-launch.ps1。
rem
rem This file must stay CRLF: cmd.exe misreads LF-only batch files and fails on every
rem line (see .gitattributes). / 本文件必须保持 CRLF。
setlocal

if "%~1"=="" (
  echo Please drop a .md file onto this script, or / 请把 .md 文件拖到本脚本上，或：
  echo   Open-MD-File.bat "C:\path\to\file.md"
  pause
  exit /b 1
)

if not exist "%~1" (
  echo File not found / 文件不存在: %~1
  pause
  exit /b 1
)

rem Diagnostics live in open-md.ps1, which owns the log; this file only forwards the path.
powershell -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0open-md.ps1" -MdPath "%~f1"
if errorlevel 1 (
  echo.
  echo Could not build the reading page. The message above says why. / 生成阅读页面失败，原因见上一行。
  pause
  exit /b 1
)
exit /b 0
