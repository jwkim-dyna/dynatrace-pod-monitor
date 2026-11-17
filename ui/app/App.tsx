import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getEnvironmentUrl } from '@dynatrace-sdk/app-environment';
import { Button } from '@dynatrace/strato-components/buttons';
import { Checkbox, SearchInput, Select } from '@dynatrace/strato-components/forms';
import { ContainerIcon, GridIcon, NodeIcon, RefreshIcon, TableIcon } from '@dynatrace/strato-icons';
import { DataTable, type DataTableColumnDef } from '@dynatrace/strato-components/tables';
import { asDate, asObject, asText, resultWarnings, useLiveQuery } from './data';
import { HEALTH, healthCounts, normalizePod, timeText, type Health, type Pod } from './model';
import { CLUSTERS_QUERY, MAX_CLUSTERS, MAX_NAMESPACES, MAX_PODS, OBSERVATION_MINUTES, REFRESH_MS, eventsQuery, namespacesQuery, podDetailsQuery, podsQuery, workloadsQuery } from './queries';
import { kubernetesPodEventsLink, kubernetesPodLink } from './podLinks';
import { StatusBoard } from './StatusBoard';
import { PodResources } from './PodResources';
import { boardGroups, workloadCounts, workloadKey, workloadPlans } from './workloads';
import { PodPopup } from './PodPopup';
import { PodDetailDrawer } from './PodDetailDrawer';
import { ALL_CLUSTERS, namespaceSelection, parseScopePreferences, scopeStorageKey, selectCluster, selectNamespaces } from './scopePreferences';

type SavedView = { view: 'map' | 'table'; health: Health | 'all'; search: string; selectedId: string | null; groupWorkloads: boolean };
const viewStorageKey = () => `pod-status-monitor:view:${getEnvironmentUrl().replace(/\/$/, '')}`;
function restoreView(): SavedView {
  let saved: Record<string, unknown> = {};
  try { saved = asObject(JSON.parse(sessionStorage.getItem(viewStorageKey()) ?? '{}')); } catch { /* Storage may be unavailable in an embedded frame. */ }
  return {
    view: saved.view === 'table' ? 'table' : 'map',
    health: typeof saved.health === 'string' && Object.hasOwn(HEALTH, saved.health) ? saved.health as Health : 'all',
    search: asText(saved.search), selectedId: asText(saved.selectedId) || null,
    groupWorkloads: saved.groupWorkloads !== false,
  };
}

function StatusBadge({ health }: { health: Health }) {
  return <span className={`status-badge ${health}`}><span aria-hidden="true">{HEALTH[health].symbol}</span>{HEALTH[health].label}</span>;
}

function RefreshInfo({ updatedAt }: { updatedAt: number | null }) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const tick = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(tick); }, []);
  const remaining = updatedAt ? Math.max(0, Math.ceil((REFRESH_MS - (clock - updatedAt)) / 1000)) : REFRESH_MS / 1000;
  return <div className="refresh-info"><strong>자동 갱신 1분</strong><span>{updatedAt ? `${timeText(updatedAt)} 갱신 · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} 후` : '최초 데이터 조회 중'}</span></div>;
}

function PodDetails({ pod, refreshVersion }: { pod: Pod; refreshVersion: number }) {
  const detail = useLiveQuery(podDetailsQuery(pod.clusterUid, pod.namespace, pod.uid));
  const record = detail.records.find(item => item['k8s.pod.uid'] === pod.uid);
  const latest = useMemo(() => record ? normalizePod(record, detail.updatedAt ?? Date.now()) : null, [record, detail.updatedAt]);
  if (!latest) return <div><div className="detail-header"><span className="eyebrow">POD DETAIL</span></div><h2>{pod.name}</h2>{detail.error ? <p className="inline-error" role="alert">{detail.error}</p> : detail.result ? <p className="muted">최근 관측 범위에서 해당 Pod UID를 확인할 수 없습니다. 종료 또는 수집 지연 여부를 확인하세요.</p> : <p className="muted">선택한 Pod의 최신 수집 상태를 확인하고 있습니다…</p>}</div>;
  return <PodDetailsContent pod={latest} refreshVersion={refreshVersion} checkedAt={detail.updatedAt} loading={detail.loading} error={detail.error} warnings={detail.result ? resultWarnings(detail.result) : []}/>;
}

