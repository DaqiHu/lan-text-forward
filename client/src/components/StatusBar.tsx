import { useEffect, useState } from 'react';
import type { StatusEntry, ConnectionStatus } from '../types';

interface StatusBarProps {
  entries: StatusEntry[];
  connectionStatus: ConnectionStatus;
  onDismiss: (id: number) => void;
}

const STATUS_CONFIG = {
  success: {
    bg: 'bg-apple-green/10 dark:bg-apple-green/20',
    border: 'border-apple-green/20',
    text: 'text-apple-green',
    icon: '✓',
  },
  error: {
    bg: 'bg-apple-red/10 dark:bg-apple-red/20',
    border: 'border-apple-red/20',
    text: 'text-apple-red',
    icon: '✕',
  },
  info: {
    bg: 'bg-apple-blue/10 dark:bg-apple-blue/20',
    border: 'border-apple-blue/20',
    text: 'text-apple-blue',
    icon: 'ⓘ',
  },
} as const;

const CONNECTION_LABELS: Record<ConnectionStatus, { text: string; color: string }> = {
  connecting: { text: '连接中...', color: 'text-apple-orange' },
  connected: { text: '已连接', color: 'text-apple-green' },
  disconnected: { text: '未连接', color: 'text-apple-gray' },
  reconnecting: { text: '连接断开，3秒后重连...', color: 'text-apple-red' },
  error: { text: '连接错误', color: 'text-apple-red' },
};

/**
 * Toast-style status notification stack with auto-dismiss.
 */
export function StatusBar({
  entries,
  connectionStatus,
  onDismiss,
}: StatusBarProps) {
  return (
    <div className="space-y-2">
      {/* Toasts */}
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
        ))}
      </div>

      {/* Connection status indicator */}
      <div className="flex items-center justify-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
          connectionStatus === 'connected' ? 'bg-apple-green' :
          connectionStatus === 'connecting' ? 'bg-apple-orange animate-pulse' :
          connectionStatus === 'reconnecting' ? 'bg-apple-red animate-pulse' :
          'bg-apple-gray'
        }`} />
        <span className={`text-xs font-medium ${CONNECTION_LABELS[connectionStatus].color}`}>
          {CONNECTION_LABELS[connectionStatus].text}
        </span>
      </div>
    </div>
  );
}

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: StatusEntry;
  onDismiss: (id: number) => void;
}) {
  const config = STATUS_CONFIG[entry.type];
  const [exiting, setExiting] = useState(false);

  // Auto-dismiss after 3s for success, 5s for error/info
  useEffect(() => {
    const dismissMs = entry.type === 'success' ? 3000 : 5000;
    const exitTimer = setTimeout(() => setExiting(true), dismissMs);
    const removeTimer = setTimeout(() => onDismiss(entry.id), dismissMs + 300);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [entry.id, entry.type, onDismiss]);

  return (
    <div
      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border backdrop-blur-sm
                  ${config.bg} ${config.border}
                  ${exiting ? 'animate-toast-out' : 'animate-toast-in'}`}
    >
      <span className={`text-sm font-bold ${config.text}`}>{config.icon}</span>
      <span className={`text-sm font-medium ${config.text}`}>{entry.message}</span>
    </div>
  );
}
