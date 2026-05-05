@echo off
:: 请求管理员权限运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 正在请求管理员权限...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo 添加防火墙规则：放行 3000 端口入站连接...
netsh advfirewall firewall add rule name="lan-paste (TCP 3000)" dir=in protocol=tcp localport=3000 action=allow profile=domain,private description="Allow LAN paste service inbound connections"

if %errorLevel% equ 0 (
    echo 防火墙规则添加成功
) else (
    echo 添加失败，请手动以管理员身份运行
)

pause
