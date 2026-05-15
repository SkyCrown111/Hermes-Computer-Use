import { invoke } from '@tauri-apps/api/core';
import { logger } from './logger';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: Record<string, unknown>;
    __TAURI__?: Record<string, unknown>;
  }
}

/** True when running in a browser dev server without the Tauri shell. */
export const isMockEnvironment = (): boolean => !isTauri();

let mockEnvironmentWarned = false;

/** Log once that IPC results are mocked (browser-only dev). */
export function warnMockEnvironment(): void {
  if (!isMockEnvironment() || mockEnvironmentWarned) {
    return;
  }
  mockEnvironmentWarned = true;
  logger.warn(
    '[Tauri] Running outside the Tauri shell — IPC calls return mock data. Use `npm run tauri:dev` for real backend behavior.',
  );
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

  if (!inTauri) {
    warnMockEnvironment();
    logger.debug(`[Tauri] Mock IPC for: ${cmd}`);
    return getMockData(cmd, args) as T;
  }

  try {
    const result = await invoke<T>(cmd, args);
    logger.debug(`[Tauri] Command ${cmd} succeeded`);
    return result;
  } catch (error) {
    const code = classifyErrorCode(error);
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn(`[Tauri] Command ${cmd} failed: ${detail}`);
    throw new HermesApiError(code, detail);
  }
}

