// Platform Types - 平台接入类型定义

export type PlatformType = 
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'whatsapp'
  | 'wechat'
  | 'lark'
  | 'api'
  | 'webhook';

export type PlatformStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export interface Platform {
  type: PlatformType;
  name: string;
  description: string;
  status: PlatformStatus;
  icon: string;
  enabled: boolean;
  config?: Record<string, any>;
  lastConnected?: string;
  error?: string;
}

export interface TelegramConfig {
  bot_token: string;
  webhook_url?: string;
}

export interface DiscordConfig {
  bot_token: string;
  application_id: string;
}

export interface SlackConfig {
  bot_token: string;
  app_token: string;
  signing_secret: string;
}

export interface WhatsAppConfig {
  phone_number_id: string;
  access_token: string;
}

export interface WeChatConfig {
  corp_id: string;
  agent_id: string;
  secret: string;
}

export interface LarkConfig {
  app_id: string;
  app_secret: string;
}

export interface ApiConfig {
  port: number;
  host: string;
  api_key?: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  events: string[];
}
