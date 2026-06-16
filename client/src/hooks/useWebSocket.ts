import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionStatus, WSMessage } from '../types';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  send: (data: string) => void;
  lastResponse: WSMessage | null;
  clearResponse: () => void;
}

/**
 * WebSocket connection with auto-reconnect.
 * Connects to `ws[s]://<host>/ws` and exposes a `send` function.
 */
export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastResponse, setLastResponse] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  const clearResponse = useCallback(() => {
    setLastResponse(null);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) {
        setStatus('connected');
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (mountedRef.current) {
          setLastResponse(msg);
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      if (mountedRef.current) {
        setStatus('error');
      }
    };
  }, []);

  const send = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, send, lastResponse, clearResponse };
}
