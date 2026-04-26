// Tauri Invoke Wrapper
// Use Tauri commands instead of HTTP API

import { invoke } from '@tauri-apps/api/core';
import { logger } from './logger';

// Check if running in Tauri environment
export const isTauri = () => {
  // Check for Tauri 2.0 internals
  if (typeof window !== 'undefined') {
    // @ts-ignore - Tauri 2.0 internal check
    if (window.__TAURI_INTERNALS__) return true;
    // @ts-ignore - Tauri 1.x check
    if (window.__TAURI__) return true;
  }
  // Check user agent for Tauri webview
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')) {
    return true;
  }
  return false;
};

// Safe invoke that works in both Tauri and browser (mock data fallback)
export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const inTauri = isTauri();
  logger.debug(`[Tauri] isTauri() = ${inTauri}, command: ${cmd}`);

  // Always try to invoke if we might be in Tauri
  if (inTauri || typeof window !== 'undefined') {
    try {
      const result = await invoke<T>(cmd, args);
      logger.debug(`[Tauri] Command ${cmd} succeeded:`, result);
      return result;
    } catch (error) {
      // If invoke fails, we might be in browser dev mode
      logger.warn(`[Tauri] Command ${cmd} failed, falling back to mock:`, error);
      return getMockData(cmd) as T;
    }
  }

  // Fallback mock data for pure browser environment
  logger.warn(`[Tauri] Not in Tauri environment, returning mock data for: ${cmd}`);
  return getMockData(cmd) as T;
}

