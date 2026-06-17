# 将 paste-helper 注册到当前用户的启动文件夹（后台不可见）
# 运行：powershell -ExecutionPolicy Bypass -File scripts/register-helper.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path "$PSScriptRoot\.."

$vbsPath = Join-Path $repoRoot "scripts\helper-launcher.vbs"
$shortcutPath = [Environment]::GetFolderPath("Startup") + "\lan-paste-helper.lnk"

$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcutPath)
$link.TargetPath = $vbsPath
$link.WorkingDirectory = $repoRoot
$link.IconLocation = "shell32.dll,13"
$link.Description = "LAN Paste Desktop Helper — clipboard & keystroke support"
$link.Save()

Write-Host "OK  Startup shortcut created (invisible mode)"
Write-Host "     Helper will auto-start on next login — no window."
Write-Host ""
Write-Host "  Start now: node dist/helper.js"
Write-Host "  Stop:      taskkill /f /im node.exe /fi ""WINDOWTITLE eq helper"""
