import { create } from 'zustand';
import type { HermesEnvironment } from '../types/hermesEnvironment';
import { getHermesEnvironment } from '../services/hermesEnvironmentApi';

interface HermesEnvironmentState {
  environment: HermesEnvironment | null;
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  refreshEnvironment: (force?: boolean) => Promise<void>;
}

const FRESHNESS_MS = 60_000;
let inFlightRefresh: Promise<void> | null = null;

function shouldReuseEnvironment(lastLoadedAt: number | null, force: boolean): boolean {
  return !force && lastLoadedAt !== null && Date.now() - lastLoadedAt < FRESHNESS_MS;
}

export const useHermesEnvironmentStore = create<HermesEnvironmentState>((set, get) => ({
  environment: null,
  isLoading: false,
  error: null,
  lastLoadedAt: null,
  refreshEnvironment: async (force = false) => {
    if (shouldReuseEnvironment(get().lastLoadedAt, force)) {
      return;
    }

    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    set({ isLoading: true, error: null });
    inFlightRefresh = (async () => {
      try {
        const environment = await getHermesEnvironment();
        set({
          environment,
          isLoading: false,
          error: environment ? null : 'Hermes environment unavailable',
          lastLoadedAt: Date.now(),
        });
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  },
}));
