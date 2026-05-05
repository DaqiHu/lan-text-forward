$startup = [Environment]::GetFolderPath('Startup')
$shortcut = Join-Path $startup 'lan-paste.lnk'
$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcut)
$link.TargetPath = 'node.exe'
$link.Arguments = 'dist/server.js'
$link.WorkingDirectory = 'g:\GitHub\lan-text-forward'
$link.WindowStyle = 7
$link.Description = 'LAN Paste Service'
$link.Save()
if (Test-Path $shortcut) {
  Write-Host "OK: $shortcut"
} else {
  Write-Host 'FAILED'
}
