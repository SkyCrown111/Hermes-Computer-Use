// Platform Store - 平台接入状态管理

import { create } from 'zustand';
import type { Platform, PlatformType } from '../types/platform';
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

// 默认平台配置
const defaultPlatforms: Platform[] = [
  {
    type: 'telegram',
    name: 'Telegram',
    description: 'Telegram Bot 接入',
    status: 'disconnected',
    icon: <SmartphoneIcon size={18} />,
    enabled: false,
  },
  {
    type: 'discord',
    name: 'Discord',
    description: 'Discord Bot 接入',
    status: 'disconnected',
    icon: <ChatIcon size={18} />,
    enabled: false,
  },
  {
    type: 'slack',
    name: 'Slack',
    description: 'Slack Bot 接入',
    status: 'disconnected',
    icon: <BriefcaseIcon size={18} />,
    enabled: false,
  },
  {
    type: 'whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp Business API',
    status: 'disconnected',
    icon: <ChatIcon size={18} />,
    enabled: false,
  },
  {
    type: 'weixin',
    name: '微信',
    description: '个人微信扫码接入',
    status: 'disconnected',
    icon: <ChatIcon size={18} />,
    enabled: false,
  },
  {
    type: 'wechat',
    name: '企业微信',
    description: '企业微信 Work 接入',
    status: 'disconnected',
    icon: <BotIcon size={18} />,
    enabled: false,
  },
  {
    type: 'lark',
    name: '飞书',
    description: '飞书机器人接入',
    status: 'disconnected',
    icon: <ZapIcon size={18} />,
    enabled: false,
  },
  {
    type: 'api',
    name: 'API Gateway',
    description: 'REST API 接口',
    status: 'disconnected',
    icon: <PlugIcon size={18} />,
    enabled: false,
  },
  {
    type: 'webhook',
    name: 'Webhook',
    description: '自定义 Webhook 接入',
    status: 'disconnected',
    icon: <GlobeIcon size={18} />,
    enabled: false,
  },
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
  testConnection: (type: PlatformType) => Promise<{ ok: boolean; message?: string; details?: string }>;
  reconnect: (type: PlatformType) => Promise<boolean>;
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
      set({ platforms, isLoading: false });
    } catch (err) {
      // 使用默认数据
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
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 启用平台
  enablePlatform: async (type) => {
    try {
      await platformApi.enablePlatform(type);
      const { platforms } = get();
      const updated = platforms.map(p =>
        p.type === type ? { ...p, enabled: true, status: 'pending' as const } : p
      );
      set({ platforms: updated });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 禁用平台
  disablePlatform: async (type) => {
    try {
      await platformApi.disablePlatform(type);
      const { platforms } = get();
      const updated = platforms.map(p =>
        p.type === type ? { ...p, enabled: false, status: 'disconnected' as const } : p
      );
      set({ platforms: updated });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 测试连接
  testConnection: async (type) => {
    try {
      const result = await platformApi.testConnection(type);
      if (result.ok) {
        const { platforms } = get();
        const updated = platforms.map(p =>
          p.type === type ? { ...p, status: 'connected' as const } : p
        );
        set({ platforms: updated });
      }
      return result;
    } catch (err) {
      return { ok: false, message: (err as Error).message, details: undefined };
    }
  },

  // 重连
  reconnect: async (type) => {
    try {
      await platformApi.reconnect(type);
      const { platforms } = get();
      const updated = platforms.map(p =>
        p.type === type ? { ...p, status: 'pending' as const } : p
      );
      set({ platforms: updated });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },
}));
