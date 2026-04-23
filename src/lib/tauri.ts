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
function getMockData(cmd: string): unknown {
  switch (cmd) {
    case 'list_sessions':
      return [
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
      ];
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
    default:
      logger.warn(`[Tauri] No mock data for command: ${cmd}`);
      return null;
  }
}

export { invoke };
