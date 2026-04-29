import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import { DEFAULT_PATHS } from './constants';
import type {
  HermesConfig,
  ConfigSection,
  ConfigSectionResponse,
  RawConfigResponse,
  UpdateRawConfigRequest,
  ConfigUpdateResponse,
  ExportConfigData,
} from '../types/config';
import type { ApiOkResponse } from '../types/common';

export async function loadConfig(): Promise<HermesConfig> {
  try {
    return await apiClient.invoke<HermesConfig>('load_config');
  } catch (error) {
    logger.error(`[SettingsApi] loadConfig failed: ${getErrorDetail(error)}`);
    return {};
  }
}

export async function saveConfig(config: HermesConfig): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('save_config', { config });
}

export async function getConfigRaw(): Promise<RawConfigResponse> {
  try {
    return await apiClient.invoke<RawConfigResponse>('get_config_raw');
  } catch (error) {
    logger.error(`[SettingsApi] getConfigRaw failed: ${getErrorDetail(error)}`);
    return { yaml: '' };
  }
}

export async function updateConfigRaw(request: UpdateRawConfigRequest): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('update_config_raw', { yaml_text: request.yaml_text });
}

export async function getConfigSection<T = unknown>(section: ConfigSection): Promise<ConfigSectionResponse<T>> {
  try {
    return await apiClient.invoke<ConfigSectionResponse<T>>('get_config_section', { section });
  } catch (error) {
    logger.error(`[SettingsApi] getConfigSection failed: ${getErrorDetail(error)}`);
    return { section, data: {} as T };
  }
}

export async function updateConfigSection<T = unknown>(
  section: ConfigSection,
  data: Record<string, unknown>
): Promise<ConfigUpdateResponse<T>> {
  return apiClient.invoke<ConfigUpdateResponse<T>>('update_config_section', { section, data });
}

export async function exportConfig(): Promise<ExportConfigData> {
  try {
    return await apiClient.invoke<ExportConfigData>('export_config');
  } catch (error) {
    logger.error(`[SettingsApi] exportConfig failed: ${getErrorDetail(error)}`);
    const now = new Date().toISOString();
    return {
      model: { default: '', provider: '' },
      agent: {},
      terminal: {},
      compression: {},
      checkpoint: {},
      exported_at: now,
      version: '0.1.0',
    };
  }
}

export async function getDataDir(): Promise<string> {
  try {
    return await apiClient.invoke<string>('get_data_dir');
  } catch (error) {
    logger.debug('[Settings] getDataDir failed, using default:', getErrorDetail(error));
    return DEFAULT_PATHS.dataDir;
  }
}

export async function checkDataDirExists(): Promise<boolean> {
  try {
    return await apiClient.invoke<boolean>('check_data_dir_exists');
  } catch (error) {
    logger.debug('[Settings] checkDataDirExists failed:', getErrorDetail(error));
    return false;
  }
}

export async function reloadGatewayConfig(): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('reload_gateway_config');
}

export async function restartGateway(): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('restart_hermes_gateway');
}
