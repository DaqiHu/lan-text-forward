# 将 paste-helper 注册到当前用户的启动文件夹（后台不可见）
# 运行：powershell -ExecutionPolicy Bypass -File scripts/register-helper.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path "$PSScriptRoot\.."

# 检测 node.exe 位置
$nodeExe = (Get-Command node -ErrorAction Stop).Source

# 生成 VBS launcher
$vbsPath = Join-Path $repoRoot "scripts\helper-launcher.vbs"
@"
' lan-paste-helper launcher (invisible) — auto-generated
CreateObject("WScript.Shell").Run """$nodeExe"" dist/helper.js", 0, False
"@ | Set-Content $vbsPath -Encoding ASCII -NoNewline

# 创建启动文件夹快捷方式
$shortcutPath = [Environment]::GetFolderPath("Startup") + "\lan-paste-helper.lnk"
$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcutPath)
$link.TargetPath = $vbsPath
$link.WorkingDirectory = $repoRoot
$link.Description = "LAN Paste Desktop Helper"
$link.Save()

Write-Host "OK  node.exe: $nodeExe"
Write-Host "     Startup shortcut: $shortcutPath"
Write-Host "     Helper will auto-start on next login — no window."
Write-Host ""
Write-Host "  Start now: node dist/helper.js"
