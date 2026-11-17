import { asDate, asNumber, asObject, asObjects, asText } from './values';
import { OBSERVATION_MINUTES } from './queries';

export type Health = 'healthy' | 'warning' | 'critical' | 'completed' | 'unknown';
export const HEALTH: Record<Health, { label: string; color: string; order: number; symbol: string }> = {
  healthy: { label: '정상', color: '#43d99a', order: 3, symbol: '✓' },
  warning: { label: '경고', color: '#f4ca54', order: 1, symbol: '!' },
  critical: { label: '문제', color: '#f36f78', order: 0, symbol: '×' },
  completed: { label: '완료', color: '#9baec4', order: 4, symbol: '✓' },
  unknown: { label: '확인 불가', color: '#75899e', order: 2, symbol: '?' },
};
export type Pod = {
  id: string; uid: string; name: string; cluster: string; clusterUid: string; namespace: string;
  workload: string; kind: string; node: string; phase: string; health: Health; reason: string;
  ready: string; restarts: number | null; lastSeen: number | null; createdAt: number | null; deletingAt: number | null;
  containers: Record<string, unknown>[]; conditions: Record<string, unknown>[]; statusAvailable: boolean;
  configuration: { name: string; init: boolean; resources: Record<string, unknown> }[];
};
const CRITICAL_REASONS = new Set(['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'InvalidImageName',
  'CreateContainerConfigError', 'CreateContainerError', 'RunContainerError', 'ContainerCannotRun', 'StartError']);

export function normalizePod(record: Record<string, unknown>, now: number): Pod {
  const status = asObject(record.pod_status);
  const containers = asObjects(status.containerStatuses);
  const initContainers = asObjects(status.initContainerStatuses);
  const conditions = asObjects(status.conditions);
  const phase = asText(status.phase);
  const readyCondition = conditions.find(item => item.type === 'Ready');
  const waiting = [...initContainers, ...containers].map(item => asObject(asObject(item.state).waiting)).find(item => CRITICAL_REASONS.has(asText(item.reason)));
  const failedContainer = [...initContainers, ...containers].find(item => {
    const terminated = asObject(asObject(item.state).terminated);
    return (asNumber(terminated.exitCode) ?? 0) !== 0;
  });
  const lastSeen = asDate(record.last_seen);
  const createdAt = asDate(record.created_at);
  const deletion = asDate(record.deleting_at);
  const readyCount = containers.filter(item => item.ready === true).length;
  const count = asNumber(record.container_count) ?? containers.length;
  const transition = asDate(readyCondition?.lastTransitionTime);
  const stale = lastSeen === null || now - lastSeen > OBSERVATION_MINUTES * 60_000;
  let health: Health = 'unknown';
  let reason = '상태 데이터가 없거나 Ready 조건을 확인할 수 없습니다.';
  if (stale) reason = '최근 관측 시각을 확인할 수 없거나 수집 데이터가 오래되었습니다.';
  else if (phase === 'Failed' || waiting || failedContainer) {
    health = 'critical';
    reason = asText(waiting?.reason) || asText(status.reason) || asText(asObject(asObject(failedContainer?.state).terminated).reason) || 'Failed';
  } else if (phase === 'Succeeded') { health = 'completed'; reason = '정상 종료'; }
  else if (deletion) { health = 'warning'; reason = '종료 중'; }
  else if (phase === 'Running' && readyCondition?.status === 'True') {
    health = 'healthy'; reason = 'Running · Ready';
  } else if (phase === 'Pending') {
    health = 'warning'; reason = createdAt !== null && now - createdAt >= 300_000 ? 'Pending · 5분 이상 대기' : 'Pending · 시작 대기';
  } else if (phase === 'Running' && readyCondition?.status === 'False') {
    health = 'warning'; reason = `${asText(readyCondition.reason) || 'NotReady'}${transition !== null && now - transition >= 300_000 ? ' · 5분 이상' : ''}`;
  } else if (phase === 'Unknown') reason = 'Kubernetes Unknown';
  const restartValues = [...containers, ...initContainers].map(item => asNumber(item.restartCount));
  const restarts = restartValues.length && restartValues.every(value => value !== null) ? restartValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  return {
    id: asText(record.id) || `${asText(record['k8s.cluster.uid'])}/${asText(record['k8s.pod.uid'])}`,
    uid: asText(record['k8s.pod.uid']), name: asText(record['k8s.pod.name']) || '이름 없음',
    cluster: asText(record['k8s.cluster.name']) || '클러스터 이름 없음', clusterUid: asText(record['k8s.cluster.uid']),
    namespace: asText(record['k8s.namespace.name']) || 'Namespace 없음', workload: asText(record['k8s.workload.name']),
    kind: asText(record['k8s.workload.kind']), node: asText(record['k8s.node.name']), phase, health, reason,
    ready: count > 0 && containers.length ? `${readyCount}/${count}` : '—', restarts, lastSeen, createdAt, deletingAt: deletion,
    containers: [...initContainers.map(item => ({ ...item, init: true })), ...containers], conditions,
    configuration: [...asObjects(record.init_container_specs).map(item => ({ name: asText(item.name), init: true, resources: asObject(item.resources) })),
      ...asObjects(record.container_specs).map(item => ({ name: asText(item.name), init: false, resources: asObject(item.resources) }))].filter(item => item.name),
    statusAvailable: Boolean(phase),
  };
}

export function healthCounts(pods: Pod[]): Record<Health, number> {
  const counts: Record<Health, number> = { healthy: 0, warning: 0, critical: 0, completed: 0, unknown: 0 };
  for (const pod of pods) counts[pod.health] += 1;
  return counts;
}
export const timeText = (value: number | null) => value === null ? '—' : new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(value);
