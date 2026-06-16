import { useState, useEffect, useCallback, useRef } from 'react';
import type { DeviceInfo } from '../types';

interface UseDevicesReturn {
  devices: DeviceInfo[];
  selfId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch device list from the server every 30 seconds,
 * and expose a manual refresh trigger.
 */
export function useDevices(): UseDevicesReturn {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/devices');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (mountedRef.current) {
        setDevices(data.devices);
        setSelfId(data.selfId);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : '获取设备列表失败');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDevices();

    const interval = setInterval(fetchDevices, 30_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchDevices]);

  return { devices, selfId, loading, error, refresh: fetchDevices };
}
