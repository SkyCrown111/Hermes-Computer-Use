import { describe, expect, it } from 'vitest';
import { evaluateHermesReadiness, type HermesReadinessLabels } from '../../lib/hermesReadiness';
import type { HealthCheckResult, HermesConfig, HermesEnvironment } from '../../types';

const labels: HermesReadinessLabels = {
  notInitializedTitle: 'not initialized',
  notInitializedDescription: 'missing home',
  runtimeMissingTitle: 'runtime missing',
  runtimeMissingDescription: 'missing runtime',
  needsConfigTitle: 'needs config',
  needsConfigDescription: 'missing config',
  gatewayOfflineTitle: 'gateway offline',
  gatewayOfflineDescription: 'missing gateway',
  readyTitle: 'ready',
  readyDescription: 'all good',
};

const healthyChecks: HealthCheckResult = {
  status: 'healthy',
  source: 'test',
  checks: {
    wsl: true,
    hermes_dir: true,
    database: true,
    cli: true,
  },
};

const readyConfig: HermesConfig = {
  model: {
    default: 'gpt-4.1',
    provider: 'openai',
    api_key: 'sk-test',
  },
  providers: {
    custom_providers: [],
  },
};

const readyEnvironment: HermesEnvironment = {
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
    config_yaml: '/tmp/.hermes/config.yml',
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

describe('buildHermesReadinessState', () => {
  it('marks setup as ready when all dependencies are present', () => {
    const state = evaluateHermesReadiness(
      true,
      healthyChecks,
      readyConfig,
      readyEnvironment,
      'online',
      labels,
    );

    expect(state.ready).toBe(true);
    expect(state.title).toBe(labels.readyTitle);
    expect(state.description).toBe(labels.readyDescription);
  });

  it('prioritizes missing home over other failures', () => {
    const state = evaluateHermesReadiness(
      false,
      healthyChecks,
      readyConfig,
      readyEnvironment,
      'offline',
      labels,
    );

    expect(state.ready).toBe(false);
    expect(state.missingHome).toBe(true);
    expect(state.title).toBe(labels.notInitializedTitle);
    expect(state.description).toBe(labels.notInitializedDescription);
  });

  it('detects missing model credentials from both default model and providers', () => {
    const state = evaluateHermesReadiness(
      true,
      healthyChecks,
      {
        model: {
          default: 'gpt-4.1',
          provider: 'openai',
        },
        providers: {
          custom_providers: [{ name: 'custom', base_url: 'https://example.com' }],
        },
      },
      readyEnvironment,
      'online',
      labels,
    );

    expect(state.ready).toBe(false);
    expect(state.missingCredentials).toBe(true);
    expect(state.title).toBe(labels.needsConfigTitle);
  });

  it('accepts provider env credentials even without a top-level api key', () => {
    const state = evaluateHermesReadiness(
      true,
      healthyChecks,
      {
        model: {
          default: 'gpt-4.1',
          provider: 'custom',
        },
        providers: {
          custom_providers: [{ name: 'custom', base_url: 'https://example.com', key_env: 'CUSTOM_API_KEY' }],
        },
      },
      readyEnvironment,
      'online',
      labels,
    );

    expect(state.missingCredentials).toBe(false);
    expect(state.ready).toBe(true);
  });

  it('surfaces gateway status once configuration is otherwise valid', () => {
    const state = evaluateHermesReadiness(
      true,
      healthyChecks,
      readyConfig,
      readyEnvironment,
      'offline',
      labels,
    );

    expect(state.ready).toBe(false);
    expect(state.gatewayOffline).toBe(true);
    expect(state.title).toBe(labels.gatewayOfflineTitle);
    expect(state.description).toBe(labels.gatewayOfflineDescription);
  });
});
