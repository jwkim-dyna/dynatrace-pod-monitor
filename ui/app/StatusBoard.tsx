import React, { useMemo } from 'react';
import { healthCounts, timeText, type Pod } from './model';
import { boardGroups, workloadCounts, type WorkloadPlan } from './workloads';

export function StatusBoard({ pods, matchedIds, selectedId, onSelect, groupWorkloads, plans, plansLoading, clusterNames, showClusters }: {
  pods: Pod[]; matchedIds: Set<string> | null; selectedId: string | null; onSelect: (id: string) => void; groupWorkloads: boolean;
  plans: WorkloadPlan[]; plansLoading: boolean;
  clusterNames: Record<string, string>; showClusters: boolean;
}) {
  const groups = useMemo(() => boardGroups(pods, groupWorkloads ? plans : []).sort((a, b) => (clusterNames[a.clusterUid] || a.clusterUid).localeCompare(clusterNames[b.clusterUid] || b.clusterUid) || a.clusterUid.localeCompare(b.clusterUid) || a.name.localeCompare(b.name)), [pods, plans, groupWorkloads, clusterNames]);
  const tiles = (items: Pod[]) => {
    const first = items[0];
    if (!first) return null;
    const name = groupWorkloads ? first.workload || 'Workload 미확인' : first.namespace;
    const label = `${showClusters ? `${first.cluster} · ` : ''}${first.namespace} · ${name} · Pod ${items.length}개 목록 열기`;
    const counts = healthCounts(items);
    return <button data-workload-trigger className={`pod-strip ${counts.critical ? 'has-critical' : ''} ${items.some(pod => pod.id === selectedId) ? 'selected' : ''}`} style={{ width: `${items.length * 8}px` }} aria-label={label} aria-haspopup="dialog" aria-pressed={items.some(pod => pod.id === selectedId)} title={`${label}\n정상 ${counts.healthy} · 경고 ${counts.warning} · 문제 ${counts.critical} · 완료 ${counts.completed} · 확인 불가 ${counts.unknown}`} onClick={() => onSelect(first.id)}><span className="pod-bar-grid" aria-hidden="true">{items.map(pod => <span key={pod.id} className={`pod-tile pod-bar ${pod.health} ${matchedIds && !matchedIds.has(pod.id) ? 'dimmed' : ''}`}/>)}</span></button>;
  };
  return <div className={`status-board strip-board ${showClusters ? 'multi-cluster' : ''}`}>
    <div className="board-columns" aria-hidden="true"><span>네임스페이스</span><span>{groupWorkloads ? 'Workload · 실행/계획' : 'Pod'}<small>막대 1개 = Pod 1개</small></span><span>상태</span></div>
    <div className="namespace-walls">{groups.map(group => {
      const counts = healthCounts(group.pods);
      const clusterName = clusterNames[group.clusterUid] || group.clusterUid;
      return <section className={`namespace-wall ${counts.critical ? 'has-critical' : counts.warning ? 'has-warning' : ''}`} key={group.key} aria-label={`${showClusters ? `${clusterName} / ` : ''}${group.name} Pod 상태`}>
        <header>{showClusters && <span className="namespace-cluster">{clusterName}</span>}<h2>{group.name}</h2><span className="namespace-meta">{group.pods.length} Pods{groupWorkloads && ` · ${group.workloads.length} Workloads`}</span></header>
        {groupWorkloads ? <div className="workload-groups">{group.workloads.map(workload => {
          const count = workloadCounts(workload);
          const critical = healthCounts(workload.pods).critical;
          const displayName = workload.name.startsWith(`${group.name}-`) ? workload.name.slice(group.name.length + 1) : workload.name;
          const desired = count.desired ?? (plansLoading ? '…' : '—');
          const label = `실행 ${count.running} / 계획 ${desired} Pods`;
          const title = `${workload.kind} · ${workload.name}\n${label} · Ready ${count.ready} · 관측된 전체 Pod ${workload.pods.length}\n${workload.plan ? `${workload.plan.source} · 관측 ${timeText(workload.plan.lastSeen)} KST` : '목표 수 미수집 또는 상시 replica 목표가 없는 Workload'}\n실행 수: 최근 관측된 Running Pod (종료 중 제외). Ready 수와 다릅니다.`;
          return <section className={`workload-group ${critical ? 'has-critical' : ''}`} key={workload.key} style={{ width: `${Math.max(88, workload.pods.length * 8)}px` }} aria-label={`${workload.kind} ${workload.name}`}><header title={title}><h3 title={workload.name}>{displayName}</h3><span className={`workload-replicas ${count.shortfall ? 'warning' : ''}`} aria-label={label}>{count.running}/{desired}</span></header>{workload.pods.length ? tiles(workload.pods) : <p className="workload-empty">Pod 없음</p>}</section>;
        })}</div> : <div className="namespace-pods">{tiles(group.pods)}</div>}
        <div className="namespace-status" aria-label="네임스페이스 상태">
          {counts.critical > 0 && <strong className="critical">문제 {counts.critical}</strong>}
          {counts.warning > 0 && <strong className="warning">경고 {counts.warning}</strong>}
          {counts.unknown > 0 && <span className="unknown">확인 불가 {counts.unknown}</span>}
          {counts.critical === 0 && counts.warning === 0 && counts.unknown === 0 && counts.healthy > 0 && <span className="namespace-healthy">정상</span>}
          {counts.completed > 0 && <span className="completed">완료 {counts.completed}</span>}
          {group.pods.length === 0 && <span className="unknown">Pod 없음</span>}
        </div>
      </section>;
    })}</div>
    {matchedIds?.size === 0 && <p className="no-matches">일치하는 Pod가 없습니다. 전체 위치는 유지됩니다.</p>}
  </div>;
}
