# lan-paste — 局域网快传粘贴服务

手机打字，电脑粘贴。通过浏览器在手机上输入文字，一键发送到局域网内的任意电脑。

## 工作原理

```
┌──────────────┐     WebSocket     ┌──────────────────────┐
│  手机浏览器    │ ◄──────────────► │  NSSM 服务 (开机自启) │
│  (Web 前端)   │                  │  Express + WS        │
└──────────────┘                  │  UDP 多播发现         │
                                  │  转发到其他设备        │
                                  └──────┬───────────────┘
                                         │ 内部 WS (/internal)
                                         ▼
                                  ┌──────────────────────┐
                                  │  paste-helper 进程    │
                                  │  (用户桌面 Session)    │
                                  │  剪贴板 + 模拟按键     │
                                  └──────────────────────┘
```

服务分为两个进程：
- **Server**（NSSM 服务，Session 0）：网络服务、设备发现、请求转发。**不需要桌面权限**。
- **Helper**（用户启动文件夹，Session 1）：连接 Server 的内部 WebSocket，收到粘贴指令后在桌面执行剪贴板写入 + Ctrl+V + Enter。**有完整的桌面权限**。

手机发来的粘贴到本机的请求，Server 通过内部 WS 委托给 Helper 执行，绕过了 Windows 服务的 Session 0 隔离限制。

- **设备发现**：UDP 多播自动发现局域网内所有运行本服务的设备
- **文本转发**：手机选择目标电脑 → Server 判断是否本机 → Helper 执行粘贴
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

如果不想用自动化脚本，也可以逐条执行 `nssm` 命令。以**管理员身份**打开 CMD 或 PowerShell。

首先确认 nssm 是否已在 PATH 中，以及 node 的位置：

```batch
where nssm
where node
```

如果 nssm 不在 PATH 中，安装方式二选一：

```batch
REM 方式 A: chocolatey（推荐，自动加入 PATH）
choco install nssm

REM 方式 B: 手动下载并复制到 System32
REM   从 https://nssm.cc/download 下载 nssm.exe
copy scripts\nssm\nssm.exe C:\Windows\System32\
```

确保 `dist/server.js` 已编译（`npm run build`），然后执行：

```batch
REM 1. 创建服务 — 直接调用 node.exe，不经过 .bat
nssm install lan-paste "C:\Program Files\nodejs\node.exe" dist\server.js

REM 2. 配置服务属性
nssm set lan-paste DisplayName "LAN Paste Service"
nssm set lan-paste Description "局域网快传粘贴服务 -- 手机打字，电脑粘贴 (port 18765)"
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

> **注意**：`node.exe` 的路径可能不同。用 `where node` 查看实际路径，替换上面的 `C:\Program Files\nodejs\node.exe`。

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

## 启停与开机自启

```powershell
# 临时停止（下次开机仍会自启）
nssm stop lan-paste

# 临时启动
nssm start lan-paste

# 禁止开机自启
nssm set lan-paste Start SERVICE_DEMAND_START

# 恢复开机自启
nssm set lan-paste Start SERVICE_AUTO_START
```

`nssm stop` 只管当前进程，不影响开机自启设置。

## 粘贴 Helper（解决 Session 0 权限问题）

NSSM 服务运行在 Session 0，无权操作桌面剪贴板和模拟按键。因此需要一个
**Helper 进程**在用户桌面 Session 中执行粘贴操作。

Helper 连接 Server 的内部 WebSocket（`/internal`），等待粘贴指令并执行。

### 安装 Helper

```powershell
# 注册到启动文件夹（管理员不需要，当前用户即可）
powershell -ExecutionPolicy Bypass -File scripts/register-helper.ps1

# 立即启动（下次开机自动运行）
node dist/helper.js
```

### 验证 Helper 是否在线

```powershell
# 查看日志 — 正常应有 "paste helper connected"
Get-Content C:\ProgramData\lan-paste\logs\lan-paste.1.log -Tail 5 | findstr helper
```

如果日志显示 `paste helper connected`，说明架构正常。手机发送时
日志会显示 `paste to self ok (via helper)`。

## 更新 / 重装

改了 `services.json` 后，重新运行安装脚本即可：

```powershell
.\scripts\nssm\install.ps1
```

脚本会检测已存在的服务并更新配置，不会重复注册。

## 卸载

```powershell
.\scripts\nssm\uninstall.ps1
```

## 添加更多服务

在 `services.json` 中加一条，编译入口脚本，重跑 `install.ps1` 即可。

示例：将来要加一个 `lan-file` 文件传输服务：

```json
{
  "name": "lan-file",
  "displayName": "LAN File Service",
  "description": "局域网文件传输服务 (port 18766)",
  "script": "dist/file-server.js",
  "env": {
    "NODE_ENV": "production",
    "PORT": "18766"
  },
  "enabled": true
}
```

`script` 是相对于项目根目录的 Node.js 入口文件路径。`env` 里的键值对会注入为服务进程的环境变量。不需要 `.bat` 文件。

---

## 测试

```bash
# 前端测试（React 组件）
pnpm test

# 服务端测试（Helper ↔ Server WS 架构）
pnpm test:server
```

服务端测试覆盖：
- Helper 连接 / 断开跟踪
- 粘贴指令委托 & 成功响应
- 错误响应传递
- 多个 Helper 并发连接

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
```

外加：从 https://nssm.cc/download 下载 `nssm.exe` 放到 `scripts/nssm/` 下（或 `choco install nssm`）。

### 适配步骤

1. **复制** `scripts/nssm/` 目录到新仓库
2. **编辑** `services.json`，将 `services` 数组替换为你的服务列表（每条声明 `name`、`script`、`env` 即可，无需 `.bat` 文件）
3. **运行** `.\scripts\nssm\install.ps1`（管理员 PowerShell）

### services.json 示例

```json
{
  "services": [
    {
      "name": "my-app",
      "displayName": "My App Service",
      "description": "My app backend (port 3000)",
      "script": "dist/server.js",
      "env": {
        "NODE_ENV": "production",
        "PORT": "3000"
      },
      "enabled": true
    }
  ]
}
```

`script` 是相对于项目根目录的 Node.js 入口文件。`env` 会自动注入为服务进程的环境变量。

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
