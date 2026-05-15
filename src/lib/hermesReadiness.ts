import type { HealthCheckResult, HermesConfig, HermesEnvironment } from '../types';

export interface HermesReadinessState {
  ready: boolean;
  title: string;
  description: string;
  missingHome: boolean;
  missingRuntime: boolean;
  missingModel: boolean;
  missingCredentials: boolean;
  gatewayOffline: boolean;
}

export interface HermesReadinessLabels {
  notInitializedTitle: string;
  notInitializedDescription: string;
  runtimeMissingTitle: string;
  runtimeMissingDescription: string;
  needsConfigTitle: string;
  needsConfigDescription: string;
  gatewayOfflineTitle: string;
  gatewayOfflineDescription: string;
  readyTitle: string;
  readyDescription: string;
}

export interface HermesReadinessCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export function hasConfiguredValue(value?: string | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function evaluateHermesReadiness(
  exists: boolean,
  health: HealthCheckResult,
  config: HermesConfig,
  environment: HermesEnvironment | null,
  gatewayStatus: string,
  labels: HermesReadinessLabels,
): HermesReadinessState {
  const missingHome = !exists || !health.checks?.hermes_dir;
  const missingRuntime = !environment?.capabilities.chat.available || !health.checks?.cli;
  const missingModel = !hasConfiguredValue(config.model?.default) || !hasConfiguredValue(config.model?.provider);
  const missingCredentials = !(
    hasConfiguredValue(config.model?.api_key) ||
    Boolean(config.providers?.custom_providers?.some((provider) =>
      hasConfiguredValue(provider.api_key) || hasConfiguredValue(provider.key_env)
    ))
  );
  const gatewayOffline = gatewayStatus !== 'online';
  const ready = !missingHome && !missingRuntime && !missingModel && !missingCredentials && !gatewayOffline;

  const title = missingHome
    ? labels.notInitializedTitle
    : missingRuntime
      ? labels.runtimeMissingTitle
      : missingModel || missingCredentials
        ? labels.needsConfigTitle
        : gatewayOffline
          ? labels.gatewayOfflineTitle
          : labels.readyTitle;

  const description = missingHome
    ? labels.notInitializedDescription
    : missingRuntime
      ? labels.runtimeMissingDescription
      : missingModel || missingCredentials
        ? labels.needsConfigDescription
        : gatewayOffline
          ? labels.gatewayOfflineDescription
          : labels.readyDescription;

  return {
    ready,
    title,
    description,
    missingHome,
    missingRuntime,
    missingModel,
    missingCredentials,
    gatewayOffline,
  };
}

export function buildHermesReadinessChecks(
  readiness: HermesReadinessState,
  config: HermesConfig,
  environment: HermesEnvironment | null,
  health: HealthCheckResult,
  options?: { includeSessionStore?: boolean },
): HermesReadinessCheck[] {
  const runtimeReady = !readiness.missingRuntime;
  const databaseReady = Boolean(health.checks?.database || environment?.capabilities.sessions.available);
  const checks: HermesReadinessCheck[] = [
    {
      label: 'Hermes home',
      ok: !readiness.missingHome,
      detail: readiness.missingHome ? 'Missing ~/.hermes data directory' : (environment?.hermes_home ?? '~/.hermes'),
    },
    {
      label: 'Runtime',
      ok: runtimeReady,
      detail: runtimeReady
        ? (environment?.runtime.cli_command ?? environment?.runtime.python_path ?? 'Runtime detected')
        : (environment?.capabilities.chat.reason ?? 'Hermes CLI or Python runtime is unavailable'),
    },
    {
      label: 'Model',
      ok: !readiness.missingModel,
      detail: readiness.missingModel
        ? 'Choose a provider and default model'
        : `${config.model?.provider ?? 'provider'} / ${config.model?.default ?? 'model'}`,
    },
    {
      label: 'Credentials',
      ok: !readiness.missingCredentials,
      detail: readiness.missingCredentials ? 'Add an API key or provider key env' : 'Credentials detected',
    },
    {
      label: 'Gateway',
      ok: !readiness.gatewayOffline,
      detail: readiness.gatewayOffline ? 'Gateway is offline' : 'Gateway is online',
    },
  ];

  if (options?.includeSessionStore) {
    checks.push({
      label: 'Session store',
      ok: databaseReady,
      detail: databaseReady ? 'state.db is readable' : 'state.db is missing or unreadable',
    });
  }

  return checks;
}
