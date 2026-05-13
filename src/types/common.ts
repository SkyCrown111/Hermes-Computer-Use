export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export type Size = 'sm' | 'md' | 'lg' | 'xl';

export type Variant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost';

export type Status = 'idle' | 'loading' | 'success' | 'error';

export interface ApiOkResponse {
  ok: boolean;
}

export interface ApiErrorResponse {
  detail: string;
}

export type ChatType = 'dm' | 'group' | 'channel' | 'thread';

export type SessionStatus = 'active' | 'completed' | 'error';

export type PlatformName =
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'whatsapp'
  | 'weixin'
  | 'wechat'
  | 'feishu'
  | 'lark'
  | 'api_server'
  | 'api'
  | 'webhook'
  | 'cli'
  | 'cron';
