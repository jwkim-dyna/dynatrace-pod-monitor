import type { QueryResult } from '@dynatrace-sdk/client-query';
import type { Pod } from './model';
import { asDate, asNumber, asObject, asText } from './values';
import { cpuCoreFactor, cpuQuantityCores, formatCpuCores } from './cpu';

export type SettingValue = { text: string; source: 'Pod 설정' | '수집 메트릭'; observedAt?: number };
const quantity = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : asNumber(value) !== null ? String(value) : null;
const numberText = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 3 });

function metricQuantity(value: number, field: string, unit: string): string | null {
  if (field.startsWith('cpu')) {
    const multiplier = cpuCoreFactor(unit);
    return multiplier === null ? null : formatCpuCores(value * multiplier);
  }
  return unit.toLowerCase() === 'byte' ? `${numberText(value / 1048576)}Mi` : null;
}

function latestMetric(result: QueryResult | null, pod: Pod, name: string, field: string, now: number): SettingValue | null {
  if (!result) return null;
  const unit = result.metadata.metrics?.find(metric => metric.fieldName === field)?.unit ?? '';
  let latest: SettingValue | null = null;
  for (const record of result.records) {
    if (!record || record['k8s.container.name'] !== name || (asText(record['k8s.pod.uid']) && record['k8s.pod.uid'] !== pod.uid)) continue;
    const start = asDate(asObject(record.timeframe).start);
    const interval = asNumber(record.interval) ?? Number(asText(record.interval));
    const series = record[field];
    if (start === null || !Number.isFinite(interval) || interval <= 0 || !Array.isArray(series)) continue;
    for (let i = 0; i < series.length; i++) {
      const observedAt = start + i * interval / 1_000_000;
      const value = asNumber(series[i]);
      if (value === null || value < 0 || (field.endsWith('limit') && value === 0) || observedAt < now - 900_000 || observedAt > now || (pod.createdAt !== null && observedAt < pod.createdAt) || observedAt <= (latest?.observedAt ?? -Infinity)) continue;
      const text = metricQuantity(value, field, unit);
      if (text !== null) latest = { text, source: '수집 메트릭', observedAt };
    }
  }
  return latest;
}

export function resourceConfiguration(pod: Pod, result: QueryResult | null, now: number) {
  const containers = new Map(pod.containers.map(item => [asText(item.name), { name: asText(item.name), init: item.init === true, resources: {} }]));
  for (const item of pod.configuration) containers.set(item.name, item);
  const setting = (resources: Record<string, unknown>, kind: 'requests' | 'limits', type: 'cpu' | 'memory', name: string): SettingValue | null => {
    const configured = quantity(asObject(resources[kind])[type]);
    if (configured !== null) {
      const cores = type === 'cpu' ? cpuQuantityCores(configured) : null;
      return type === 'cpu' ? cores === null ? null : { text: formatCpuCores(cores), source: 'Pod 설정' } : { text: configured, source: 'Pod 설정' };
    }
    return latestMetric(result, pod, name, `${type}_${kind === 'requests' ? 'request' : 'limit'}`, now);
  };
  return [...containers.values()].filter(item => item.name).map(item => ({ name: item.name, init: item.init,
    cpuRequest: setting(item.resources, 'requests', 'cpu', item.name), cpuLimit: setting(item.resources, 'limits', 'cpu', item.name),
    memoryRequest: setting(item.resources, 'requests', 'memory', item.name), memoryLimit: setting(item.resources, 'limits', 'memory', item.name),
  }));
}
