import { asDate, asNumber, asText } from './values';
import { OBSERVATION_MINUTES } from './queries';
import type { Pod } from './model';

export type WorkloadPlan = {
  clusterUid: string; namespace: string; name: string; kind: string;
  desired: number | null; source: string; lastSeen: number | null;
};
export type WorkloadGroup = { key: string; name: string; kind: string; pods: Pod[]; plan?: WorkloadPlan };
const count = (value: unknown) => {
  // Grail long values may arrive as decimal strings through the query SDK.
  const number = asNumber(value) ?? (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
};
export const workloadKey = (cluster: string, namespace: string, kind: string, name: string) => JSON.stringify([cluster, namespace, kind.toLowerCase(), name]);

export function workloadPlans(records: Record<string, unknown>[], now: number): WorkloadPlan[] {
  const plans = new Map<string, WorkloadPlan>();
  for (const record of [...records].sort((a, b) => (asDate(b.last_seen) ?? 0) - (asDate(a.last_seen) ?? 0))) {
    const clusterUid = asText(record['k8s.cluster.uid']);
    const namespace = asText(record['k8s.namespace.name']);
    const name = asText(record.workload_name);
    const kind = asText(record.workload_kind).toLowerCase();
    if (!clusterUid || !namespace || !name || !kind) continue;
    const key = workloadKey(clusterUid, namespace, kind, name);
    if (plans.has(key)) continue;
    const lastSeen = asDate(record.last_seen);
    const fresh = lastSeen !== null && lastSeen <= now && now - lastSeen <= OBSERVATION_MINUTES * 60_000;
    let desired: number | null = null;
    let source = '목표 Pod 수 미수집';
    if (!fresh) source = 'Workload 관측 시각 확인 필요';
    else if (asDate(record.deleting_at) !== null) source = '종료 중인 Workload';
    else if (kind === 'deployment' || kind === 'statefulset') { desired = count(record.spec_replicas); source = 'spec.replicas'; }
    else if (kind === 'daemonset') { desired = count(record.desired_scheduled); source = 'status.desiredNumberScheduled'; }
    if (desired === null && (source === 'spec.replicas' || source === 'status.desiredNumberScheduled')) source += ' 미수집';
    plans.set(key, { clusterUid, namespace, name, kind, desired, source, lastSeen });
  }
  return [...plans.values()];
}

export function boardGroups(pods: Pod[], plans: WorkloadPlan[]) {
  const namespaces = new Map<string, { key: string; clusterUid: string; name: string; pods: Pod[]; workloads: Map<string, WorkloadGroup> }>();
  const namespaceGroup = (cluster: string, name: string) => {
    const key = JSON.stringify([cluster, name]);
    if (!namespaces.has(key)) namespaces.set(key, { key, clusterUid: cluster, name, pods: [], workloads: new Map() });
    return namespaces.get(key)!;
  };
  for (const plan of plans) {
    const group = namespaceGroup(plan.clusterUid, plan.namespace);
    const key = workloadKey(plan.clusterUid, plan.namespace, plan.kind, plan.name);
    group.workloads.set(key, { key, name: plan.name, kind: plan.kind, pods: [], plan });
  }
  for (const pod of pods) {
    const group = namespaceGroup(pod.clusterUid, pod.namespace);
    const key = workloadKey(pod.clusterUid, pod.namespace, pod.kind, pod.workload);
    if (!group.workloads.has(key)) group.workloads.set(key, { key, name: pod.workload || 'Workload 미확인', kind: pod.kind, pods: [] });
    group.pods.push(pod);
    group.workloads.get(key)!.pods.push(pod);
  }
  return [...namespaces.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
    .map(group => ({ ...group, workloads: [...group.workloads.values()].sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind)) }));
}

export function workloadCounts(group: WorkloadGroup, now = Date.now()) {
  const running = group.pods.filter(pod => pod.phase === 'Running' && pod.statusAvailable && pod.lastSeen !== null && pod.lastSeen <= now && now - pod.lastSeen <= OBSERVATION_MINUTES * 60_000 && pod.deletingAt === null).length;
  const ready = group.pods.filter(pod => pod.health === 'healthy').length;
  const desired = group.plan?.desired ?? null;
  return { running, ready, desired, shortfall: desired !== null && running < desired };
}