// Mock data for browser development
let mockQRCodeCreatedAt = Date.now();
function getMockData(cmd: string): unknown {
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
          {
            id: '20260419_weixin_xyz',
            platform: 'weixin',
            chat_id: 'user_123',
            chat_name: 'WeChat Conversation',
            started_at: new Date(Date.now() - 86400000).toISOString(),
            last_activity_at: new Date(Date.now() - 86400000).toISOString(),
            message_count: 5,
            model: 'astron-code-latest',
            input_tokens: 8000,
            output_tokens: 300,
            estimated_cost_usd: 0.008,
            status: 'completed',
          },
        ],
        total: 3,
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
        { name: 'code_review', path: 'skills/code_review.md', description: 'Code review skill', enabled: true, category: 'development', version: '1.0.0', author: 'system', tags: ['code'] },
        { name: 'summarize', path: 'skills/summarize.md', description: 'Summarize text', enabled: true, category: 'general', version: '1.0.0', author: 'system', tags: ['text'] },
      ];
    case 'get_skill_categories':
      return [
        { name: 'development', skill_count: 1 },
        { name: 'general', skill_count: 1 },
      ];
    case 'list_cron_jobs':
      return [];
    case 'load_config':
      return { global_state: null, agent_mode: 'auto' };
    case 'get_data_dir':
      return '~/.hermes';
    case 'check_data_dir_exists':
      return true;
    case 'get_system_status':
      return {
        gateway: {
          status: 'offline',
          version: '0.1.0',
          connected_platforms: [],
        },
        metrics: {
          cpu_percent: 25.5,
          memory_percent: 45.2,
          memory_used_mb: 512,
          memory_total_mb: 1024,
        },
        active_sessions: 0,
        pending_tasks: 0,
      };
    case 'get_usage_analytics':
      return {
        period_days: 7,
        totals: {
          total_sessions: 168,
          total_input: 47595106,
          total_output: 1150554,
          total_cache_read: 44084378,
          total_reasoning: 0,
          total_estimated_cost: 0,
          total_actual_cost: 0,
        },
        daily: [
          { day: '2026-04-15', sessions: 48, input_tokens: 9914226, output_tokens: 96160, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
          { day: '2026-04-16', sessions: 25, input_tokens: 10329538, output_tokens: 282243, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
          { day: '2026-04-17', sessions: 17, input_tokens: 5533320, output_tokens: 116818, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
          { day: '2026-04-18', sessions: 16, input_tokens: 5093311, output_tokens: 202140, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
          { day: '2026-04-19', sessions: 47, input_tokens: 15093738, output_tokens: 424900, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
          { day: '2026-04-20', sessions: 15, input_tokens: 1630973, output_tokens: 28293, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
        ],
        by_model: [
          { model: 'astron-code-latest', sessions: 167, input_tokens: 47595106, output_tokens: 1150554, estimated_cost: 0 },
        ],
      };
    case 'get_memories':
      return {
        memory: {
          file: 'MEMORY.md',
          content: '',
          char_count: 0,
          char_limit: 100000,
          sections: [],
        },
        user_profile: {
          file: 'USER.md',
          content: '',
          char_count: 0,
          char_limit: 100000,
          sections: [],
        },
      };
    case 'health_check':
      return { status: 'ok' };

    // ===== Cron Jobs =====
    case 'get_cron_job':
      return {
        id: 'cron_001',
        name: 'Daily Backup',
        schedule: '0 2 * * *',
        command: 'backup.sh',
        enabled: true,
        last_run: new Date(Date.now() - 86400000).toISOString(),
        next_run: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date(Date.now() - 604800000).toISOString(),
      };
    case 'save_cron_job':
    case 'delete_cron_job':
    case 'toggle_cron_job':
    case 'trigger_cron_job':
      return { success: true };
    case 'get_cron_path':
      return '~/.hermes/cron';
    case 'get_cron_outputs':
      return [
        {
          id: 'output_001',
          job_id: 'cron_001',
          timestamp: new Date().toISOString(),
          exit_code: 0,
          stdout: 'Backup completed successfully',
          stderr: '',
        },
      ];

    // ===== Files =====
    case 'list_directory':
      return {
        path: '/home/user',
        entries: [
          { name: 'Documents', is_dir: true, size: 0, modified: new Date().toISOString() },
          { name: 'Downloads', is_dir: true, size: 0, modified: new Date().toISOString() },
          { name: 'readme.txt', is_dir: false, size: 1024, modified: new Date().toISOString() },
          { name: 'config.json', is_dir: false, size: 256, modified: new Date().toISOString() },
        ],
      };
    case 'read_file':
      return {
        path: '/home/user/readme.txt',
        content: '# Welcome to Hermes\n\nThis is a sample file for browser development.\n\n## Features\n- Feature 1\n- Feature 2\n- Feature 3\n',
        encoding: 'utf-8',
        size: 120,
      };
    case 'create_directory':
    case 'write_file':
    case 'delete_file':
    case 'move_file':
    case 'copy_file':
      return { success: true, message: 'Operation completed' };
    case 'file_exists':
      return { exists: true, type: 'file' };

    // ===== Monitor =====
    case 'get_logs':
      return {
        file: 'hermes.log',
        lines: [
          `[${new Date().toISOString()}] INFO: Application started`,
          `[${new Date().toISOString()}] INFO: Gateway connected`,
          `[${new Date().toISOString()}] DEBUG: Processing request`,
          `[${new Date().toISOString()}] INFO: Session created: session_123`,
          `[${new Date().toISOString()}] WARN: High memory usage detected`,
        ],
      };
    case 'get_log_files':
      return {
        files: [
          { name: 'hermes.log', path: '~/.hermes/logs/hermes.log', size: 102400 },
          { name: 'gateway.log', path: '~/.hermes/logs/gateway.log', size: 51200 },
          { name: 'error.log', path: '~/.hermes/logs/error.log', size: 2048 },
        ],
      };
    case 'get_log_components':
      return ['gateway', 'chat', 'cron', 'platform', 'skill'];
    case 'clear_logs':
      return { success: true };

    // ===== Platforms =====
    case 'get_platforms':
      return [
        { type: 'telegram', name: 'Telegram', description: 'Telegram Bot 接入', status: 'connected', icon: '📱', enabled: true, config: { bot_token: '' } },
        { type: 'discord', name: 'Discord', description: 'Discord Bot 接入', status: 'disconnected', icon: '🎮', enabled: false, config: {} },
        { type: 'slack', name: 'Slack', description: 'Slack Bot 接入', status: 'disconnected', icon: '💼', enabled: false, config: {} },
        { type: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp Business API', status: 'disconnected', icon: '💬', enabled: false, config: {} },
        { type: 'weixin', name: '微信', description: '个人微信扫码接入', status: 'disconnected', icon: '🟢', enabled: false, config: {} },
        { type: 'wechat', name: '企业微信', description: '企业微信 Work 接入', status: 'disconnected', icon: '🏢', enabled: false, config: {} },
        { type: 'lark', name: '飞书', description: '飞书机器人接入', status: 'disconnected', icon: '🦜', enabled: false, config: {} },
        { type: 'api', name: 'API Gateway', description: 'REST API 接口', status: 'disconnected', icon: '🔌', enabled: false, config: {} },
        { type: 'webhook', name: 'Webhook', description: '自定义 Webhook 接入', status: 'disconnected', icon: '🔗', enabled: false, config: {} },
      ];
    case 'get_platform_status':
      return {
        type: 'telegram',
        status: 'connected',
        lastConnected: new Date().toISOString(),
      };
    case 'update_platform_config':
    case 'enable_platform':
    case 'disable_platform':
    case 'test_platform_connection':
    case 'reconnect_platform':
      return { success: true };

    // ===== WeChat QR Code =====
    case 'get_wechat_qrcode':
      mockQRCodeCreatedAt = Date.now();
      return {
        qrcode_url: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=wechat_auth_mock_${Date.now()}`,
        status: 'pending',
        expires_at: new Date(Date.now() + 120000).toISOString(),
      };
    case 'check_wechat_qrcode_status':
      // Mock: simulate scanning after 12 seconds
      if (Date.now() - mockQRCodeCreatedAt > 12000) {
        return { status: 'scanned' };
      }
      return { status: 'pending' };

    // ===== Skills =====
    case 'get_skill_detail':
      return {
        name: 'code_review',
        path: 'skills/code_review.md',
        description: 'Perform code review on source files',
        enabled: true,
        category: 'development',
        version: '1.0.0',
        author: 'system',
        tags: ['code', 'review', 'quality'],
        content: '# Code Review Skill\n\nReview code for best practices, bugs, and improvements.',
        created_at: new Date(Date.now() - 2592000000).toISOString(),
        updated_at: new Date().toISOString(),
      };
    case 'toggle_skill':
    case 'save_skill':
    case 'delete_skill':
      return { success: true };
    case 'get_skills_path':
      return '~/.hermes/skills';

    // ===== Sessions =====
    case 'search_sessions':
      return [
        {
          id: 'session_search_001',
          session_id: '20260420_123015_abc123',
          platform: 'cli',
          chat_name: 'Recent CLI Session',
          relevance_score: 0.95,
          matched_content: 'This is the matched content from the session...',
          timestamp: new Date().toISOString(),
        },
      ];
    case 'delete_session':
    case 'update_session_title':
      return { success: true };
    case 'get_sessions_path':
      return '~/.hermes/sessions';

    // ===== Memory =====
    case 'save_memory':
      return { success: true, message: 'Memory saved successfully' };

    default:
      logger.warn(`[Tauri] No mock data for command: ${cmd}`);
      return null;
  }
}

export { invoke };
