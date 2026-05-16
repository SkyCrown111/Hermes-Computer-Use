// Platform Store - 平台接入状态管理

import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { Platform, PlatformConnectionCheckResult, PlatformType } from '../types/platform';
import { getErrorMessage } from '../lib/errorUtils';
import { platformApi } from '../services/platformApi';
import {
  SmartphoneIcon,
  ChatIcon,
  BriefcaseIcon,
  PlugIcon,
  GlobeIcon,
  BotIcon,
  ZapIcon,
} from '../components/ui/Icons';

const PLATFORM_TYPE_ALIASES: Partial<Record<PlatformType, PlatformType>> = {
  feishu: 'lark',
  api_server: 'api',
};

function toCanonicalPlatformType(type: PlatformType): PlatformType {
  return PLATFORM_TYPE_ALIASES[type] ?? type;
}

function normalizePlatform(platform: Platform): Platform {
  return {
    ...platform,
    type: toCanonicalPlatformType(platform.type),
  };
}

function dedupePlatforms(platforms: Platform[]): Platform[] {
  const deduped = new Map<PlatformType, Platform>();

  for (const platform of platforms.map(normalizePlatform)) {
    const existing = deduped.get(platform.type);
    if (!existing) {
      deduped.set(platform.type, platform);
      continue;
    }

    deduped.set(platform.type, {
      ...existing,
      ...platform,
      config: { ...(existing.config ?? {}), ...(platform.config ?? {}) },
      enabled: existing.enabled || platform.enabled,
      error: platform.error ?? existing.error,
      lastConnected: platform.lastConnected ?? existing.lastConnected,
    });
  }

  return Array.from(deduped.values());
}

