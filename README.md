# lan-paste — 局域网快传粘贴服务

手机打字，电脑粘贴。通过浏览器在手机上输入文字，一键发送到局域网内的任意电脑。

## 工作原理

```
┌──────────────┐     WebSocket / HTTP     ┌──────────────────┐
│  手机浏览器    │ ◄──────────────────────► │  电脑（本服务）    │
│  (Web 前端)   │                          │  Express + WS    │
└──────────────┘                          │  UDP 多播发现     │
                                          │  剪贴板 + 模拟按键 │
                                          └──────────────────┘
                                                  │
                                                  │ HTTP POST /paste
                                                  ▼
                                          ┌──────────────────┐
                                          │  局域网内其他电脑   │
                                          │  （同样运行本服务） │
                                          └──────────────────┘
```

- **设备发现**：UDP 多播自动发现局域网内所有运行本服务的设备
- **WebSocket**：手机浏览器与服务端保持长连接
- **文本转发**：手机选择目标电脑 → 文本写入剪贴板 → 模拟 Ctrl+V + Enter 粘贴发送
- **剪贴板保护**：粘贴完成后自动恢复原始剪贴板内容

## 快速开始

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 启动服务
npm start

# 手机访问终端输出的地址（例如 http://192.168.1.100:18765）
```

端口默认 **18765**，可通过环境变量覆盖：

```bash
PORT=9999 npm start
```

## 防火墙配置

首次运行时脚本会自动尝试添加 Windows 防火墙入站规则。如果自动添加失败，手动执行：

```powershell
# PowerShell（管理员）
.\scripts\add-firewall-rule.ps1 -Port 18765
```

或 CMD：

```batch
netsh advfirewall firewall add rule name="lan-paste (TCP 18765)" dir=in protocol=tcp localport=18765 action=allow profile=domain,private
```

---

# 开机自启（NSSM）

## 为什么不用 PM2？

PM2 是优秀的 Node.js 进程管理工具，但它的设计目标平台是 **Linux / macOS**。在 Windows 上，PM2 的开机自启方案经历了多个社区项目，各有各的问题：

| 方案 | 首次发布 | 状态 | 问题 |
|---|---|---|---|
| `pm2-windows-startup` | 2015 | 已停更 | 只写注册表 Run 键，**用户登录后才启动、注销就停**，不是真正的服务 |
| `pm2-windows-service` | 2016 | 2022 年归档 | 用了 `node-windows`，重启后 `pm2 resurrect` 不触发，进程列表为空 |
| `pm2-installer` (jessety) | 2020 | 2022.12 最后更新 | 目前最完整的方案，但依赖老化的 `node-windows`，在新版 Windows Server 上有兼容问题 |
| `@nick92/pm2-windows-service` | 2023 | 社区 fork | 小范围维护，长期可靠性未知 |

**PM2 on Windows 的六个经典踩坑：**

1. **`PM2_HOME` 必须设为系统级环境变量**（不是用户级），否则 daemon 找不到 dump 文件
2. **npm 全局目录权限**：默认在 `%APPDATA%\npm`，服务账号无权访问
3. **PowerShell 执行策略**：必须设为 `RemoteSigned`，否则服务脚本被拒绝执行
4. **重启后进程列表为空**：`pm2 save` 了但 `pm2 resurrect` 没触发（`pm2-windows-service` 已知 bug）
5. **`EACCES`/`EPERM` 权限错误**：服务以 `Local Service` 运行时无权访问用户家目录
6. **随机 daemon 崩溃**：社区有多例报告，原因未查明

经过实际尝试，PM2 在 Windows 上的整个维护链已半废弃，不适合作为生产级开机自启方案。

## 为什么选择 NSSM？

[NSSM](https://nssm.cc/)（Non-Sucking Service Manager）是一个纯 Win32 工具，**单个 exe 文件**（~500KB），从 Windows XP 到 Windows 11 全系兼容。它：

- 不依赖 Node.js 生态，不跟项目绑定
- 直接创建标准 Windows 服务，在用户登录**前**就启动
- 内置崩溃自动重启、日志轮转
- 可在 `services.msc` 中统一管理
- 安装卸载都只需一条命令

| 对比维度 | PM2 + pm2-installer | NSSM |
|---|---|---|
| 安装步骤 | 5+ 步（PM2_HOME、npm prefix、执行策略、权限……） | 下载一个 exe，执行一条命令 |
| 启动时机 | 用户登录后 | 系统启动时（登录前） |
| 崩溃重启 | 需配置 `max_restarts` | 原生支持 `AppExit Default Restart` |
| 日志管理 | `pm2 logs` + 额外安装 logrotate | 自动重定向到文件，支持轮转 |
| 管理界面 | 命令行 | `services.msc` GUI + 命令行 |
| 被 Node 版本影响 | 是 | 否 |
| 后续维护成本 | 可能随 Node 升级再次出问题 | 几乎为零 |

## 部署步骤

### 1. 下载 NSSM

从 https://nssm.cc/download 下载 `nssm.exe`，放到 `scripts/nssm/` 目录下：

```
scripts/nssm/
  nssm.exe          ← 下载后放这里（已加入 .gitignore）
  install.ps1
  uninstall.ps1
  status.ps1
  services.json
  launchers/
    lan-paste.bat
