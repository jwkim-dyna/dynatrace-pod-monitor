import type { QueryResult } from '@dynatrace-sdk/client-query';
import type { Pod } from './model';
import { asDate, asNumber, asObject, asText } from './values';
import { cpuCoreFactor } from './cpu';

export type ResourceSeries = { name: string; unit: string; datapoints: { start: Date; end: Date; value: number }[] };
const values = (value: unknown) => Array.isArray(value) ? value.map(asNumber) : [];

export function resourceSeries(result: QueryResult, pod: Pod, key: 'cpu' | 'memory') {
  const containerNames = pod.containers.filter(container => container.init !== true).map(container => asText(container.name));
  const records = result.records.filter(record => record !== null && containerNames.includes(asText(record['k8s.container.name'])) && (!asText(record['k8s.pod.uid']) || record['k8s.pod.uid'] === pod.uid));
  const sourceUnit = result.metadata.metrics?.find(metric => metric.fieldName === key)?.unit || '';
  const limitUnit = result.metadata.metrics?.find(metric => metric.fieldName === `${key}_limit`)?.unit || '';
  const cpuFactor = cpuCoreFactor(sourceUnit);
  const cpuLimitFactor = cpuCoreFactor(limitUnit);
  const compatible = Boolean(sourceUnit && sourceUnit === limitUnit) || (key === 'cpu' && cpuFactor !== null && cpuLimitFactor !== null);
  const multiplier = key === 'memory' ? 1 / 1048576 : cpuFactor ?? 1;
  const absoluteUnit = key === 'memory' ? 'MiB' : cpuFactor !== null ? 'core' : sourceUnit || '수집 단위';
  const sample = records[0];
  const start = asDate(asObject(sample?.timeframe).start);
  const interval = asNumber(sample?.interval) ?? Number(asText(sample?.interval));
  const step = Number.isFinite(interval) && interval > 0 ? interval / 1_000_000 : 60_000;
  const arrays = records.map(record => ({ usage: values(record?.[key]), limit: values(record?.[`${key}_limit`]) }));
  const count = Math.max(0, ...arrays.map(item => item.usage.length));
  const complete = records.length === containerNames.length && containerNames.length > 0;
  const absolute: ResourceSeries = { name: `${key === 'cpu' ? 'CPU' : 'MEM'} 사용량`, unit: absoluteUnit, datapoints: [] };
  const percentage: ResourceSeries = { name: `${key === 'cpu' ? 'CPU' : 'MEM'} 사용률`, unit: '%', datapoints: [] };
  if (start !== null) for (let i=0;i<count;i++) {
    const time = start + i*step;
    const beforeCreation = pod.createdAt !== null && time < pod.createdAt;
    const usageComplete = complete && arrays.every(item => item.usage[i] !== null && item.usage[i] !== undefined);
    const limitsComplete = complete && compatible && arrays.every(item => item.limit[i] !== null && item.limit[i] !== undefined && (item.limit[i] ?? 0)>0);
    const usage = arrays.reduce((sum,item) => sum + (item.usage[i] ?? 0),0);
    const limit = arrays.reduce((sum,item) => sum + (item.limit[i] ?? 0),0);
    const normalizedRatio = key === 'cpu' && sourceUnit !== limitUnit && cpuFactor !== null && cpuLimitFactor !== null ? cpuFactor/cpuLimitFactor : 1;
    absolute.datapoints.push({ start: new Date(time), end: new Date(time+step), value: !beforeCreation && usageComplete ? usage*multiplier : NaN });
    percentage.datapoints.push({ start: new Date(time), end: new Date(time+step), value: !beforeCreation && usageComplete && limitsComplete ? usage/limit*100*normalizedRatio : NaN });
  }
  const hasPercentage = percentage.datapoints.some(point => Number.isFinite(point.value));
  return { series: hasPercentage ? percentage : absolute, percentage: hasPercentage, absolute, sourceUnit, limitUnit,
    partial: !complete, hasData: absolute.datapoints.some(point => Number.isFinite(point.value)) };
}
