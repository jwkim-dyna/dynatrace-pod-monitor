export const ALL_CLUSTERS = '__all_clusters__';
export type ScopePreferences = { cluster: string; namespacesByCluster: Record<string, string[] | null> };
export const scopeStorageKey = (environment: string) => `pod-status-monitor:scope:${environment.replace(/\/$/, '')}`;
export const namespaceSelection = (preferences: ScopePreferences) => Object.hasOwn(preferences.namespacesByCluster, preferences.cluster) ? preferences.namespacesByCluster[preferences.cluster] : null;

export function parseScopePreferences(raw: string | null): ScopePreferences {
  const fallback: ScopePreferences = { cluster: ALL_CLUSTERS, namespacesByCluster: {} };
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const value = parsed as Record<string, unknown>;
    const source = value.namespacesByCluster;
    const entries = source && typeof source === 'object' && !Array.isArray(source) ? Object.entries(source) : [];
    return {
      cluster: typeof value.cluster === 'string' && value.cluster ? value.cluster : ALL_CLUSTERS,
      namespacesByCluster: Object.fromEntries(entries.filter(([, names]) => names === null || Array.isArray(names))
        .map(([cluster, names]) => [cluster, names === null ? null : [...new Set((names as unknown[]).filter((name): name is string => typeof name === 'string' && name.length > 0))]])),
    };
  } catch { return fallback; }
}

export function selectCluster(preferences: ScopePreferences, cluster: string): ScopePreferences {
  return { ...preferences, cluster: cluster || ALL_CLUSTERS };
}

export function selectNamespaces(preferences: ScopePreferences, names: string[] | null): ScopePreferences {
  return { ...preferences, namespacesByCluster: { ...preferences.namespacesByCluster, [preferences.cluster]: names === null ? null : [...new Set(names)] } };
}
