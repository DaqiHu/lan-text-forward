import os from 'os';
import crypto from 'crypto';

/** HTTP 服务默认端口（可通过 PORT 环境变量覆盖） */
export const DEFAULT_HTTP_PORT = 18765;

/** 解析最终使用的 HTTP 端口 */
export function resolvePort(): number {
  const env = process.env.PORT ? parseInt(process.env.PORT, 10) : NaN;
  if (!isNaN(env) && env > 0 && env < 65536) {
    return env;
  }
  return DEFAULT_HTTP_PORT;
}

/** UDP 多播发现端口 */
export const DISCOVERY_PORT = 45678;

/** UDP 多播地址 */
export const MULTICAST_ADDR = '239.255.255.250';

/** 宣告间隔（毫秒） */
export const ANNOUNCE_INTERVAL = 3000;

/** 设备超时（毫秒） */
export const DEVICE_TIMEOUT = 10000;

/** 粘贴频率限制（毫秒） */
export const RATE_LIMIT_MS = 500;

/** 粘贴操作延迟（毫秒） */
export const PASTE_PAUSE_MS = 200;

/** 粘贴后等待恢复剪贴板延迟（毫秒） */
export const PASTE_RESTORE_DELAY_MS = 500;

/** 单次文本最大长度 */
export const MAX_TEXT_LENGTH = 10 * 1024;

/** 本机唯一设备 ID */
export const DEVICE_ID = `${os.hostname()}-${crypto.randomBytes(2).toString('hex')}`;

/** 本机主机名 */
export const HOSTNAME = os.hostname();

/** 清理离线设备间隔（毫秒） */
export const CLEANUP_INTERVAL = 5000;
