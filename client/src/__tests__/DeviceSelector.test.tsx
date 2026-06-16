import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeviceSelector } from '../components/DeviceSelector';
import type { DeviceInfo } from '../types';

const mockDevices: DeviceInfo[] = [
  { id: 'self-1', hostname: 'MyPC', ip: '192.168.1.10', port: 18765, lastSeen: Date.now() },
  { id: 'other-1', hostname: 'Phone', ip: '192.168.1.20', port: 18765, lastSeen: Date.now() },
  { id: 'other-2', hostname: 'Laptop', ip: '192.168.1.30', port: 18765, lastSeen: Date.now() },
];

describe('DeviceSelector', () => {
  it('renders all devices with hostname and IP', () => {
    render(
      <DeviceSelector
        devices={mockDevices}
        selfId="self-1"
        selectedId="other-1"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/MyPC/)).toBeInTheDocument();
    expect(screen.getByText(/Phone/)).toBeInTheDocument();
    expect(screen.getByText(/Laptop/)).toBeInTheDocument();
    expect(screen.getByText(/192\.168\.1\.10/)).toBeInTheDocument();
  });

  it('marks self-device with 本机 label', () => {
    render(
      <DeviceSelector
        devices={mockDevices}
        selfId="self-1"
        selectedId="other-1"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/本机/)).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const handleChange = vi.fn();
    render(
      <DeviceSelector
        devices={mockDevices}
        selfId="self-1"
        selectedId="self-1"
        onChange={handleChange}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'other-2' } });
    expect(handleChange).toHaveBeenCalledWith('other-2');
  });

  it('shows loading state', () => {
    render(
      <DeviceSelector
        devices={[]}
        selfId={null}
        selectedId=""
        onChange={() => {}}
        loading={true}
      />,
    );

    expect(screen.getByText(/搜索设备中/)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('shows empty state when no devices and not loading', () => {
    render(
      <DeviceSelector
        devices={[]}
        selfId={null}
        selectedId=""
        onChange={() => {}}
        loading={false}
      />,
    );

    expect(screen.getByText(/未发现设备/)).toBeInTheDocument();
  });
});
