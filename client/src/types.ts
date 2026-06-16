/** Device info returned by GET /devices */
export interface DeviceInfo {
  id: string;
  hostname: string;
  ip: string;
  port: number;
  lastSeen: number;
}

/** Response from GET /devices */
export interface DevicesResponse {
  selfId: string;
  devices: DeviceInfo[];
}

/** Base WebSocket message from server */
export interface WSMessage {
  type: 'success' | 'error';
  message: string;
}

/** Outgoing WebSocket message (client → server) */
export interface WSOutgoing {
  targetId: string;
  text: string;
}

/** Connection status */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

/** Status bar entry */
export interface StatusEntry {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  exiting?: boolean;
}
