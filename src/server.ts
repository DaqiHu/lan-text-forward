import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { HTTP_PORT, RATE_LIMIT_MS, MAX_TEXT_LENGTH } from './config';
import { startDiscovery, DeviceInfo } from './discovery';
import { doPasteAndRestore } from './paste';

const app = express();
const server = http.createServer(app);

// 静态文件（手机前端）
app.use(express.static(path.join(__dirname, '..', 'public')));

// JSON 体解析
app.use(express.json());

// 启动设备发现
const discovery = startDiscovery();

// ─── HTTP API ────────────────────────────────────────────────

/** GET /devices — 返回在线设备列表 */
app.get('/devices', (_req, res) => {
  res.json({
    selfId: discovery.getSelfId(),
    devices: discovery.getDevices(),
  });
});

/** POST /paste — 接收其他服务端转发来的粘贴请求（内部接口） */
app.post('/paste', async (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: '缺少有效的 text' });
    return;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: `text 过长（最大 ${MAX_TEXT_LENGTH} 字节）` });
    return;
  }

  try {
    await doPasteAndRestore(text);
    res.json({ success: true });
  } catch (err) {
    const message = (err as Error).message;
    console.error('[粘贴] 执行失败:', message);
    res.status(500).json({ error: message });
  }
});

// ─── WebSocket ────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * 向其他服务端转发粘贴请求。
 */
function forwardPaste(target: DeviceInfo, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ text });
    const options: http.RequestOptions = {
      hostname: target.ip,
      port: target.port,
      path: '/paste',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`目标返回 ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`连接目标失败: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('连接目标超时'));
    });

    req.write(data);
    req.end();
  });
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] 手机已连接');

  let lastPasteTime = 0;

  ws.on('message', async (raw: Buffer) => {
    // 解析消息
    let data: { targetId?: string; text?: string };
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
      return;
    }

    const { targetId, text } = data;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return;
    }

    if (text.length > MAX_TEXT_LENGTH) {
      ws.send(JSON.stringify({ type: 'error', message: `文本过长（最大 ${MAX_TEXT_LENGTH} 字符）` }));
      return;
    }

    // 频率限制
    const now = Date.now();
    if (now - lastPasteTime < RATE_LIMIT_MS) {
      ws.send(JSON.stringify({ type: 'error', message: '操作太频繁，请稍候' }));
      return;
    }
    lastPasteTime = now;

    // 查找目标设备
    const devices = discovery.getDevices();
    const target = devices.find((d) => d.id === targetId);
    if (!target) {
      ws.send(JSON.stringify({ type: 'error', message: '目标设备离线或不存在' }));
      return;
    }

    const selfId = discovery.getSelfId();

    if (target.id === selfId) {
      // ── 本机粘贴 ──
      try {
        await doPasteAndRestore(text);
        ws.send(JSON.stringify({ type: 'success', message: '已粘贴到本机' }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: (err as Error).message }));
      }
    } else {
      // ── 转发到其他设备 ──
      try {
        await forwardPaste(target, text);
        ws.send(JSON.stringify({
          type: 'success',
          message: `已粘贴到 ${target.hostname}`,
        }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: (err as Error).message }));
      }
    }
  });

  ws.on('close', () => {
    console.log('[WS] 手机断开');
  });

  ws.on('error', (err) => {
    console.error('[WS] 连接错误:', err.message);
  });
});

// ─── 启动 ────────────────────────────────────────────────────

server.listen(HTTP_PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  console.log('═══════════════════════════════════════════');
  console.log('  局域网快传粘贴服务已启动');
  console.log(`  端口: ${HTTP_PORT}`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  地址: http://${net.address}:${HTTP_PORT}`);
      }
    }
  }
  console.log('═══════════════════════════════════════════');
  console.log('  手机浏览器访问上述地址即可使用');
  console.log('═══════════════════════════════════════════');
});
