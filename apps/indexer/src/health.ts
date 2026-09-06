export interface HealthStatus {
  ok: boolean;
  service: 'scoop-indexer';
  indexingEnabled: boolean;
  phase: '6A.4';
}

export function getHealthStatus(indexingEnabled: boolean): HealthStatus {
  return {
    ok: true,
    service: 'scoop-indexer',
    indexingEnabled,
    phase: '6A.4',
  };
}
