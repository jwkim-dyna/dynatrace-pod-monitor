import React, { useMemo } from 'react';
import { Button } from '@dynatrace/strato-components/buttons';
import { XmarkIcon } from '@dynatrace/strato-icons';
import { HEALTH, type Pod } from './model';
import { workloadCounts, workloadKey, type WorkloadPlan } from './workloads';
import { useOverlayFocus, useRetainedOverlay } from './overlays';

export function PodPopup({ pod, pods, plans, groupWorkloads, selectedId, detailsOpen, onClose, onSelect }: {
  pod: Pod | null; pods: Pod[]; plans: WorkloadPlan[]; groupWorkloads: boolean;
  selectedId: string | null; detailsOpen: boolean; onClose: () => void; onSelect: (id: string) => void;
}) {
  const { current, open } = useRetainedOverlay(pod);
  const active = Boolean(pod);
  const surface = useOverlayFocus(active, !detailsOpen, onClose);
  const key = current ? workloadKey(current.clusterUid, current.namespace, current.kind, current.workload) : '';
  const siblings = useMemo(() => pods.filter(item => groupWorkloads
    ? workloadKey(item.clusterUid, item.namespace, item.kind, item.workload) === key
    : item.clusterUid === current?.clusterUid && item.namespace === current?.namespace), [pods, groupWorkloads, key, current?.clusterUid, current?.namespace]);
  const plan = plans.find(item => workloadKey(item.clusterUid, item.namespace, item.kind, item.name) === key);
  const count = workloadCounts({ key, name: current?.workload ?? '', kind: current?.kind ?? '', pods: siblings, plan });
  if (!current) return null;
  return <div className={`pod-popup-backdrop ${open ? 'is-open' : ''}`} aria-hidden={!active || detailsOpen} {...(!active || detailsOpen ? { inert: '' } : {})}>
    <button className="overlay-dismiss" aria-label="Pod 목록 팝업 바깥 영역" tabIndex={-1} onClick={onClose}/>
    <div ref={surface} className="pod-popup" role="dialog" aria-modal={!detailsOpen || undefined} aria-labelledby="pod-popup-title" tabIndex={-1}>
      <header className="pod-popup-header"><div><span className="eyebrow">{current.cluster} / Pod 목록</span><h2 id="pod-popup-title">{current.namespace}{groupWorkloads && <span> / {current.workload || 'Workload 미확인'}</span>}</h2></div><Button className="popup-close" size="condensed" aria-label="Pod 목록 팝업 닫기" onClick={onClose}><Button.Prefix><XmarkIcon/></Button.Prefix></Button></header>
      <section className="popup-pods" aria-label="Pod 목록"><div className="popup-pods-header"><h3>Pod {siblings.length}</h3>{groupWorkloads && <span className={count.shortfall ? 'warning' : ''}>실행 {count.running} / 계획 {count.desired ?? '—'}</span>}</div><p>Pod를 클릭하면 오른쪽에서 상세 정보와 메트릭을 확인합니다.</p>
        <div className="popup-pod-grid">{siblings.map(item => <button data-pod-trigger id={`popup-pod-${item.id}`} key={item.id} className={`pod-tile popup-pod ${item.health} ${item.id === selectedId ? 'selected' : ''}`} aria-label={`${item.name} · ${HEALTH[item.health].label} · Ready ${item.ready}`} aria-pressed={item.id === selectedId} title={`${item.name}\n${item.reason} · Ready ${item.ready}`} onClick={() => onSelect(item.id)}><span aria-hidden="true">{HEALTH[item.health].symbol}</span><small aria-hidden="true">{item.name.slice(-6)}</small></button>)}</div>
        <div className="popup-key"><span className="healthy">✓ 정상</span><span className="warning">! 경고</span><span className="critical">× 문제</span><span className="completed">✓ 완료</span><span className="unknown">? 확인 불가</span></div>
      </section>
    </div>
  </div>;
}