// 默认平台配置（纯数据，不含 UI 元素）
const defaultPlatforms: Platform[] = [
  { type: 'telegram', name: 'Telegram', description: 'Telegram Bot', status: 'disconnected', enabled: false },
  { type: 'discord', name: 'Discord', description: 'Discord Bot', status: 'disconnected', enabled: false },
  { type: 'slack', name: 'Slack', description: 'Slack Bot', status: 'disconnected', enabled: false },
  { type: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp Business API', status: 'disconnected', enabled: false },
  { type: 'weixin', name: '微信', description: 'WeChat Personal', status: 'disconnected', enabled: false },
  { type: 'wechat', name: '企业微信', description: 'WeChat Work', status: 'disconnected', enabled: false },
  { type: 'lark', name: '飞书', description: 'Lark Bot', status: 'disconnected', enabled: false },
  { type: 'qqbot', name: 'QQ Bot', description: 'QQ 频道机器人', status: 'disconnected', enabled: false },
  { type: 'api', name: 'API Gateway', description: 'REST API', status: 'disconnected', enabled: false },
  { type: 'webhook', name: 'Webhook', description: 'Custom Webhook', status: 'disconnected', enabled: false },
];

interface PlatformState {
  platforms: Platform[];
  isLoading: boolean;
  selectedPlatform: PlatformType | null;
  isConfigModalOpen: boolean;
  error: string | null;

  // Actions
  fetchPlatforms: () => Promise<void>;
  selectPlatform: (type: PlatformType | null) => void;
  openConfigModal: (type: PlatformType) => void;
  closeConfigModal: () => void;
  updateConfig: (type: PlatformType, config: Record<string, unknown>) => Promise<boolean>;
  enablePlatform: (type: PlatformType) => Promise<boolean>;
  disablePlatform: (type: PlatformType) => Promise<boolean>;
  testConnection: (type: PlatformType) => Promise<PlatformConnectionCheckResult>;
  reconnect: (type: PlatformType) => Promise<boolean>;
}

function replacePlatform(platforms: Platform[], type: PlatformType, updates: Partial<Platform>): Platform[] {
  return platforms.map((platform) =>
    platform.type === type ? { ...platform, ...updates } : platform
  );
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  platforms: defaultPlatforms,
  isLoading: false,
  selectedPlatform: null,
  isConfigModalOpen: false,
  error: null,

  // 获取平台列表
  fetchPlatforms: async () => {
    set({ isLoading: true, error: null });
    try {
      const platforms = await platformApi.getPlatforms();
      set({
        platforms: Array.isArray(platforms) && platforms.length > 0 ? dedupePlatforms(platforms) : get().platforms,
        isLoading: false,
      });
    } catch {
      set({ platforms: defaultPlatforms, isLoading: false });
    }
  },

  // 选择平台
  selectPlatform: (type) => {
    set({ selectedPlatform: type });
  },

  // 打开配置弹窗
  openConfigModal: (type) => {
    set({ selectedPlatform: type, isConfigModalOpen: true });
  },

  // 关闭配置弹窗
  closeConfigModal: () => {
    set({ isConfigModalOpen: false });
  },

  // 更新配置
  updateConfig: async (type, config) => {
    try {
      await platformApi.updatePlatformConfig(type, config);
      const { platforms } = get();
      const updated = platforms.map(p =>
        p.type === type ? { ...p, config } : p
      );
      set({ platforms: updated });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // 启用平台
  enablePlatform: async (type) => {
    try {
      const { platforms } = get();
      const updated = replacePlatform(platforms, type, { enabled: true, status: 'pending' });
      set({ platforms: updated });

      await platformApi.enablePlatform(type);
      await get().fetchPlatforms();

      const refreshed = get().platforms;
      if (!refreshed.some((platform) => platform.type === type && platform.enabled)) {
        set({ platforms: updated });
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      const { platforms } = get();
      const reverted = replacePlatform(platforms, type, { enabled: false, status: 'disconnected' });
      set({ platforms: reverted });
      return false;
    }
  },

  // 禁用平台
  disablePlatform: async (type) => {
    try {
      const { platforms } = get();
      const updated = replacePlatform(platforms, type, { enabled: false, status: 'disconnected', error: undefined });
      set({ platforms: updated });

      await platformApi.disablePlatform(type);
      await get().fetchPlatforms();

      const refreshed = get().platforms;
      if (!refreshed.some((platform) => platform.type === type && platform.enabled === false)) {
        set({ platforms: updated });
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // 测试连接
  testConnection: async (type) => {
    try {
      const result = await platformApi.testConnection(type);
      if (result.ok) {
        const { platforms } = get();
        const updated = replacePlatform(platforms, type, {
          status: result.status ?? 'connected',
          enabled: true,
          error: undefined,
        });
        set({ platforms: updated });
        await get().fetchPlatforms();
        const refreshed = get().platforms;
        if (!refreshed.some((platform) => platform.type === type && platform.status === 'connected')) {
          set({ platforms: updated });
        }
      } else if (result.status) {
        const { platforms } = get();
        set({
          platforms: replacePlatform(platforms, type, {
            status: result.status,
            error: result.details ?? result.message,
          }),
        });
      }
      return result;
    } catch (err) {
      return { ok: false, message: getErrorMessage(err), details: undefined };
    }
  },

  // 重连
  reconnect: async (type) => {
    try {
      const { platforms } = get();
      const updated = replacePlatform(platforms, type, { enabled: true, status: 'pending', error: undefined });
      set({ platforms: updated });

      await platformApi.reconnect(type);
      await get().fetchPlatforms();

      const refreshed = get().platforms;
      if (!refreshed.some((platform) => platform.type === type && platform.status !== 'error')) {
        set({ platforms: updated });
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      const { platforms } = get();
      const reverted = replacePlatform(platforms, type, { status: 'error' });
      set({ platforms: reverted });
      return false;
    }
  },
}));

const PLATFORM_ICON_MAP: Partial<Record<PlatformType, ReactNode>> = {
  telegram: <SmartphoneIcon size={18} />,
  discord: <ChatIcon size={18} />,
  slack: <BriefcaseIcon size={18} />,
  whatsapp: <ChatIcon size={18} />,
  weixin: <ChatIcon size={18} />,
  wechat: <BotIcon size={18} />,
  qqbot: <BotIcon size={18} />,
  lark: <ZapIcon size={18} />,
  api: <PlugIcon size={18} />,
  webhook: <GlobeIcon size={18} />,
};

export function getPlatformIcon(type: PlatformType): ReactNode {
  return PLATFORM_ICON_MAP[toCanonicalPlatformType(type)] ?? <PlugIcon size={18} />;
}
