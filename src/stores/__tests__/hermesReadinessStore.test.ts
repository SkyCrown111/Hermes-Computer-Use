import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HermesEnvironment, HermesConfig, HealthCheckResult, SystemStatus } from '../../types';

vi.mock('../../services/settingsApi', () => ({
  checkDataDirExists: vi.fn(),
  loadConfig: vi.fn(),
}));

vi.mock('../../services/statusApi', () => ({
  statusApi: {
    getReadinessStatus: vi.fn(),
  },
}));

vi.mock('../hermesEnvironmentStore', () => ({
  useHermesEnvironmentStore: {
    getState: vi.fn(),
  },
}));

import { checkDataDirExists, loadConfig } from '../../services/settingsApi';
import { statusApi } from '../../services/statusApi';
import { useHermesEnvironmentStore } from '../hermesEnvironmentStore';
import { useHermesReadinessStore } from '../hermesReadinessStore';

const environment: HermesEnvironment = {
  hermes_home: '/tmp/.hermes',
  active_profile: null,
  uses_wsl: false,
  runtime: {
    python_path: '/usr/bin/python',
    cli_command: 'hermes',
    agent_root: '/tmp/agent',
    import_root: '/tmp/import',
  },
  paths: {
    hermes_home: '/tmp/.hermes',
    config_yaml: '/tmp/.hermes/config.yaml',
    state_db: '/tmp/.hermes/state.db',
    logs_dir: '/tmp/.hermes/logs',
    skills_dir: '/tmp/.hermes/skills',
    memories_dir: '/tmp/.hermes/memories',
    cron_dir: '/tmp/.hermes/cron',
    checkpoints_dir: '/tmp/.hermes/checkpoints',
    app_dir: '/tmp/.hermes/app',
    approvals_dir: '/tmp/.hermes/approvals',
    clarify_dir: '/tmp/.hermes/clarify',
    secrets_dir: '/tmp/.hermes/secrets',
  },
  capabilities: {
    has_chat: true,
    has_sessions: true,
    has_skills: true,
    has_memories: true,
    has_mcp: true,
    has_cron: true,
    has_platforms: true,
    chat: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
    sessions: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
    skills: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
    memories: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
    mcp: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
    cron: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
    platforms: { available: true, detection_method: 'test', reason: null, checked_paths: [] },
  },
};

const config: HermesConfig = {
  model: {
    default: 'gpt-4.1',
    provider: 'openai',
    api_key: 'sk-test',
  },
  providers: {
    custom_providers: [],
  },
};

const health: HealthCheckResult = {
  status: 'healthy',
  source: 'test',
  checks: {
    wsl: true,
    hermes_dir: true,
    database: true,
    cli: true,
  },
};

const systemStatus: SystemStatus = {
  gateway: {
    status: 'online',
    uptime_seconds: 10,
    version: '0.1.1',
    connected_platforms: [],
  },
  metrics: {
    cpu_percent: 10,
    memory_percent: 20,
    memory_used_mb: 100,
    memory_total_mb: 1000,
    disk_percent: 30,
  },
  active_sessions: 1,
  pending_tasks: 2,
};

describe('useHermesReadinessStore', () => {
  beforeEach(() => {
    useHermesReadinessStore.setState({
      snapshot: null,
      isLoading: false,
      error: null,
      lastLoadedAt: null,
    });
    vi.clearAllMocks();
    vi.mocked(useHermesEnvironmentStore.getState).mockReturnValue({
      environment,
      isLoading: false,
      error: null,
      lastLoadedAt: null,
      refreshEnvironment: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(checkDataDirExists).mockResolvedValue(true);
    vi.mocked(loadConfig).mockResolvedValue(config);
    vi.mocked(statusApi.getReadinessStatus).mockResolvedValue({
      health,
      system_status: systemStatus,
    });
  });

  it('deduplicates concurrent refresh calls', async () => {
    const [first, second] = await Promise.all([
      useHermesReadinessStore.getState().refreshSnapshot(true),
      useHermesReadinessStore.getState().refreshSnapshot(true),
    ]);

    expect(first).toEqual(second);
    expect(checkDataDirExists).toHaveBeenCalledTimes(1);
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(statusApi.getReadinessStatus).toHaveBeenCalledTimes(1);
  });
});
