# 方法1: 计划任务（需要管理员权限）
$TaskName = "lan-paste-pm2"
$PM2 = "$env:USERPROFILE\AppData\Roaming\npm\pm2.cmd"

try {
  $Action = New-ScheduledTaskAction -Execute $PM2 -Argument "resurrect"
  $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Highest -Force -ErrorAction Stop
  Write-Host "[计划任务] 已创建: $TaskName"
} catch {
  Write-Host "[计划任务] 需要管理员权限，改用启动文件夹方式"

  # 方法2: 启动文件夹快捷方式（无需管理员）
  $startup = [Environment]::GetFolderPath("Startup")
  $shortcut = Join-Path $startup "lan-paste-pm2.lnk"
  $wsh = New-Object -ComObject WScript.Shell
  $link = $wsh.CreateShortcut($shortcut)
  $link.TargetPath = $PM2
  $link.Arguments = "resurrect"
  $link.WindowStyle = 7
  $link.Description = "LAN Paste PM2 Auto Start"
  $link.Save()
  Write-Host "[启动文件夹] 快捷方式已创建: $shortcut"
}

Write-Host ""
Write-Host "当前 PM2 进程列表:"
& $PM2 status

pause
