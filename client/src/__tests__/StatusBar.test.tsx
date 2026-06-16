import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StatusBar } from '../components/StatusBar';
import type { StatusEntry } from '../types';

describe('StatusBar', () => {
  it('renders success toast', () => {
    const entries: StatusEntry[] = [
      { id: 1, message: '已粘贴到本机', type: 'success' },
    ];

    render(
      <StatusBar
        entries={entries}
        connectionStatus="connected"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('已粘贴到本机')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders error toast', () => {
    const entries: StatusEntry[] = [
      { id: 1, message: '目标设备离线', type: 'error' },
    ];

    render(
      <StatusBar
        entries={entries}
        connectionStatus="connected"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('目标设备离线')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('renders info toast', () => {
    const entries: StatusEntry[] = [
      { id: 1, message: '发送中...', type: 'info' },
    ];

    render(
      <StatusBar
        entries={entries}
        connectionStatus="connected"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('发送中...')).toBeInTheDocument();
  });

  it('shows connected status', () => {
    render(
      <StatusBar
        entries={[]}
        connectionStatus="connected"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('已连接')).toBeInTheDocument();
  });

  it('shows reconnecting status', () => {
    render(
      <StatusBar
        entries={[]}
        connectionStatus="reconnecting"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(/连接断开/)).toBeInTheDocument();
  });

  it('shows connecting status', () => {
    render(
      <StatusBar
        entries={[]}
        connectionStatus="connecting"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('连接中...')).toBeInTheDocument();
  });

  it('auto-dismisses success toast after timeout', () => {
    vi.useFakeTimers();
    const handleDismiss = vi.fn();

    const entries: StatusEntry[] = [
      { id: 1, message: '已粘贴到本机', type: 'success' },
    ];

    render(
      <StatusBar
        entries={entries}
        connectionStatus="connected"
        onDismiss={handleDismiss}
      />,
    );

    // After 3.3s (3000 dismiss + 300 remove) the toast should be dismissed
    act(() => {
      vi.advanceTimersByTime(3300);
    });

    expect(handleDismiss).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });

  it('renders multiple toasts', () => {
    const entries: StatusEntry[] = [
      { id: 1, message: '已粘贴到本机', type: 'success' },
      { id: 2, message: '目标设备离线', type: 'error' },
    ];

    render(
      <StatusBar
        entries={entries}
        connectionStatus="connected"
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('已粘贴到本机')).toBeInTheDocument();
    expect(screen.getByText('目标设备离线')).toBeInTheDocument();
  });
});
