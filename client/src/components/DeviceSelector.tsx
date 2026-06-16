import type { DeviceInfo } from '../types';

interface DeviceSelectorProps {
  devices: DeviceInfo[];
  selfId: string | null;
  selectedId: string;
  onChange: (id: string) => void;
  loading?: boolean;
}

/**
 * Device selector dropdown with self-device marking.
 */
export function DeviceSelector({
  devices,
  selfId,
  selectedId,
  onChange,
  loading,
}: DeviceSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="deviceSelect"
        className="block text-xs font-semibold tracking-wide text-apple-gray dark:text-apple-gray-light uppercase"
      >
        目标设备
      </label>
      <div className="relative">
        <select
          id="deviceSelect"
          value={selectedId}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || devices.length === 0}
          className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700
                     bg-white/80 dark:bg-apple-gray-dark/80 backdrop-blur-sm
                     px-4 py-3.5 pr-10 text-sm font-medium
                     text-gray-900 dark:text-white
                     shadow-sm transition-all duration-200
                     focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed
                     cursor-pointer"
        >
          {devices.length === 0 && (
            <option value="">{loading ? '搜索设备中...' : '未发现设备'}</option>
          )}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id === selfId
                ? `📱 ${d.hostname} (${d.ip}) — 本机`
                : `💻 ${d.hostname} (${d.ip})`}
            </option>
          ))}
        </select>
        {/* Chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5">
          <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {loading && (
        <p className="text-xs text-apple-gray dark:text-apple-gray-light animate-pulse-soft">
          正在搜索设备...
        </p>
      )}
    </div>
  );
}