```

### 2. 编译项目

```bash
npm run build
```

确保 `dist/server.js` 存在。

### 3. 安装服务

以**管理员身份**打开 PowerShell：

```powershell
.\scripts\nssm\install.ps1
```

脚本会自动：
- 将 `nssm.exe` 复制到 `C:\Windows\System32\`（全局可用）
- 读取 `services.json`，注册所有 `enabled: true` 的服务
- 配置开机自启、崩溃自动重启、日志轮转
- 立即启动服务

### 3b. 手动安装（备用）

如果不想用自动化脚本，也可以逐条执行 `nssm` 命令。以**管理员身份**打开 CMD 或 PowerShell：

```batch
REM 0. 确保 nssm.exe 已复制到 System32（或使用全路径调用）
copy scripts\nssm\nssm.exe C:\Windows\System32\

REM 1. 创建服务
nssm install lan-paste G:\GitHub\lan-text-forward\scripts\nssm\launchers\lan-paste.bat

REM 2. 配置服务属性
nssm set lan-paste DisplayName "LAN Paste Service"
nssm set lan-paste Description "局域网快传粘贴服务 — 手机打字，电脑粘贴 (port 18765)"
nssm set lan-paste AppDirectory G:\GitHub\lan-text-forward
nssm set lan-paste Start SERVICE_AUTO_START
nssm set lan-paste AppExit Default Restart
nssm set lan-paste AppStdout G:\GitHub\lan-text-forward\logs\lan-paste.log
nssm set lan-paste AppStderr G:\GitHub\lan-text-forward\logs\lan-paste-error.log
nssm set lan-paste AppRotateFiles 1
nssm set lan-paste AppRotateSeconds 86400
nssm set lan-paste AppRotateBytes 1048576
nssm set lan-paste AppThrottle 5000
nssm set lan-paste AppEnvironmentExtra "NODE_ENV=production"

REM 3. 启动
nssm start lan-paste
```

配置说明：

| 参数 | 作用 |
|---|---|
| `Start SERVICE_AUTO_START` | 开机自启 |
| `AppExit Default Restart` | 进程退出时自动重启 |
| `AppThrottle 5000` | 两次重启之间至少间隔 5 秒（防止 crash-loop） |
| `AppRotateFiles 1` | 启用日志轮转 |
| `AppRotateSeconds 86400` | 每天轮转一次 |
| `AppRotateBytes 1048576` | 或超过 1 MB 时轮转 |
| `AppEnvironmentExtra` | 注入环境变量到服务进程 |

### 4. 验证

```powershell
# 查看状态
.\scripts\nssm\status.ps1

# 或直接
nssm status lan-paste
```

预期输出：

```
SERVICE              STATUS                 STARTUP
────────────────────────────────────────────────────
lan-paste            SERVICE_RUNNING        Automatic
```

### 5. 查看日志

```powershell
# 最近 50 行
Get-Content logs\lan-paste.log -Tail 50

