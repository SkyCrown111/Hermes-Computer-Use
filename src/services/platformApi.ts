// Platform API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import type { Platform, PlatformType } from '../types/platform';

export interface PlatformStatusResponse {
  type: PlatformType;
  status: Platform['status'];
  lastConnected?: string;
  error?: string;
}

export const platformApi = {
  // 获取所有平台状态
  async getPlatforms(): Promise<Platform[]> {
    return safeInvoke<Platform[]>('get_platforms');
  },

  // 获取单个平台状态
  async getPlatformStatus(type: PlatformType): Promise<PlatformStatusResponse> {
    return safeInvoke<PlatformStatusResponse>('get_platform_status', { platformType: type });
  },

  // 更新平台配置
  async updatePlatformConfig(type: PlatformType, config: Record<string, unknown>): Promise<void> {
    await safeInvoke('update_platform_config', { platformType: type, config });
  },

  // 启用平台
  async enablePlatform(type: PlatformType): Promise<void> {
    await safeInvoke('enable_platform', { platformType: type });
  },

  // 禁用平台
  async disablePlatform(type: PlatformType): Promise<void> {
    await safeInvoke('disable_platform', { platformType: type });
  },

  // 测试平台连接
  async testConnection(type: PlatformType): Promise<{ ok: boolean; message?: string; details?: string }> {
    return safeInvoke('test_platform_connection', { platformType: type });
  },

  // 重连平台
  async reconnect(type: PlatformType): Promise<void> {
    await safeInvoke('reconnect_platform', { platformType: type });
  },

  // 获取微信二维码
  async getWechatQRCode(): Promise<{ qrcode_url: string; status: string; expires_at: string }> {
    return safeInvoke('get_wechat_qrcode');
  },

  // 检查微信二维码扫描状态
  async checkWechatQRCodeStatus(): Promise<{ status: string }> {
    return safeInvoke('check_wechat_qrcode_status');
  },
};
