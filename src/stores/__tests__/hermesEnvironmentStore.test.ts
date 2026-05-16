import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHermesEnvironmentStore } from '../hermesEnvironmentStore';
import { getHermesEnvironment } from '../../services/hermesEnvironmentApi';
import type { HermesEnvironment } from '../../types/hermesEnvironment';

vi.mock('../../services/hermesEnvironmentApi', () => ({
  getHermesEnvironment: vi.fn(),
}));

const mockEnvironment: HermesEnvironment = {
  hermes_home: '/tmp/.hermes',
  active_profile: 'default',
  uses_wsl: false,
  runtime: {
    python_path: '/usr/bin/python3',
    cli_command: 'hermes',
    agent_root: '/agent',
    import_root: '/import',
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
    chat: { available: true, reason: null },
    sessions: { available: true, reason: null },
    skills: { available: true, reason: null },
    memories: { available: true, reason: null },
    mcp: { available: true, reason: null },
    cron: { available: true, reason: null },
    platforms: { available: true, reason: null },
  },
};

describe('HermesEnvironmentStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useHermesEnvironmentStore.setState({
      environment: null,
      isLoading: false,
      error: null,
      lastLoadedAt: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshEnvironment loads environment', async () => {
    vi.mocked(getHermesEnvironment).mockResolvedValue(mockEnvironment);

    await useHermesEnvironmentStore.getState().refreshEnvironment(true);

    const state = useHermesEnvironmentStore.getState();
    expect(state.environment?.hermes_home).toBe('/tmp/.hermes');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.lastLoadedAt).not.toBeNull();
  });

  it('skips refresh when cache is fresh', async () => {
    vi.mocked(getHermesEnvironment).mockResolvedValue(mockEnvironment);
    useHermesEnvironmentStore.setState({ lastLoadedAt: Date.now(), environment: mockEnvironment });

    await useHermesEnvironmentStore.getState().refreshEnvironment();

    expect(getHermesEnvironment).not.toHaveBeenCalled();
  });

  it('force refresh bypasses cache', async () => {
    useHermesEnvironmentStore.setState({ lastLoadedAt: Date.now(), environment: mockEnvironment });
    vi.mocked(getHermesEnvironment).mockResolvedValue(mockEnvironment);

    await useHermesEnvironmentStore.getState().refreshEnvironment(true);

    expect(getHermesEnvironment).toHaveBeenCalledTimes(1);
  });

  it('sets error when environment is null', async () => {
    vi.mocked(getHermesEnvironment).mockResolvedValue(null);

    await useHermesEnvironmentStore.getState().refreshEnvironment(true);

    expect(useHermesEnvironmentStore.getState().error).toBe('Hermes environment unavailable');
  });

  it('sets error on thrown exception', async () => {
    vi.mocked(getHermesEnvironment).mockRejectedValue(new Error('wsl missing'));

    await useHermesEnvironmentStore.getState().refreshEnvironment(true);

    expect(useHermesEnvironmentStore.getState().error).toBe('wsl missing');
    expect(useHermesEnvironmentStore.getState().isLoading).toBe(false);
  });

  it('deduplicates in-flight refresh', async () => {
    let resolveEnv!: (value: HermesEnvironment) => void;
    vi.mocked(getHermesEnvironment).mockImplementation(
      () => new Promise<HermesEnvironment>((resolve) => {
        resolveEnv = resolve;
      }),
    );

    const p1 = useHermesEnvironmentStore.getState().refreshEnvironment(true);
    const p2 = useHermesEnvironmentStore.getState().refreshEnvironment(true);

    resolveEnv(mockEnvironment);
    await Promise.all([p1, p2]);

    expect(getHermesEnvironment).toHaveBeenCalledTimes(1);
  });
});
