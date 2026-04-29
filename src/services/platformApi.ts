import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { Platform, PlatformType } from '../types/platform';

export interface PlatformStatusResponse {
  type: PlatformType;
  status: Platform['status'];
  lastConnected?: string;
  error?: string;
}

export interface PlatformChat {
  chat_id: string;
  chat_type: string;
  name: string;
  platform: string;
  unread_count?: number;
  last_message?: string;
  last_message_time?: string;
}

export interface PlatformSendMessageResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface PlatformMessage {
  message_id: string;
  chat_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  reply_to?: string;
}

export const platformApi = {
  getPlatforms: async (): Promise<Platform[]> => {
    try {
      return await apiClient.invoke<Platform[]>('get_platforms');
    } catch (error) {
      logger.error('[PlatformApi] getPlatforms failed:', getErrorDetail(error));
      return [];
    }
  },

  getPlatformStatus: async (type: PlatformType): Promise<PlatformStatusResponse> => {
    try {
      return await apiClient.invoke<PlatformStatusResponse>('get_platform_status', { platform_type: type });
    } catch (error) {
      logger.error('[PlatformApi] getPlatformStatus failed:', getErrorDetail(error));
      return { type, status: 'disconnected', error: getErrorDetail(error) };
    }
  },

  updatePlatformConfig: async (type: PlatformType, config: Record<string, unknown>): Promise<void> => {
    await apiClient.invoke('update_platform_config', { platform_type: type, config });
  },

  enablePlatform: async (type: PlatformType): Promise<void> => {
    await apiClient.invoke('enable_platform', { platform_type: type });
  },

  disablePlatform: async (type: PlatformType): Promise<void> => {
    await apiClient.invoke('disable_platform', { platform_type: type });
  },

  testConnection: async (type: PlatformType): Promise<{ ok: boolean; message?: string; details?: string }> => {
    return apiClient.invoke('test_platform_connection', { platform_type: type });
  },

  reconnect: async (type: PlatformType): Promise<void> => {
    await apiClient.invoke('reconnect_platform', { platform_type: type });
  },

  getWechatQRCode: async (): Promise<{ qrcode_url: string; status: string; expires_at: string }> => {
    return apiClient.invoke('get_wechat_qrcode');
  },

  checkWechatQRCodeStatus: async (): Promise<{ status: string }> => {
    return apiClient.invoke('check_wechat_qrcode_status');
  },

  // New API methods for platform messaging
  getPlatformChats: async (platformType: PlatformType, limit?: number): Promise<PlatformChat[]> => {
    try {
      return await apiClient.invoke('get_platform_chats', { platform_type: platformType, limit });
    } catch (error) {
      logger.error('[PlatformApi] getPlatformChats failed:', getErrorDetail(error));
      return [];
    }
  },

  sendPlatformMessage: async (platformType: PlatformType, chatId: string, message: string): Promise<PlatformSendMessageResult> => {
    try {
      return await apiClient.invoke('send_platform_message', {
        platform_type: platformType,
        chat_id: chatId,
        message
      });
    } catch (error) {
      logger.error('[PlatformApi] sendPlatformMessage failed:', getErrorDetail(error));
      return { success: false, error: getErrorDetail(error) };
    }
  },

  getPlatformMessages: async (platformType: PlatformType, chatId: string, limit?: number, beforeId?: string): Promise<PlatformMessage[]> => {
    try {
      return await apiClient.invoke('get_platform_messages', {
        platform_type: platformType,
        chat_id: chatId,
        limit,
        before_id: beforeId
      });
    } catch (error) {
      logger.error('[PlatformApi] getPlatformMessages failed:', getErrorDetail(error));
      return [];
    }
  },

  markPlatformChatRead: async (platformType: PlatformType, chatId: string): Promise<void> => {
    try {
      await apiClient.invoke('mark_platform_chat_read', { platform_type: platformType, chat_id: chatId });
    } catch (error) {
      logger.error('[PlatformApi] markPlatformChatRead failed:', getErrorDetail(error));
    }
  },
};
