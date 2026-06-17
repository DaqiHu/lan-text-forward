import { useState, useEffect, useCallback, useRef } from 'react';
import { useDevices } from './hooks/useDevices';
import { useWebSocket } from './hooks/useWebSocket';
import { DeviceSelector } from './components/DeviceSelector';
import { TextInput } from './components/TextInput';
import { StatusBar } from './components/StatusBar';
import type { StatusEntry } from './types';

const RATE_LIMIT_MS = 500;

export default function App() {
  const { devices, selfId, loading: devicesLoading } = useDevices();
  const { status: connectionStatus, send, lastResponse, clearResponse } = useWebSocket();

  const [selectedId, setSelectedId] = useState('');
  const [text, setText] = useState('');
  const [statusEntries, setStatusEntries] = useState<StatusEntry[]>([]);
  const lastSentRef = useRef(0);
  const idCounterRef = useRef(0);

  // Auto-select first non-self device on update, or self if only device
  useEffect(() => {
    if (devices.length > 0 && !selectedId) {
      const nonSelf = devices.find((d) => d.id !== selfId);
      setSelectedId(nonSelf?.id ?? devices[0].id);
    }
  }, [devices, selfId, selectedId]);

  // Handle incoming WS responses
  useEffect(() => {
    if (lastResponse) {
      addStatus(lastResponse.type, lastResponse.message);
      if (lastResponse.type === 'success') {
        setText('');
      }
      clearResponse();
    }
  }, [lastResponse, clearResponse]);

  const addStatus = useCallback((type: StatusEntry['type'], message: string) => {
    const id = ++idCounterRef.current;
    setStatusEntries((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const dismissStatus = useCallback((id: number) => {
    setStatusEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleSend = useCallback(() => {
    if (!text.trim()) {
      addStatus('error', '请输入文字');
      return;
    }

    if (connectionStatus !== 'connected') {
      addStatus('error', '未连接到服务端');
      return;
    }

    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      addStatus('error', '操作太频繁，请稍候');
      return;
    }
    lastSentRef.current = now;

    send(JSON.stringify({ targetId: selectedId, text: text.trim() }));
    addStatus('info', '发送中...');
  }, [text, selectedId, connectionStatus, send, addStatus]);

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-apple-gray-bg to-white
                    dark:from-black dark:to-apple-gray-dark
                    transition-colors duration-300">
      {/* Header */}
      <header className="flex-shrink-0 px-5 pt-safe pt-6 pb-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          📋 Lan Paste
        </h1>
        <p className="mt-1 text-sm text-apple-gray dark:text-apple-gray-light">
          手机打字，瞬间出现在电脑光标处
        </p>
      </header>

      {/* Main card */}
      <main className="flex-1 flex flex-col px-4 pb-2 min-h-0">
        <div className="flex-1 flex flex-col bg-white/70 dark:bg-apple-gray-dark/70 backdrop-blur-xl
                        rounded-3xl border border-gray-100/80 dark:border-gray-800/80
                        shadow-lg shadow-black/5 dark:shadow-black/20
                        p-5 space-y-4 min-h-0
                        animate-slide-up">

          {/* Device selection */}
          <section className="flex-shrink-0">
            <DeviceSelector
              devices={devices}
              selfId={selfId}
              selectedId={selectedId}
              onChange={setSelectedId}
              loading={devicesLoading}
            />
          </section>

          {/* Text input (flex-grow) */}
          <section className="flex-1 flex flex-col min-h-0">
            <TextInput
              value={text}
              onChange={setText}
              onSend={handleSend}
              disabled={connectionStatus !== 'connected'}
            />
          </section>

          {/* Send button */}
          <section className="flex-shrink-0">
            <button
              onClick={handleSend}
              disabled={connectionStatus !== 'connected' || !text.trim()}
              className="w-full py-3.5 px-6 rounded-2xl text-base font-semibold
                         bg-apple-blue hover:bg-blue-600 active:bg-blue-700
                         text-white shadow-md shadow-apple-blue/25
                         transition-all duration-200
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                         focus:outline-none focus:ring-2 focus:ring-apple-blue/40
                         active:scale-[0.98]"
            >
              {connectionStatus === 'connected'
                ? '发送到光标位置'
                : '等待连接...'}
            </button>
            <p className="mt-1.5 text-xs text-center text-apple-gray dark:text-apple-gray-light">
              Enter 发送 · Ctrl+Enter 换行
            </p>
          </section>
        </div>
      </main>

      {/* Status bar */}
      <footer className="flex-shrink-0 px-4 pb-safe pb-5 pt-1">
        <StatusBar
          entries={statusEntries}
          connectionStatus={connectionStatus}
          onDismiss={dismissStatus}
        />
      </footer>
    </div>
  );
}
