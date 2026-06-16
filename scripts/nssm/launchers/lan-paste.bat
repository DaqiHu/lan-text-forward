@echo off
REM ============================================================
REM  NSSM launcher — LAN Paste Service
REM
REM  NSSM calls this .bat file as the service entry point.
REM  It sets env vars and launches node dist/server.js.
REM
REM  环境变量:
REM    PORT  — HTTP 端口（默认 18765），可通过 NSSM
REM            AppEnvironmentExtra 覆盖，或在此修改
REM ============================================================

set NODE_ENV=production

REM 确保 node 在 PATH 中（常见安装位置）
set PATH=C:\Program Files\nodejs;%PATH%

REM 切换到项目根目录
cd /d %~dp0..\..\..

REM 启动服务
node dist\server.js
