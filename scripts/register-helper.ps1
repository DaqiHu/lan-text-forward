# 将 paste-helper 注册到当前用户的启动文件夹
# 运行：powershell -ExecutionPolicy Bypass -File scripts/register-helper.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path "$PSScriptRoot\.."

$shortcutPath = [Environment]::GetFolderPath("Startup") + "\lan-paste-helper.lnk"
$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcutPath)
$link.TargetPath = "node.exe"
$link.Arguments = "dist/helper.js"
$link.WorkingDirectory = $repoRoot
$link.WindowStyle = 7  # minimized
$link.Description = "LAN Paste Desktop Helper — clipboard & keystroke support"
$link.Save()

Write-Host "OK  Startup shortcut created: $shortcutPath"
Write-Host "     The helper will auto-start on next login."
Write-Host ""
Write-Host "  Start now: node dist/helper.js"