# 实时跟踪
Get-Content logs\lan-paste.log -Wait
```

## 日常管理

```powershell
# 状态总览
.\scripts\nssm\status.ps1

# 停止服务
nssm stop lan-paste

# 启动服务
nssm start lan-paste

# 重启服务（代码更新后）
npm run build              # 先编译
nssm restart lan-paste     # 再重启

# 图形化管理
services.msc
```

## 更新 / 重装

改了 `services.json` 或 launcher 后，重新运行安装脚本即可：

```powershell
.\scripts\nssm\install.ps1
```

脚本会检测已存在的服务并更新配置，不会重复注册。

## 卸载

```powershell
.\scripts\nssm\uninstall.ps1
```

## 添加更多服务

在 `services.json` 中加一条，新建对应的 launcher `.bat`，重跑 `install.ps1` 即可。

示例：将来要加一个 `lan-file` 文件传输服务：

```json
{
  "name": "lan-file",
  "displayName": "LAN File Service",
  "description": "局域网文件传输服务 (port 18766)",
  "launcher": "launchers\\lan-file.bat",
  "enabled": true
}
```

---

## 项目结构

```
lan-text-forward/
  src/                    # TypeScript 源码
    server.ts             # Express + WebSocket 主服务
    config.ts             # 配置常量（端口、超时、设备 ID 等）
    discovery.ts          # UDP 多播设备发现
    paste.ts              # 剪贴板操作 + 模拟按键
  client/                 # 手机端 Web 前端（React + Vite）
  dist/                   # tsc 编译产物
  scripts/
    nssm/                 # NSSM 服务管理脚本
    add-firewall-rule.*   # 防火墙规则脚本
  public/                 # client 构建后的静态文件（供 Express 托管）
  logs/                   # 运行日志
```

## 复用到其他仓库

这套 NSSM 服务管理模式是**零依赖、可移植**的。要在另一个 Node.js 项目中使用，复制以下文件并做最小修改：

### 需要复制的文件

```
scripts/nssm/
  install.ps1             ← 直接复制，无需修改
  uninstall.ps1           ← 直接复制，无需修改
  status.ps1              ← 直接复制，无需修改
  services.json           ← 编辑：改掉 services 列表
  launchers/
    <your-service>.bat    ← 新建：一个服务一个 .bat
```

外加：从 https://nssm.cc/download 下载 `nssm.exe` 放到 `scripts/nssm/` 下。

### 适配步骤

1. **复制** `scripts/nssm/` 目录到新仓库
2. **编辑** `services.json`，将 `services` 数组替换为你的服务列表
3. **新建** `launchers/<your-name>.bat`，写清楚如何启动你的 app（设置环境变量 → cd 到项目根 → 执行启动命令）
4. **运行** `.\scripts\nssm\install.ps1`（管理员 PowerShell）

### launcher .bat 模板

```batch
@echo off
set NODE_ENV=production
set PORT=3000                           # 你的端口
set PATH=C:\Program Files\nodejs;%PATH%
cd /d %~dp0..\..\.                      # 回到项目根目录
node dist\server.js                     # 你的启动命令
```

`%~dp0..\..\..` 的含义：`%~dp0` = launcher 所在目录 → `..` 三次回到项目根。如果你的目录结构与 `scripts/nssm/launchers/` 不同，调整 `..` 数量即可。

### 不需要的东西

- ❌ 不需要 `npm install -g pm2`
- ❌ 不需要设 `PM2_HOME` 环境变量
- ❌ 不需要改 npm 全局 prefix
- ❌ 不需要改 PowerShell 执行策略
- ✅ 只需要一个 ~500KB 的 `nssm.exe`

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | Express 4 + ws 8 |
| 设备发现 | UDP 多播 (dgram) |
| 剪贴板 | clipboardy |
| 模拟按键 | PowerShell SendKeys (Win) / osascript (Mac) / xdotool (Linux) |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 开机自启 | NSSM（Windows 服务） |

## License

MIT
