#Requires -RunAsAdministrator
<#
.SYNOPSIS
  一键安装 / 更新 NSSM 管理的 Windows 服务。

.DESCRIPTION
  读取 services.json，对每个 enabled: true 的服务：
    1. 检查 nssm.exe 是否就绪（System32 或本地）
    2. 解析 launcher 的绝对路径
    3. nssm install（或 update）
    4. 设置崩溃重启、开机自启、日志轮转
    5. 启动服务

.NOTES
  需要管理员权限（#Requires -RunAsAdministrator）。
  首次运行前：从 https://nssm.cc/download 下载 nssm.exe 放到 scripts/nssm/ 下，
  本脚本会自动将其复制到 C:\Windows\System32\。
#>

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path "$scriptDir\..\.."

# ── 工具函数 ────────────────────────────────────────────────

function Write-Step { param([string]$Text) Write-Host "> $Text" -ForegroundColor Cyan }
function Write-OK   { param([string]$Text) Write-Host "  OK  $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  WARN $Text" -ForegroundColor Yellow }
function Write-Err  { param([string]$Text) Write-Host "  ERR $Text" -ForegroundColor Red }

# ── 0. 确保 nssm.exe 可用 ───────────────────────────────────

$nssmLocal  = Join-Path $scriptDir "nssm.exe"
$nssmSystem = Join-Path $env:SystemRoot "System32\nssm.exe"

if (Test-Path $nssmSystem) {
    $nssmExe = $nssmSystem
    Write-OK "nssm.exe found in System32"
} elseif (Test-Path $nssmLocal) {
    Write-Step "Copying nssm.exe to System32..."
    Copy-Item $nssmLocal $nssmSystem -Force
    $nssmExe = $nssmSystem
    Write-OK "nssm.exe copied to System32"
} else {
    Write-Err "nssm.exe not found!"
    Write-Host ""
    Write-Host "  Download from: https://nssm.cc/download" -ForegroundColor Yellow
    Write-Host "  Extract nssm.exe and place it at:" -ForegroundColor Yellow
    Write-Host "    $nssmLocal" -ForegroundColor Yellow
    Write-Host "  Then re-run this script." -ForegroundColor Yellow
    exit 1
}

# ── 1. 读取配置 ─────────────────────────────────────────────

Write-Step "Reading services.json..."
$configPath = Join-Path $scriptDir "services.json"
if (-not (Test-Path $configPath)) {
    Write-Err "services.json not found at $configPath"
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$enabled = $config.services | Where-Object { $_.enabled }
if ($enabled.Count -eq 0) {
    Write-Warn "No enabled services found in services.json."
    exit 0
}

Write-OK "$($enabled.Count) service(s) to install"

# ── 2. 逐个安装 ────────────────────────────────────────────

foreach ($svc in $enabled) {
    $name        = $svc.name
    $displayName = $svc.displayName
    $description = $svc.description
    $launcherRel = $svc.launcher
    $launcherAbs = Join-Path $scriptDir $launcherRel

    Write-Host ""
    Write-Step "Installing [$name]..."

    # 验证 launcher 存在
    if (-not (Test-Path $launcherAbs)) {
        Write-Err "Launcher not found: $launcherAbs"
        continue
    }

    # 日志路径
    $logDir = Join-Path $projectRoot "logs"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $stdoutLog = Join-Path $logDir "$name.log"
    $stderrLog = Join-Path $logDir "$name-error.log"

    # 检查是否已安装
    $null = & $nssmExe status $name 2>&1
    $isInstalled = ($LASTEXITCODE -eq 0)

    if (-not $isInstalled) {
        Write-Host "  Creating service..."
        & $nssmExe install $name $launcherAbs 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to install service $name"
            continue
        }
    } else {
        Write-Host "  Service already exists - updating configuration..."
    }

    # 设置服务属性
    & $nssmExe set $name DisplayName $displayName 2>&1 | Out-Null
    & $nssmExe set $name Description $description 2>&1 | Out-Null
    & $nssmExe set $name AppDirectory $projectRoot 2>&1 | Out-Null
    & $nssmExe set $name Start SERVICE_AUTO_START 2>&1 | Out-Null
    & $nssmExe set $name AppExit Default Restart 2>&1 | Out-Null
    & $nssmExe set $name AppStdout $stdoutLog 2>&1 | Out-Null
    & $nssmExe set $name AppStderr $stderrLog 2>&1 | Out-Null
    & $nssmExe set $name AppRotateFiles 1 2>&1 | Out-Null
    & $nssmExe set $name AppRotateSeconds 86400 2>&1 | Out-Null
    & $nssmExe set $name AppRotateBytes 1048576 2>&1 | Out-Null
    & $nssmExe set $name AppThrottle 5000 2>&1 | Out-Null
    & $nssmExe set $name AppEnvironmentExtra "NODE_ENV=production" 2>&1 | Out-Null

    Write-OK "Configuration done"

    # 启动服务
    Write-Host "  Starting service..."
    & $nssmExe start $name 2>&1 | Out-Null
    Start-Sleep -Seconds 2

    # 验证状态
    $status = & $nssmExe status $name
    if ($status -eq "SERVICE_RUNNING") {
        Write-OK "Status: RUNNING"
    } elseif ($status -eq "SERVICE_START_PENDING") {
        Write-OK "Status: START_PENDING (give it a few seconds)"
    } else {
        Write-Warn "Status: $status - check logs: logs\$name-error.log"
    }
}

# ── 3. 汇总 ─────────────────────────────────────────────────

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "  Manage services:" -ForegroundColor White
Write-Host "    nssm status lan-paste" -ForegroundColor Gray
Write-Host "    nssm start  lan-paste" -ForegroundColor Gray
Write-Host "    nssm stop   lan-paste" -ForegroundColor Gray
Write-Host "    nssm restart lan-paste" -ForegroundColor Gray
Write-Host "    services.msc          (GUI)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Check logs:" -ForegroundColor White
Write-Host "    Get-Content logs\lan-paste.log -Tail 50" -ForegroundColor Gray
Write-Host "==============================================" -ForegroundColor Cyan
