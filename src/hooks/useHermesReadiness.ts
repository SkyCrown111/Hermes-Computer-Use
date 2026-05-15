import { useCallback, useEffect, useMemo } from 'react';
import { useHermesReadinessStore } from '../stores';
import { evaluateHermesReadiness, type HermesReadinessLabels as SharedHermesReadinessLabels, type HermesReadinessState as SharedHermesReadinessState } from '../lib/hermesReadiness';
import { useTranslation } from './useTranslation';

export interface HermesReadinessState extends SharedHermesReadinessState {
  loading: boolean;
}

export interface HermesReadinessLabels extends SharedHermesReadinessLabels {
  checkingTitle: string;
  checkingDescription: string;
  unknownErrorTitle: string;
}

export function useHermesReadiness() {
  const { t } = useTranslation();
  const snapshot = useHermesReadinessStore((s) => s.snapshot);
  const isLoading = useHermesReadinessStore((s) => s.isLoading);
  const error = useHermesReadinessStore((s) => s.error);
  const refreshSnapshot = useHermesReadinessStore((s) => s.refreshSnapshot);
  const labels = useMemo<HermesReadinessLabels>(() => ({
    checkingTitle: t('readiness.checkingTitle'),
    checkingDescription: t('readiness.checkingDescription'),
    unknownErrorTitle: t('readiness.unknownErrorTitle'),
    notInitializedTitle: t('readiness.notInitializedTitle'),
    notInitializedDescription: t('readiness.notInitializedDescription'),
    runtimeMissingTitle: t('readiness.runtimeMissingTitle'),
    runtimeMissingDescription: t('readiness.runtimeMissingDescription'),
    needsConfigTitle: t('readiness.needsConfigTitle'),
    needsConfigDescription: t('readiness.needsConfigDescription'),
    gatewayOfflineTitle: t('readiness.gatewayOfflineTitle'),
    gatewayOfflineDescription: t('readiness.gatewayOfflineDescription'),
    readyTitle: t('readiness.readyTitle'),
    readyDescription: t('readiness.readyDescription'),
  }), [t]);

  const refresh = useCallback(async () => {
    await refreshSnapshot(true);
  }, [refreshSnapshot]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const readiness = useMemo<HermesReadinessState>(() => {
    if (snapshot) {
      return {
        ...evaluateHermesReadiness(
          snapshot.exists,
          snapshot.health,
          snapshot.config,
          snapshot.environment,
          snapshot.systemStatus.gateway.status,
          labels,
        ),
        loading: isLoading,
      };
    }

    if (error) {
      return {
        ready: false,
        loading: false,
        title: labels.unknownErrorTitle,
        description: error,
        missingHome: false,
        missingRuntime: false,
        missingModel: false,
        missingCredentials: false,
        gatewayOffline: false,
      };
    }

    return {
      ready: false,
      loading: true,
      title: labels.checkingTitle,
      description: labels.checkingDescription,
      missingHome: false,
      missingRuntime: false,
      missingModel: false,
      missingCredentials: false,
      gatewayOffline: false,
    };
  }, [error, isLoading, labels, snapshot]);

  return {
    readiness,
    refreshReadiness: refresh,
  };
}
