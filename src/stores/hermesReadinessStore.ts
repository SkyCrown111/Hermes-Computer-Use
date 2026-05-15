import { create } from 'zustand';
import type { HealthCheckResult, HermesConfig, HermesEnvironment, SystemStatus } from '../types';
import { checkDataDirExists, loadConfig } from '../services/settingsApi';
import { statusApi } from '../services/statusApi';
import { useHermesEnvironmentStore } from './hermesEnvironmentStore';

interface HermesReadinessSnapshot {
  exists: boolean;
  health: HealthCheckResult;
  config: HermesConfig;
  environment: HermesEnvironment | null;
  systemStatus: SystemStatus;
}

interface HermesReadinessStoreState {
  snapshot: HermesReadinessSnapshot | null;
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  refreshSnapshot: (force?: boolean) => Promise<HermesReadinessSnapshot | null>;
}

const EMPTY_SYSTEM_STATUS: SystemStatus = {
  gateway: { status: 'offline', uptime_seconds: 0, version: '0.1.0', connected_platforms: [] },
  metrics: { cpu_percent: 0, memory_percent: 0, memory_used_mb: 0, memory_total_mb: 0, disk_percent: 0 },
  active_sessions: 0,
  pending_tasks: 0,
};

const FRESHNESS_MS = 15_000;
let inFlightRefresh: Promise<HermesReadinessSnapshot | null> | null = null;

function shouldReuseSnapshot(lastLoadedAt: number | null, force: boolean): boolean {
  return !force && lastLoadedAt !== null && Date.now() - lastLoadedAt < FRESHNESS_MS;
}

export const useHermesReadinessStore = create<HermesReadinessStoreState>((set, get) => ({
  snapshot: null,
  isLoading: false,
  error: null,
  lastLoadedAt: null,
  refreshSnapshot: async (force = false) => {
    const current = get();
    if (current.snapshot && shouldReuseSnapshot(current.lastLoadedAt, force)) {
      return current.snapshot;
    }

    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    set({ isLoading: true, error: null });
    inFlightRefresh = (async () => {
      try {
        const environmentPromise = useHermesEnvironmentStore.getState().refreshEnvironment(force);
        const [exists, readinessStatus, config] = await Promise.all([
          checkDataDirExists(),
          statusApi.getReadinessStatus(),
          loadConfig(),
        ]);
        await environmentPromise;
        const snapshot: HermesReadinessSnapshot = {
          exists,
          health: readinessStatus.health as HealthCheckResult,
          config,
          systemStatus: readinessStatus.system_status ?? EMPTY_SYSTEM_STATUS,
          environment: useHermesEnvironmentStore.getState().environment,
        };
        set({
          snapshot,
          isLoading: false,
          error: null,
          lastLoadedAt: Date.now(),
        });
        return snapshot;
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  },
}));

export type { HermesReadinessSnapshot };