function PodDetailsContent({ pod, refreshVersion, checkedAt, loading, error, warnings }: { pod: Pod; refreshVersion: number; checkedAt: number | null; loading: boolean; error: string | null; warnings: string[] }) {
  const events = useLiveQuery(eventsQuery(pod.clusterUid, pod.namespace, pod.name), false);
  const applicableEvents = events.records.filter(event => !asText(event['k8s.pod.uid']) || event['k8s.pod.uid'] === pod.uid);
  const podEventsHref = kubernetesPodEventsLink(getEnvironmentUrl(), pod);
  const podOverviewHref = kubernetesPodLink(getEnvironmentUrl(), pod);
  return <div>
    <div className="detail-header"><span className="eyebrow">POD DETAIL</span></div>
    <h2>{pod.name}</h2><StatusBadge health={pod.health}/><p className="reason">{pod.reason}</p>
    <p className="detail-checked">{loading ? '선택 Pod 상태 갱신 중…' : `선택 Pod 조회 ${timeText(checkedAt)} KST · 1분 자동 갱신`}</p>
    {error && <p className="inline-error" role="alert">{error} · 이전 상태 조회 결과입니다.</p>}
    {warnings.map((warning, index) => <p className="inline-error" key={index}>{warning}</p>)}
    <div className="detail-context"><span>{pod.cluster}</span><span>{pod.namespace}</span><span>Ready {pod.ready}</span></div>
    {podOverviewHref && <a className="native-kubernetes-link" href={podOverviewHref} target="_blank" rel="noopener noreferrer" title="Kubernetes 앱에서 선택한 Pod의 Overview 탭을 엽니다.">Dynatrace Kubernetes에서 더 살펴보기 ↗</a>}
    <PodResources pod={pod} refreshVersion={refreshVersion}/>
    <dl className="attributes"><dt>클러스터</dt><dd>{pod.cluster}</dd><dt>Namespace</dt><dd>{pod.namespace}</dd><dt>Workload</dt><dd>{pod.workload || '—'}</dd><dt>Node</dt><dd>{pod.node || '미배치'}</dd><dt>Phase</dt><dd>{pod.phase || '데이터 없음'}</dd><dt>Ready</dt><dd>{pod.ready}</dd><dt>누적 재시작</dt><dd>{pod.restarts ?? '—'}</dd><dt>마지막 관측</dt><dd>{timeText(pod.lastSeen)} KST</dd></dl>
    <h3>Pod 조건</h3>{pod.conditions.length === 0 && <p className="muted">조건 데이터가 없습니다.</p>}
    {pod.conditions.map(condition => <div className="condition" key={asText(condition.type)}><span>{asText(condition.type)}</span><strong>{asText(condition.status)}</strong></div>)}
    <h3>최근 이벤트 <small>1시간 · 최대 20건</small></h3>
    {podEventsHref && <a className="event-detail-link" href={podEventsHref} target="_blank" rel="noopener noreferrer" aria-label="Kubernetes에서 이 Pod의 이벤트 보기 (새 탭)" title="Kubernetes 앱에서 선택한 Pod의 Events 탭을 엽니다.">Kubernetes에서 Pod 이벤트 보기 ↗</a>}
    <p className="muted tiny">이력은 원인 확인용이며 현재 상태 색상에 영향을 주지 않습니다. UID 없는 이벤트는 같은 이름의 이전 Pod 이력일 수 있습니다.</p>
    {events.loading && <p className="muted">이벤트 조회 중…</p>}{events.error && <div className="inline-error">{events.error}</div>}
    {!events.loading && !events.error && applicableEvents.length === 0 && <p className="muted">최근 1시간에 이 Pod와 일치하는 Kubernetes 이벤트가 없습니다.</p>}
    {applicableEvents.map((event, index) => {
      const reason = asText(event['event.reason']) || asText(event['event.type']);
      return <div className="event-card" key={index}>
        <div><strong>{reason}</strong><time>{timeText(asDate(event.timestamp))}</time></div>
        <p>{asText(event['event.message'])}</p>
      </div>;
    })}
    {events.result && resultWarnings(events.result).map((warning, index) => <p className="inline-error" key={index}>{warning}</p>)}
    <footer className="detail-foot">실제 Dynatrace Smartscape · Pod UID<br/><code>{pod.uid || '조회되지 않음'}</code></footer>
  </div>;
}

