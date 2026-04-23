// System Status 系统状态类型定义

export interface GatewayStatus {
  status: 'online' | 'offline' | 'degraded';
  uptime_seconds: number;
  version: string;
  connected_platforms: ConnectedPlatform[];
}

export interface ConnectedPlatform {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  last_activity?: string;
}

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
}

export interface SystemStatus {
  gateway: GatewayStatus;
  metrics: SystemMetrics;
  active_sessions: number;
  pending_tasks: number;
}
