import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { Platform, PlatformType } from '../types/platform';

export interface PlatformStatusResponse {
  type: PlatformType;
  status: Platform['status'];
  lastConnected?: string;
  error?: string;
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
    return apiClient.invoke<PlatformStatusResponse>('get_platform_status', { platform_type: type });
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
};