let mockQRCodeCreatedAt = Date.now();
const mockKanbanNow = new Date().toISOString();
let mockCurrentKanbanBoard = 'default';
const mockKanbanBoards = [
  { slug: 'default', name: 'Default', description: 'Shared default board', icon: 'H', color: '#0a84ff', archived: false },
  { slug: 'ui-refresh', name: 'UI Refresh', description: 'Frontend polish stream', icon: 'UI', color: '#bf5af2', archived: false },
];
const mockKanbanTasks = [
  {
    id: 'task_mock_1',
    title: 'Review gateway reconnect flow',
    description: 'Check recent gateway reconnect failures and confirm retry behaviour.',
    status: 'running',
    priority: 'high',
    tenant: 'core',
    assignee: 'Hermes',
    parent_id: null,
    created_at: mockKanbanNow,
    updated_at: mockKanbanNow,
    due_date: null,
    completed_at: null,
    comments_count: 2,
    links_count: 1,
  },
  {
    id: 'task_mock_2',
    title: 'Polish sidebar dark mode',
    description: 'Replace hard-coded light tokens in the navigation chrome.',
    status: 'todo',
    priority: 'medium',
    tenant: 'ui',
    assignee: 'Codex',
    parent_id: null,
    created_at: mockKanbanNow,
    updated_at: mockKanbanNow,
    due_date: null,
    completed_at: null,
    comments_count: 1,
    links_count: 0,
  },
  {
    id: 'task_mock_3',
    title: 'Document command palette entries',
    description: 'Make sure new pages are reachable from Ctrl+K and More Pages.',
    status: 'done',
    priority: 'low',
    tenant: 'docs',
    assignee: null,
    parent_id: null,
    created_at: mockKanbanNow,
    updated_at: mockKanbanNow,
    due_date: null,
    completed_at: mockKanbanNow,
    comments_count: 0,
    links_count: 0,
  },
];

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
        session_id: 'mock-session',
        messages: [],
      };
    case 'send_chat_message':
    case 'stream_chat_message':
      return {
        session_id: args?.session_id ?? `mock_${Date.now()}`,
        response: '[Mock] Chat response',
        tool_calls_count: 0,
        input_tokens: 10,
        output_tokens: 20,
        estimated_cost_usd: 0,
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
    case 'get_kanban_board':
      return {
        triage: [],
        todo: mockKanbanTasks.filter(task => task.status === 'todo'),
        ready: [],
        running: mockKanbanTasks.filter(task => task.status === 'running'),
        blocked: [],
        done: mockKanbanTasks.filter(task => task.status === 'done'),
        archived: [],
      };
    case 'list_kanban_boards':
      return mockKanbanBoards.map(board => ({
        ...board,
        is_current: board.slug === mockCurrentKanbanBoard,
      }));
    case 'get_current_kanban_board':
      return mockCurrentKanbanBoard;
    case 'get_kanban_stats':
      return {
        total: mockKanbanTasks.length,
        triage: 0,
        todo: 1,
        ready: 0,
        running: 1,
        blocked: 0,
        done: 1,
        archived: 0,
      };
    case 'get_kanban_tenants':
      return ['core', 'ui', 'docs'];
    case 'get_kanban_task': {
      const taskId = String(args?.task_id ?? '');
      const task = mockKanbanTasks.find(item => item.id === taskId) ?? mockKanbanTasks[0];
      return {
        ...task,
        comments: [
          {
            id: 'comment_mock_1',
            task_id: task.id,
            author: 'Hermes',
            content: 'Initial note for browser-mode preview.',
            created_at: mockKanbanNow,
          },
        ],
        events: [
          {
            id: 'event_mock_1',
            task_id: task.id,
            actor: 'system',
            action: 'created',
            detail: 'Mock kanban task created for browser preview',
            created_at: mockKanbanNow,
          },
        ],
        parent_links: [],
        child_links: [],
      };
    }
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
    case 'get_hermes_environment':
      return {
        hermes_home: '~/.hermes',
        active_profile: null,
        runtime: {
          python_path: '~/.hermes/hermes-agent/.venv/bin/python',
          cli_command: 'hermes',
          agent_root: '~/.hermes/hermes-agent',
          import_root: '~/.hermes/hermes-agent/src',
        },
        paths: {
          hermes_home: '~/.hermes',
          config_yaml: '~/.hermes/config.yaml',
          state_db: '~/.hermes/state.db',
          logs_dir: '~/.hermes/logs',
          skills_dir: '~/.hermes/skills',
          memories_dir: '~/.hermes/memories',
          cron_dir: '~/.hermes/cron',
          checkpoints_dir: '~/.hermes/checkpoints',
          app_dir: '~/.hermes/hermes-app',
          approvals_dir: '~/.hermes/approvals',
          clarify_dir: '~/.hermes/clarify',
          secrets_dir: '~/.hermes/secrets',
        },
        capabilities: {
          has_chat: true,
          has_sessions: true,
          has_skills: true,
          has_memories: true,
          has_mcp: true,
          has_cron: true,
          has_platforms: true,
          chat: {
            available: true,
            detection_method: 'cli-runtime',
            reason: null,
            checked_paths: ['~/.hermes/hermes-agent/.venv/bin/python', 'hermes'],
          },
          sessions: {
            available: true,
            detection_method: 'sqlite-probe',
            reason: null,
            checked_paths: ['~/.hermes/state.db'],
          },
          skills: {
            available: true,
            detection_method: 'directory-read-write',
            reason: null,
            checked_paths: ['~/.hermes/skills'],
          },
          memories: {
            available: true,
            detection_method: 'directory-read-write',
            reason: null,
            checked_paths: ['~/.hermes/memories'],
          },
          mcp: {
            available: true,
            detection_method: 'config-readability',
            reason: null,
            checked_paths: ['~/.hermes/config.yaml'],
          },
          cron: {
            available: true,
            detection_method: 'directory-read-write',
            reason: null,
            checked_paths: ['~/.hermes/cron'],
          },
          platforms: {
            available: true,
            detection_method: 'config-readability',
            reason: null,
            checked_paths: ['~/.hermes/config.yaml'],
          },
        },
        uses_wsl: true,
      };
    case 'get_hermes_paths':
      return {
        hermes_home: '~/.hermes',
        config_yaml: '~/.hermes/config.yaml',
        state_db: '~/.hermes/state.db',
        logs_dir: '~/.hermes/logs',
        skills_dir: '~/.hermes/skills',
        memories_dir: '~/.hermes/memories',
        cron_dir: '~/.hermes/cron',
        checkpoints_dir: '~/.hermes/checkpoints',
        app_dir: '~/.hermes/hermes-app',
        approvals_dir: '~/.hermes/approvals',
        clarify_dir: '~/.hermes/clarify',
        secrets_dir: '~/.hermes/secrets',
      };
    case 'get_hermes_runtime':
      return {
        python_path: '~/.hermes/hermes-agent/.venv/bin/python',
        cli_command: 'hermes',
        agent_root: '~/.hermes/hermes-agent',
        import_root: '~/.hermes/hermes-agent/src',
      };
    case 'check_hermes_capabilities':
      return {
        has_chat: true,
        has_sessions: true,
        has_skills: true,
        has_memories: true,
        has_mcp: true,
        has_cron: true,
        has_platforms: true,
        chat: {
          available: true,
          detection_method: 'cli-runtime',
          reason: null,
          checked_paths: ['~/.hermes/hermes-agent/.venv/bin/python', 'hermes'],
        },
        sessions: {
          available: true,
          detection_method: 'sqlite-probe',
          reason: null,
          checked_paths: ['~/.hermes/state.db'],
        },
        skills: {
          available: true,
          detection_method: 'directory-read-write',
          reason: null,
          checked_paths: ['~/.hermes/skills'],
        },
        memories: {
          available: true,
          detection_method: 'directory-read-write',
          reason: null,
          checked_paths: ['~/.hermes/memories'],
        },
        mcp: {
          available: true,
          detection_method: 'config-readability',
          reason: null,
          checked_paths: ['~/.hermes/config.yaml'],
        },
        cron: {
          available: true,
          detection_method: 'directory-read-write',
          reason: null,
          checked_paths: ['~/.hermes/cron'],
        },
        platforms: {
          available: true,
          detection_method: 'config-readability',
          reason: null,
          checked_paths: ['~/.hermes/config.yaml'],
        },
      };
    case 'check_data_dir_exists':
      return true;
    case 'get_system_status':
      return {
        gateway: { status: 'offline', uptime_seconds: 0, version: '0.1.0', connected_platforms: [] },
        metrics: { cpu_percent: 25.5, memory_percent: 45.2, memory_used_mb: 512, memory_total_mb: 1024, disk_percent: 30 },
        active_sessions: 0,
        pending_tasks: 0,
      };
    case 'get_readiness_status':
      return {
        health: {
          status: 'healthy',
          source: 'wsl',
          checks: {
            wsl: true,
            hermes_dir: true,
            database: true,
            cli: true,
          },
        },
        system_status: {
          gateway: { status: 'offline', uptime_seconds: 0, version: '0.1.0', connected_platforms: [] },
          metrics: { cpu_percent: 25.5, memory_percent: 45.2, memory_used_mb: 512, memory_total_mb: 1024, disk_percent: 30 },
          active_sessions: 0,
          pending_tasks: 0,
        },
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
      return {
        status: 'healthy',
        source: 'wsl',
        checks: {
          wsl: true,
          hermes_dir: true,
          database: true,
          cli: true,
        },
      };
    case 'start_hermes_gateway':
    case 'restart_hermes_gateway':
      return { ok: true, status: 'healthy', message: 'Hermes CLI available (mock)' };
    case 'get_cron_job':
      return { id: 'cron_001', name: 'Daily Backup', schedule: { kind: 'cron', display: '0 2 * * *', expr: '0 2 * * *' }, enabled: true, created_at: new Date().toISOString(), run_count: 0 };
    case 'save_cron_job':
    case 'delete_cron_job':
    case 'toggle_cron_job':
    case 'trigger_cron_job':
    case 'pause_cron_job':
    case 'resume_cron_job':
    case 'create_kanban_task':
    case 'update_kanban_task':
    case 'delete_kanban_task':
    case 'move_kanban_task':
    case 'add_kanban_comment':
    case 'add_kanban_link':
    case 'remove_kanban_link':
      return { ok: true };
    case 'switch_kanban_board':
      mockCurrentKanbanBoard = String(args?.slug ?? 'default');
      return { ok: true };
    case 'create_kanban_board': {
      const slug = String(args?.slug ?? '').trim();
      if (slug && !mockKanbanBoards.some(board => board.slug === slug)) {
        mockKanbanBoards.push({
          slug,
          name: String(args?.name ?? slug),
          description: String(args?.description ?? ''),
          icon: String(args?.icon ?? ''),
          color: String(args?.color ?? ''),
          archived: false,
        });
      }
      mockCurrentKanbanBoard = slug || mockCurrentKanbanBoard;
      return { ok: true, slug: mockCurrentKanbanBoard };
    }
    case 'update_kanban_board': {
      const slug = String(args?.slug ?? '').trim();
      const board = mockKanbanBoards.find(item => item.slug === slug);
      if (board) {
        if (typeof args?.name === 'string') board.name = args.name;
        if (typeof args?.description === 'string') board.description = args.description;
        if (typeof args?.icon === 'string') board.icon = args.icon;
        if (typeof args?.color === 'string') board.color = args.color;
      }
      return { ok: true, slug };
    }
    case 'set_kanban_board_archived': {
      const slug = String(args?.slug ?? '').trim();
      const archived = Boolean(args?.archived);
      const board = mockKanbanBoards.find(item => item.slug === slug);
      if (board) {
        board.archived = archived;
      }
      if (archived && slug === mockCurrentKanbanBoard && slug !== 'default') {
        mockCurrentKanbanBoard = 'default';
      }
      return { ok: true, slug, current_board: mockCurrentKanbanBoard };
    }
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
      return { ok: true };
    case 'export_session':
      return JSON.stringify({
        session: { id: args?.session_id ?? 'mock-session', title: 'Mock Session' },
        messages: [],
      }, null, 2);
    case 'get_sessions_path':
      return '~/.hermes/sessions';
    case 'count_sessions':
      return { count: 2 };
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
      return {
        id: 'checkpoint-1',
        session_id: args?.session_id ?? 'mock-session',
        name: 'Mock Checkpoint',
        created_at: new Date().toISOString(),
        message_count: 0,
        size_bytes: 0,
        description: null,
      };
    case 'get_checkpoint_info':
      return {
        id: args?.checkpoint_id ?? 'checkpoint-1',
        session_id: 'mock-session',
        name: 'Mock Checkpoint',
        created_at: new Date().toISOString(),
        message_count: 0,
        size_bytes: 0,
        description: null,
      };
    case 'restore_checkpoint':
      return {
        success: true,
        session_id: args?.session_id ?? 'mock-session',
        checkpoint_id: args?.checkpoint_id ?? 'checkpoint-1',
        restored_at: new Date().toISOString(),
        message_count: 0,
      };
    case 'delete_checkpoint':
      return undefined;
    default:
      logger.warn(`[Tauri] No mock data for command: ${cmd}`);
      return null;
  }
}

export { invoke };
