param(
  [int]$Port = 18765
)

# 添加局域网粘贴服务防火墙规则
Write-Host "正在添加防火墙规则：放行 TCP $Port 端口..."
New-NetFirewallRule -DisplayName "lan-paste (TCP $Port)" `
  -Direction Inbound -Protocol TCP -LocalPort $Port `
  -Action Allow -Profile Domain,Private `
  -Description "Allow LAN paste service inbound connections"

Write-Host "防火墙规则已添加"

Write-Host ""
Write-Host "启动服务:"
Write-Host "  PORT=$Port npm start"
Write-Host "或:"
Write-Host "  PORT=$Port pm2 start ecosystem.config.js --update-env"
pause
