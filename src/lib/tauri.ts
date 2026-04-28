import { invoke } from '@tauri-apps/api/core';
import { logger } from './logger';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: Record<string, unknown>;
    __TAURI__?: Record<string, unknown>;
  }
}

export const isTauri = (): boolean => {
  if (typeof window !== 'undefined') {
    if (window.__TAURI_INTERNALS__) return true;
    if (window.__TAURI__) return true;
  }
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')) {
    return true;
  }
  return false;
};

export class HermesApiError extends Error {
  public code: string;
  public detail: string;

  constructor(code: string, detail: string) {
    super(detail);
    this.name = 'HermesApiError';
    this.code = code;
    this.detail = detail;
  }

  toJSON(): { detail: string } {
    return { detail: this.detail };
  }
}

function classifyErrorCode(err: unknown): string {
  if (err instanceof HermesApiError) return err.code;
  const message = err instanceof Error ? err.message : String(err ?? '');
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('fetch')) return 'network';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('not found') || msg.includes('404')) return 'not_found';
  if (msg.includes('permission') || msg.includes('denied') || msg.includes('forbidden')) return 'permission';
  if (msg.includes('validation') || msg.includes('invalid')) return 'validation';
  return 'unknown';
}

export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const inTauri = isTauri();
  logger.debug(`[Tauri] isTauri() = ${inTauri}, command: ${cmd}`);

  if (inTauri || typeof window !== 'undefined') {
    try {
      const result = await invoke<T>(cmd, args);
      logger.debug(`[Tauri] Command ${cmd} succeeded`);
      return result;
    } catch (error) {
      const code = classifyErrorCode(error);
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`[Tauri] Command ${cmd} failed: ${detail}`);
      if (inTauri) {
        throw new HermesApiError(code, detail);
      }
      logger.warn(`[Tauri] Falling back to mock data for: ${cmd}`);
      return getMockData(cmd, args) as T;
    }
  }

  logger.warn(`[Tauri] Not in Tauri environment, returning mock data for: ${cmd}`);
  return getMockData(cmd, args) as T;
}

let mockQRCodeCreatedAt = Date.now();

