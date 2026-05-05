import dgram from 'dgram';
import { networkInterfaces } from 'os';
import {
  MULTICAST_ADDR,
  DISCOVERY_PORT,
  resolvePort,
  ANNOUNCE_INTERVAL,
  DEVICE_TIMEOUT,
  CLEANUP_INTERVAL,
  DEVICE_ID,
  HOSTNAME,
} from './config';

const HTTP_PORT = resolvePort();

export interface DeviceInfo {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  lastSeen: number;
}

const devices = new Map<string, DeviceInfo>();

/** 获取本机局域网 IP（第一个非内部 IPv4） */
function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();

export interface DiscoveryHandle {
  getDevices: () => DeviceInfo[];
  getSelfId: () => string;
}

/**
 * 启动 UDP 多播设备发现。
 * @param onDeviceUpdate 设备列表变化时的回调（可选）
 */
export function startDiscovery(onDeviceUpdate?: () => void): DiscoveryHandle {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  socket.on('listening', () => {
    socket.addMembership(MULTICAST_ADDR);
    console.log(`[发现] 设备发现已启动 (${localIP}:${DISCOVERY_PORT})`);

    // 周期性宣告自身存在
    setInterval(() => {
      const msg = JSON.stringify({
        type: 'announce',
        hostname: HOSTNAME,
        ip: localIP,
        port: HTTP_PORT,
        id: DEVICE_ID,
      });
      socket.send(msg, DISCOVERY_PORT, MULTICAST_ADDR);
    }, ANNOUNCE_INTERVAL);
  });

  socket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'announce' && data.id !== DEVICE_ID) {
        devices.set(data.id, {
          id: data.id,
          hostname: data.hostname,
          ip: data.ip,
          port: data.port,
          lastSeen: Date.now(),
        });
        onDeviceUpdate?.();
      } else if (data.type === 'query') {
        // 收到查询，立即回复一条自己的宣告
        const reply = JSON.stringify({
          type: 'announce',
          hostname: HOSTNAME,
          ip: localIP,
          port: HTTP_PORT,
          id: DEVICE_ID,
        });
        socket.send(reply, rinfo.port, rinfo.address);
      }
    } catch {
      // 忽略无法解析的消息
    }
  });

  socket.on('error', (err) => {
    console.error('[发现] 套接字错误:', err.message);
  });

  socket.bind(DISCOVERY_PORT, () => {
    // 启动后主动查询一次现有设备
    socket.send(JSON.stringify({ type: 'query' }), DISCOVERY_PORT, MULTICAST_ADDR);
  });

  // 定期清理超时设备
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, info] of devices) {
      if (now - info.lastSeen > DEVICE_TIMEOUT) {
        devices.delete(id);
        changed = true;
      }
    }
    if (changed) {
      onDeviceUpdate?.();
    }
  }, CLEANUP_INTERVAL);

  // 禁止 timer 阻止进程退出（dev 模式下有用）
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return {
    getDevices: (): DeviceInfo[] => {
      const list = Array.from(devices.values());
      list.unshift({
        id: DEVICE_ID,
        hostname: HOSTNAME,
        ip: localIP,
        port: HTTP_PORT,
        lastSeen: Date.now(),
      });
      return list;
    },
    getSelfId: () => DEVICE_ID,
  };
}