export function App() {
  useEffect(() => { document.title = 'Pod 상태 모니터링'; }, []);
  const [savedView] = useState(restoreView);
  const [scope, setScope] = useState(() => {
    try { return parseScopePreferences(localStorage.getItem(scopeStorageKey(getEnvironmentUrl()))); }
    catch { return parseScopePreferences(null); }
  });
  const namespaces = namespaceSelection(scope);
  const [namespaceSaved, setNamespaceSaved] = useState<boolean | null>(null);
  useEffect(() => {
    try { localStorage.setItem(scopeStorageKey(getEnvironmentUrl()), JSON.stringify(scope)); setNamespaceSaved(true); }
    catch { setNamespaceSaved(false); }
  }, [scope]);
  const [view, setView] = useState<'map' | 'table'>(savedView.view);
  const [health, setHealth] = useState<Health | 'all'>(savedView.health);
  const [search, setSearch] = useState(savedView.search);
  const [selectedId, setSelectedId] = useState<string | null>(savedView.selectedId);
  const [groupWorkloads, setGroupWorkloads] = useState(savedView.groupWorkloads);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [popupGroup, setPopupGroup] = useState<{ podId: string; byWorkload: boolean } | null>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);
  const closePopup = useCallback(() => { setPopupGroup(null); setSelectedId(null); }, []);
  const openGroup = useCallback((id: string) => { setPopupGroup({ podId: id, byWorkload: groupWorkloads }); setSelectedId(null); }, [groupWorkloads]);
  useEffect(() => {
    try { sessionStorage.setItem(viewStorageKey(), JSON.stringify({ view, health, search, selectedId, groupWorkloads })); } catch { /* Keep the live view usable without storage. */ }
  }, [view, health, search, selectedId, groupWorkloads]);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const selectPod = useCallback((id: string) => { setSelectedId(id); setSelectionVersion(value => value + 1); }, []);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const clusters = useLiveQuery(CLUSTERS_QUERY);
  const availableClusters = clusters.records.filter(record => asText(record['k8s.cluster.uid']));
  const allClusters = scope.cluster === ALL_CLUSTERS;
  const cluster = allClusters ? '' : scope.cluster;
  const selectedCluster = availableClusters.find(record => record['k8s.cluster.uid'] === scope.cluster);
  const scopeReady = Boolean(clusters.result) && availableClusters.length > 0 && (allClusters || Boolean(selectedCluster));
  const clusterName = allClusters ? '전체 클러스터' : asText(selectedCluster?.['k8s.cluster.name']) || '저장된 클러스터 확인 필요';
  const clusterNames = Object.fromEntries(availableClusters.map(record => [asText(record['k8s.cluster.uid']), asText(record['k8s.cluster.name']) || asText(record['k8s.cluster.uid'])]));
  const namespaceList = useLiveQuery(scopeReady ? namespacesQuery(cluster) : null);
  const podQuery = useMemo(() => podsQuery({ cluster, namespaces }), [cluster, namespaces]);
  const query = useLiveQuery(!scopeReady || namespaces?.length === 0 ? null : podQuery);
  const workloadQuery = useMemo(() => workloadsQuery({ cluster, namespaces }), [cluster, namespaces]);
  const workloads = useLiveQuery(scopeReady && namespaces?.length !== 0 && (view === 'table' || groupWorkloads || selectedId || popupGroup) ? workloadQuery : null);
  const workloadWarnings = workloads.result ? resultWarnings(workloads.result) : [];
  const plansUnavailable = Boolean(workloads.error) || workloadWarnings.length > 0 || workloads.records.length > MAX_PODS || Boolean(workloads.updatedAt && Date.now() - workloads.updatedAt > REFRESH_MS + 15_000);
  const plans = useMemo(() => workloadPlans(workloads.records, workloads.updatedAt ?? Date.now()).map(plan => plansUnavailable ? { ...plan, desired: null, source: '목표 수 조회 결과 확인 필요' } : plan), [workloads.records, workloads.updatedAt, plansUnavailable]);

  const pods = useMemo(() => query.records.map(record => normalizePod(record, query.updatedAt ?? Date.now())).sort((a, b) =>
    a.cluster.localeCompare(b.cluster) || a.clusterUid.localeCompare(b.clusterUid) || a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid)), [query.records, query.updatedAt]);
  // Aggregate before table filters so every sibling shows the whole workload's count.
  const workloadTotals = useMemo(() => new Map(boardGroups(pods, plans).flatMap(namespace => namespace.workloads.map(workload =>
    [workload.key, { ...workloadCounts(workload), source: workload.plan?.source }] as const))), [pods, plans]);
  const plansLoading = workloads.loading && !workloads.result;
  const counts = useMemo(() => healthCounts(pods), [pods]);
  const visible = useMemo(() => pods.filter(pod => (health === 'all' || pod.health === health) && (!search.trim() ||
    `${pod.name} ${pod.namespace} ${pod.workload} ${pod.node}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))), [pods, health, search]);
  const selected = pods.find(pod => pod.id === selectedId);
  const popupPod = pods.find(pod => pod.id === popupGroup?.podId);
  const focused = health !== 'all' || search.trim().length > 0;
  const matchedIds = useMemo(() => new Set(visible.map(pod => pod.id)), [visible]);
  const attention = useMemo(() => pods.filter(pod => ['critical', 'warning', 'unknown'].includes(pod.health)).sort((a, b) => HEALTH[a.health].order - HEALTH[b.health].order || a.name.localeCompare(b.name)), [pods]);
  const namespacesAvailable = [...new Set([...namespaceList.records.map(record => asText(record['k8s.namespace.name'])).filter(Boolean), ...(namespaces ?? [])])].sort();
  const discoveryWarnings = [...(clusters.result ? resultWarnings(clusters.result) : []), ...(namespaceList.result ? resultWarnings(namespaceList.result) : [])];
  const discoveryLimited = clusters.records.length > MAX_CLUSTERS || namespaceList.records.length > MAX_NAMESPACES || discoveryWarnings.length > 0;
  const warnings = query.result ? resultWarnings(query.result) : [];
  const staleClusters = clusters.records.filter(record => {
    const seen = asDate(record.last_seen);
    return (!cluster || record['k8s.cluster.uid'] === cluster) && (seen === null || Date.now() - seen > OBSERVATION_MINUTES * 60_000);
  });
  const truncated = pods.length > MAX_PODS || warnings.length > 0;
  const elapsed = query.updatedAt ? Date.now() - query.updatedAt : 0;
  const stale = elapsed > REFRESH_MS + 15_000 || Boolean(query.error);
  const columns = useMemo<DataTableColumnDef<Pod>[]>(() => [
    { id: 'health', header: '상태', accessor: 'health', width: 115, cell: ({ rowData }) => <DataTable.DefaultCell><StatusBadge health={rowData.health}/></DataTable.DefaultCell> },
    { id: 'name', header: 'Pod', accessor: 'name', width: 330, cell: ({ rowData }) => <DataTable.DefaultCell><button data-pod-trigger className="pod-name-link" onClick={() => selectPod(rowData.id)}>{rowData.name}</button></DataTable.DefaultCell> },
    { id: 'cluster', header: '클러스터', accessor: 'cluster', width: 150 },
    { id: 'namespace', header: 'Namespace', accessor: 'namespace', width: 160 },
    { id: 'workloadReplicas', header: 'Workload 실행/계획', width: 180,
      accessor: pod => {
        const count = pod.workload ? workloadTotals.get(workloadKey(pod.clusterUid, pod.namespace, pod.kind, pod.workload)) : undefined;
        return count ? `${count.running}/${count.desired ?? (plansLoading ? '…' : '—')}` : '—';
      },
      cell: ({ rowData, value }) => {
        const count = rowData.workload ? workloadTotals.get(workloadKey(rowData.clusterUid, rowData.namespace, rowData.kind, rowData.workload)) : undefined;
        const title = count ? `${rowData.workload}\n실행 ${count.running} / 계획 ${count.desired ?? (plansLoading ? '조회 중' : '—')} Pods\n${count.source ?? (plansLoading ? 'Workload 계획 수 조회 중' : '목표 수 미수집 또는 상시 replica 목표가 없는 Workload')}\n실행 수는 종료 중인 Pod를 제외한 Running Pod 수입니다. 같은 Workload의 모든 Pod에 동일하게 표시합니다.` : '소속 Workload를 확인할 수 없습니다.';
        return <DataTable.DefaultCell><span className={count?.shortfall ? 'warning' : undefined} title={title}>{value}</span></DataTable.DefaultCell>;
      } },
    { id: 'restarts', header: '누적 재시작', accessor: 'restarts', width: 110 },
    { id: 'reason', header: '상태 이유', accessor: 'reason', width: 240 },
    { id: 'node', header: 'Node', accessor: 'node', width: 220 },
  ], [selectPod, workloadTotals, plansLoading]);

  const chooseNamespaces = (values: string[]) => {
    const next = values.includes('__all__') && namespaces !== null ? null : values.filter(value => value !== '__all__');
    setScope(current => selectNamespaces(current, next));
    setSelectedId(null);
    setPopupGroup(null);
  };
  const chooseCluster = (value: string | null) => {
    if (value === null) return;
    setScope(current => selectCluster(current, value));
    setSelectedId(null); setPopupGroup(null); setHealth('all'); setSearch('');
  };
  const refreshAll = () => { void clusters.refresh(); void namespaceList.refresh(); void query.refresh(); void workloads.refresh(); setRefreshVersion(value => value + 1); };

  return <main className="monitor">
    <header className="app-header">
      <div className="app-identity"><span className="app-icon"><ContainerIcon/></span><h1>Pod 상태 모니터링</h1></div>
      <div className="view-tabs" role="tablist" aria-label="보기 방식"><button id="view-map" role="tab" aria-controls="pod-workspace" aria-selected={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><GridIcon/>상태 보드</button><button id="view-table" role="tab" aria-controls="pod-workspace" aria-selected={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><TableIcon/>목록</button></div>
      <a className="app-native-link" href={`${getEnvironmentUrl().replace(/\/$/, '')}/ui/apps/dynatrace.kubernetes/home`} target="_blank" rel="noreferrer">Kubernetes에서 보기 ↗</a>
    </header>
    <div className="monitor-content">
    <header className="topbar">
      <div className="brand"><h2>Pod 상태</h2><span className="scope-context"><span className="cluster-badge"><NodeIcon/>{clusters.result ? clusterName : '클러스터 확인 중'}</span><span>{namespaces === null ? '전체 네임스페이스' : `${namespaces.length}개 네임스페이스`}</span></span></div>
      <div className="live-controls"><span className={`connection ${stale ? 'stale' : ''}`}><i/>{query.loading ? '조회 중' : stale ? '갱신 확인 필요' : query.updatedAt ? 'Dynatrace 연결' : '연결 중'}</span><RefreshInfo updatedAt={query.updatedAt}/><Button onClick={refreshAll} loading={query.loading} size="condensed"><Button.Prefix><RefreshIcon/></Button.Prefix>새로고침</Button></div>
    </header>
    <section className="summary" aria-label="상태 요약 및 강조">
      <button className={`summary-count total ${health === 'all' ? 'active' : ''}`} aria-pressed={health === 'all'} onClick={() => setHealth('all')}><span>전체 Pod{truncated ? ' (부분)' : ''}</span><strong>{query.result ? pods.length.toLocaleString() : '—'}</strong></button>
      {(['critical', 'warning', 'unknown', 'healthy', 'completed'] as Health[]).map(key => <button key={key} className={`summary-count ${key} ${health === key ? 'active' : ''}`} aria-pressed={health === key} onClick={() => setHealth(health === key ? 'all' : key)}><span><i style={{ background: HEALTH[key].color }}/>{HEALTH[key].label}</span><strong>{query.result ? counts[key].toLocaleString() : '—'}</strong></button>)}
      <span className="summary-hint">상태를 클릭하면<br/>해당 Pod만 강조</span>
    </section>
    <section className="filters" aria-label="조회 필터">
      <div className="filter-control clusters">
        <span className="filter-label">클러스터</span>
        <Select aria-label="클러스터" value={scope.cluster} onChange={chooseCluster} disabled={clusters.loading && !clusters.result}>
          <Select.Trigger placeholder="클러스터 선택"/>
          <Select.Content width="max-content" className="scope-select-menu">
            <Select.Filter/>
            <Select.Option value={ALL_CLUSTERS}>전체 클러스터</Select.Option>
            {clusters.result && !allClusters && !selectedCluster && <Select.Option value={scope.cluster} disabled>저장된 클러스터 확인 필요</Select.Option>}
            {availableClusters.map(record => {
              const uid = asText(record['k8s.cluster.uid']);
              return <Select.Option key={uid} value={uid}>{clusterNames[uid]}</Select.Option>;
            })}
            <Select.EmptyState>조회 가능한 클러스터가 없습니다.</Select.EmptyState>
          </Select.Content>
        </Select>
      </div>
      <div className="filter-control namespaces">
        <span className="filter-label">네임스페이스</span>
        <Select multiple aria-label="네임스페이스" value={namespaces ?? ['__all__']} onChange={chooseNamespaces} disabled={!scopeReady || namespaceList.loading || Boolean(namespaceList.error)}>
          <Select.Trigger placeholder="네임스페이스 선택"/>
          <Select.Content width="max-content" className="scope-select-menu">
            <Select.Filter/>
            <Select.Option value="__all__">전체 네임스페이스</Select.Option>
            {namespacesAvailable.map(name => <Select.Option key={name} value={name}>{name}</Select.Option>)}
            <Select.EmptyState>해당 네임스페이스가 없습니다.</Select.EmptyState>
          </Select.Content>
        </Select>
        <span className={`namespace-save ${namespaceSaved === false ? 'warning' : ''}`} role="status" title={namespaceSaved === false ? '브라우저 저장소를 사용할 수 없어 다음 방문에 선택을 복원하지 못할 수 있습니다.' : '이 브라우저에 환경·클러스터별로 자동 저장됩니다. 다음에 앱을 열면 선택한 클러스터와 네임스페이스를 복원합니다.'}>{namespaceSaved === null ? '저장 중' : namespaceSaved ? '자동 저장됨' : '저장 불가'}</span>
      </div>
      <div className="filter-control search"><span className="filter-label">Pod 찾기</span><SearchInput aria-label="Pod 찾기" value={search} onChange={setSearch} placeholder="이름 · Namespace · Workload · Node"/></div>
    </section>
    <details className="health-guide"><summary>상태 판정 기준</summary><div>
      <p><strong className="critical">문제</strong> Failed, 현재 컨테이너의 비정상 종료, CrashLoopBackOff·이미지 오류·컨테이너 생성/시작 오류</p>
      <p><strong className="warning">경고</strong> Pending(시작·스케줄링 대기), Running + NotReady, 종료 중. 5분 이상 대기는 이유에 별도 표시합니다.</p>
      <p><strong className="healthy">정상</strong> Running + Ready=True. 정상 종료 작업은 완료, 상태·관측 정보 부족은 확인 불가로 구분합니다.</p>
      <p>Workload 실행/계획 수의 노란색은 목표 미달 표시이며, 상단 Pod 경고 수에는 합산하지 않습니다. CPU·MEM 사용률이나 과거 재시작 횟수만으로 상태 색상을 바꾸지 않습니다.</p>
    </div></details>
    {(query.error || clusters.error || namespaceList.error) && <div className="error-banner" role="alert"><strong>데이터 조회를 확인하세요.</strong><span>{query.error || clusters.error || namespaceList.error}</span>{query.result && <small>마지막 성공 결과를 표시 중입니다. 현재 상태로 해석하지 마세요.</small>}</div>}
    {discoveryLimited && <div className="error-banner" role="alert"><strong>클러스터·네임스페이스 선택 목록이 일부 제한됐을 수 있습니다.</strong><span>{discoveryWarnings.join(' ') || '선택한 클러스터의 범위를 좁혀 조회하세요.'}</span></div>}
    {staleClusters.length > 0 && <div className="error-banner"><strong>클러스터 관측 시각 확인 필요</strong><span>{staleClusters.map(record => asText(record['k8s.cluster.name'])).join(', ')}: 최근 {OBSERVATION_MINUTES}분 내 관측을 확인할 수 없습니다. 상태 변경이 없거나 수집이 지연될 수 있습니다.</span></div>}
    {(view === 'table' || groupWorkloads) && plansUnavailable && <div className="error-banner" role="alert"><strong>Workload 계획 수를 확인하세요.</strong><span>{workloads.error || workloadWarnings.join(' ') || 'Workload 결과가 오래됐거나 일부 제한됐습니다.'} 계획 수는 —로 표시합니다.</span></div>}
    {truncated && <div className="error-banner"><strong>부분 결과일 수 있습니다.</strong><span>{warnings.join(' ') || '10,000개를 초과했습니다. 조회 범위를 좁혀주세요.'} 개수는 반환된 Pod 기준입니다.</span></div>}
    <section id="pod-workspace" role="tabpanel" aria-labelledby={view === 'map' ? 'view-map' : 'view-table'} className={`workspace ${view === 'table' ? 'table-view' : attentionOpen ? 'attention-open' : ''}`}>
      <div className="visual-area">
        <div className="board-toolbar"><strong>{view === 'map' ? '전체 상태' : 'Pod 목록'}</strong><span>{!query.result ? '조회 결과 대기' : focused ? `${visible.length}개 ${view === 'map' ? '강조' : '표시'} / 전체 ${pods.length}개` : `${pods.length}개 Pod`}</span>{focused && <button className="reset-focus" onClick={() => { setHealth('all'); setSearch(''); }}>강조 해제</button>}<div className="board-options">{view === 'map' && <><div className="workload-toggle"><Checkbox value={groupWorkloads} onChange={setGroupWorkloads}>Workload별 구분</Checkbox></div><Button size="condensed" aria-expanded={attentionOpen} aria-controls="attention-pods" onClick={() => setAttentionOpen(open => !open)}>확인할 Pod {query.result ? attention.length : '—'} {attentionOpen ? '접기' : '보기'}</Button></>}<small>{view === 'table' && '이름을 클릭해서 상세 확인'}</small></div></div>
        {(clusters.loading || query.loading) && !query.result ? <div className="empty-state"><div className="loader"/><h2>실제 Pod 상태를 불러오고 있습니다</h2></div> : !scopeReady ? <div className="empty-state"><h2>{!allClusters && !selectedCluster ? '저장된 클러스터를 찾을 수 없습니다' : '조회 가능한 클러스터가 없습니다'}</h2><p>클러스터를 선택하거나 환경의 수집 상태와 조회 권한을 확인하세요.</p></div> : pods.length === 0 && (!query.result || !groupWorkloads || plans.length === 0) ? <div className="empty-state"><h2>{namespaces?.length === 0 ? '네임스페이스를 선택하세요' : query.error ? 'Pod 데이터를 조회하지 못했습니다' : '조회 범위에 Pod가 없습니다'}</h2><p>선택한 범위와 Kubernetes 수집 상태를 확인하세요.</p></div> : view === 'table' ? <div className="table-area"><DataTable key={`${cluster}-${namespaces?.join(',') ?? 'all'}`} data={visible} columns={columns} fullWidth sortable resizable variant={{ rowDensity: 'condensed' }}><DataTable.Pagination defaultPageSize={20}/></DataTable></div> : <StatusBoard pods={pods} matchedIds={focused ? matchedIds : null} selectedId={popupGroup?.podId ?? null} onSelect={openGroup} groupWorkloads={groupWorkloads} plans={plans} plansLoading={workloads.loading && !workloads.result} clusterNames={clusterNames} showClusters={allClusters && availableClusters.length > 1}/>}
        {view === 'table' && <p className="table-count-guide">Workload 실행/계획: 같은 Workload의 전체 실행 Pod 수 / 목표 Pod 수 · 실행 수는 Running 기준(종료 중 제외) · —는 계획 수 미수집 또는 상시 목표 없음</p>}
        <footer className="map-footer"><span>{view === 'map' ? 'Workload 바 선택 → Pod 목록 · Pod 선택 → 상세' : 'Pod 이름 선택 → 상세'}</span><span>최근 {OBSERVATION_MINUTES}분 관측 · 1분 자동 갱신 · KST</span></footer>
      </div>
      {view === 'map' && attentionOpen && <aside id="attention-pods" className="attention-panel" aria-label="확인할 Pod">
        <header><h2>확인할 Pod</h2><strong>{query.result ? attention.length : '—'}</strong></header>
        <p className="attention-caption">문제 → 경고 → 확인 불가 순서</p>
        {!query.result ? <div className="attention-empty">{query.error ? '데이터 조회 실패' : '상태 조회 중…'}</div> : attention.length === 0 ? <div className="attention-empty"><span className="all-clear">✓</span><strong>{stale || truncated ? '데이터 확인 필요' : '확인이 필요한 Pod 없음'}</strong><p>{stale || truncated ? '조회 결과와 수집 상태를 확인하세요.' : '조회된 Pod에서 문제 · 경고 · 확인 불가 상태가 없습니다.'}</p><small>정상 {counts.healthy} · 완료 {counts.completed}</small></div> : <div className="attention-list">{attention.map(pod => <button data-pod-trigger key={pod.id} className={`attention-item ${selectedId === pod.id ? 'selected' : ''}`} onClick={() => selectPod(pod.id)}><StatusBadge health={pod.health}/><strong>{pod.name}</strong><span>{pod.cluster} / {pod.namespace}</span><p>{pod.reason}</p><small>Ready {pod.ready}</small></button>)}</div>}
      </aside>}
    </section>
    </div>
    <PodPopup pod={popupPod ?? null} pods={pods} plans={plans} groupWorkloads={popupGroup?.byWorkload ?? true} selectedId={selectedId} detailsOpen={Boolean(selected)} onSelect={selectPod} onClose={closePopup}/>
    <PodDetailDrawer pod={selected ?? null} onClose={closeDetails} renderDetails={pod => <PodDetails key={`${pod.id}-${selectionVersion}`} pod={pod} refreshVersion={refreshVersion}/>}/>
  </main>;
}