function getMockData(cmd: string, args?: Record<string, unknown>): unknown {
  switch (cmd) {
    case 'list_sessions':
      return {
        sessions: [
          {
            id: '20260420_123015_abc123',
            platform: 'cli',
            chat_id: '',
            chat_name: 'Recent CLI Session',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            message_count: 10,
            model: 'astron-code-latest',
            input_tokens: 50000,
            output_tokens: 2000,
            estimated_cost_usd: 0.05,
            status: 'completed',
          },
          {
            id: 'cron_255c5e8adde',
            platform: 'cron',
            chat_id: '',
            chat_name: 'Scheduled Task',
            started_at: new Date(Date.now() - 3600000).toISOString(),
            last_activity_at: new Date(Date.now() - 3600000).toISOString(),
            message_count: 1,
            model: 'astron-code-latest',
            input_tokens: 15000,
            output_tokens: 500,
            estimated_cost_usd: 0.01,
            status: 'completed',
          },
        ],
        total: 2,
        limit: 100,
        offset: 0,
      };
    case 'get_session':
      return {
        session: {
          id: 'mock-session',
          platform: 'cli',
          chat_id: '',
          chat_name: 'Mock Session',
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          message_count: 0,
          model: 'unknown',
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost_usd: 0,
          status: 'completed',
        },
        messages: [],
      };
    case 'list_skills':
      return [
        { name: 'plan', path: 'software-development/plan', description: 'Plan mode for Hermes', enabled: true, category: 'software-development', version: '1.0.0', author: 'Hermes Agent', tags: ['planning', 'plan-mode'] },
        { name: 'code_review', path: 'coding/code_review', description: 'Code review skill', enabled: true, category: 'coding', version: '1.0.0', author: 'system', tags: ['code'] },
      ];
    case 'get_skill_categories':
      return [
        { name: 'software-development', description: 'Software development workflows', skill_count: 8 },
        { name: 'coding', description: 'Coding skills', skill_count: 1 },
      ];
    case 'get_toolsets':
      return [
        { name: 'default', label: 'Default', description: 'Standard toolset for most tasks', enabled: true, available: true, configured: true, tools: ['read_file', 'write_file', 'patch', 'search_files', 'terminal', 'process'] },
      ];
    case 'list_cron_jobs':
      return [];
    case 'load_config':
      return { global_state: null, agent_mode: 'auto' };
    case 'get_config_raw':
      return { yaml: 'model:\n  default: "astron-code-latest"\n  provider: "auto"\n' };
    case 'get_config_section':
      return { section: args?.section || 'model', data: { default: 'astron-code-latest', provider: 'auto' } };
    case 'get_data_dir':
      return '~/.hermes';
    case 'check_data_dir_exists':
      return true;
    case 'get_system_status':
      return {
        gateway: { status: 'offline', uptime_seconds: 0, version: '0.1.0', connected_platforms: [] },
        metrics: { cpu_percent: 25.5, memory_percent: 45.2, memory_used_mb: 512, memory_total_mb: 1024, disk_percent: 30 },
        active_sessions: 0,
        pending_tasks: 0,
      };
    case 'get_usage_analytics':
      return {
        period_days: 7,
        totals: { total_sessions: 168, total_input: 47595106, total_output: 1150554, total_cache_read: 44084378, total_reasoning: 0, total_estimated_cost: 0, total_actual_cost: 0 },
        daily: [
          { day: '2026-04-19', sessions: 47, input_tokens: 15093738, output_tokens: 424900, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
        ],
        by_model: [{ model: 'astron-code-latest', sessions: 167, input_tokens: 47595106, output_tokens: 1150554, estimated_cost: 0 }],
      };
    case 'get_memories':
      return {
        memory: { file: 'MEMORY.md', content: '', char_count: 0, char_limit: 100000, sections: [] },
        user_profile: { file: 'USER.md', content: '', char_count: 0, char_limit: 100000, sections: [] },
      };
    case 'health_check':
      return { status: 'ok' };
    case 'get_cron_job':
      return { id: 'cron_001', name: 'Daily Backup', schedule: { kind: 'cron', display: '0 2 * * *', expr: '0 2 * * *' }, enabled: true, created_at: new Date().toISOString(), run_count: 0 };
    case 'save_cron_job':
    case 'delete_cron_job':
    case 'toggle_cron_job':
    case 'trigger_cron_job':
    case 'pause_cron_job':
    case 'resume_cron_job':
    case 'save_config':
    case 'update_config_section':
    case 'update_config_raw':
      return { ok: true };
    case 'get_cron_path':
      return '~/.hermes/cron';
    case 'get_cron_outputs':
      return { job_id: args?.job_id, outputs: [] };
    case 'list_directory':
      return {
        path: '/home/user',
        files: [
          { name: 'Documents', path: '/home/user/Documents', type: 'directory', size: 0, modified: new Date().toISOString(), created: new Date().toISOString(), is_hidden: false },
          { name: 'readme.txt', path: '/home/user/readme.txt', type: 'file', size: 1024, modified: new Date().toISOString(), created: new Date().toISOString(), is_hidden: false, extension: '.txt' },
        ],
        total_files: 1,
        total_directories: 1,
      };
    case 'read_file':
      return { path: '/home/user/readme.txt', content: '# Welcome to Hermes\n', encoding: 'utf-8', size: 22, lines: 1 };
    case 'create_directory':
    case 'write_file':
    case 'delete_file':
    case 'move_file':
    case 'copy_file':
      return { success: true, message: 'Operation completed' };
    case 'file_exists':
      return { exists: true, type: 'file' };
    case 'get_logs':
      return { file: 'agent', lines: [`[${new Date().toISOString()}] INFO: Application started`] };
    case 'get_log_components':
      return ['gateway', 'chat', 'cron', 'platform', 'skill'];
    case 'clear_logs':
    case 'reload_gateway_config':
      return { ok: true };
    case 'get_log_stats':
      return { total_lines: 0, by_level: { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 }, by_component: [], error_rate: 0 };
    case 'get_gateway_status':
      return {
        status: 'offline', uptime_seconds: 0, version: 'unknown', connections: [],
        total_messages: 0, messages_per_minute: 0, active_requests: 0, queue_depth: 0,
        avg_response_time_ms: 0, memory_usage_mb: 0, cpu_usage_percent: 0,
        error_stats: { total_errors: 0, by_type: {}, last_hour: 0, last_24h: 0 },
        connection_history: [], throughput: { requests_per_second: 0, bytes_per_second: 0, peak_requests_per_second: 0, peak_bytes_per_second: 0 },
      };
    case 'get_performance_metrics':
      return { cpu: [], memory: [], network_in: [], network_out: [] };
    case 'get_platforms':
      return [
        { type: 'telegram', name: 'Telegram', description: 'Telegram Bot 接入', status: 'connected', enabled: true, config: {} },
        { type: 'discord', name: 'Discord', description: 'Discord Bot 接入', status: 'disconnected', enabled: false, config: {} },
        { type: 'weixin', name: '微信', description: '个人微信扫码接入', status: 'disconnected', enabled: false, config: {} },
      ];
    case 'get_platform_status':
      return { type: args?.platform_type, status: 'connected', lastConnected: new Date().toISOString() };
    case 'update_platform_config':
    case 'enable_platform':
    case 'disable_platform':
    case 'test_platform_connection':
    case 'reconnect_platform':
      return { ok: true };
    case 'get_wechat_qrcode':
      mockQRCodeCreatedAt = Date.now();
      return { qrcode_url: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=wechat_auth_mock_${Date.now()}`, status: 'pending', expires_at: new Date(Date.now() + 120000).toISOString() };
    case 'check_wechat_qrcode_status':
      return { status: Date.now() - mockQRCodeCreatedAt > 12000 ? 'scanned' : 'pending' };
    case 'get_skill_detail':
      return {
        name: 'plan', category: 'software-development', path: 'software-development/plan',
        content: '# Plan Mode\n\nPlan mode for Hermes...', enabled: true,
        metadata: { name: 'plan', description: 'Plan mode for Hermes', version: '1.0.0', author: 'Hermes Agent' },
      };
    case 'toggle_skill':
      return { ok: true, name: args?.name, enabled: args?.enabled };
    case 'save_skill':
    case 'create_skill':
    case 'delete_skill':
      return { ok: true };
    case 'get_skills_path':
      return '~/.hermes/skills';
    case 'search_sessions':
      return { results: [], total: 0 };
    case 'delete_session':
    case 'update_session_title':
    case 'export_session':
      return { ok: true };
    case 'get_sessions_path':
      return '~/.hermes/sessions';
    case 'save_memory':
      return { ok: true, char_count: 0, char_limit: 100000 };
    case 'get_memories_path':
      return '~/.hermes/memories';
    case 'list_mcp_servers':
      return [];
    case 'get_mcp_server':
      return {};
    case 'add_mcp_server':
    case 'remove_mcp_server':
    case 'start_mcp_server':
    case 'stop_mcp_server':
    case 'update_mcp_server':
      return { ok: true };
    case 'test_mcp_connection':
      return { success: false, message: 'Mock: not connected' };
    case 'get_mcp_tools':
    case 'get_mcp_resources':
    case 'get_mcp_logs':
      return [];
    case 'get_mcp_stats':
      return { total_servers: 0, connected: 0, disconnected: 0, error: 0, total_tools: 0, total_resources: 0, total_requests: 0, total_errors: 0 };
    case 'get_file_tree':
      return { name: 'root', path: '/', type: 'directory', children: [] };
    case 'read_file_binary':
      return { path: args?.path, content: '', size: 0, mime_type: 'application/octet-stream' };
    case 'write_file_binary':
      return { success: true, message: 'File written' };
    case 'list_checkpoints':
      return { checkpoints: [], total: 0 };
    case 'create_checkpoint':
    case 'get_checkpoint_info':
    case 'restore_checkpoint':
    case 'delete_checkpoint':
      return { ok: true };
    default:
      logger.warn(`[Tauri] No mock data for command: ${cmd}`);
      return null;
  }
}

export { invoke };
