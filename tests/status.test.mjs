import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Fixtures belong exclusively to regression tests; the app has no mock-data path.
await mkdir('.dt-app/tests', { recursive: true });
await build({ entryPoints: ['ui/app/model.ts', 'ui/app/queries.ts', 'ui/app/resources.ts', 'ui/app/configuration.ts', 'ui/app/cpu.ts', 'ui/app/theme.ts', 'ui/app/workloads.ts', 'ui/app/scopePreferences.ts', 'ui/app/podLinks.ts'], bundle: true,
  outdir: '.dt-app/tests', platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const { normalizePod, healthCounts } = await import(pathToFileURL(resolve('.dt-app/tests/model.mjs')).href);
const { podsQuery, namespacesQuery, podDetailsQuery, eventsQuery, REFRESH_MS, workloadsQuery } = await import(pathToFileURL(resolve('.dt-app/tests/queries.mjs')).href);
const { kubernetesPodEventsLink } = await import(pathToFileURL(resolve('.dt-app/tests/podLinks.mjs')).href);
const { ALL_CLUSTERS, parseScopePreferences, namespaceSelection, selectCluster, selectNamespaces, scopeStorageKey } = await import(pathToFileURL(resolve('.dt-app/tests/scopePreferences.mjs')).href);
const { resourceSeries } = await import(pathToFileURL(resolve('.dt-app/tests/resources.mjs')).href);
const { resourceConfiguration } = await import(pathToFileURL(resolve('.dt-app/tests/configuration.mjs')).href);
const { cpuQuantityCores, formatCpuCores } = await import(pathToFileURL(resolve('.dt-app/tests/cpu.mjs')).href);
const { resolveTheme } = await import(pathToFileURL(resolve('.dt-app/tests/theme.mjs')).href);
const { workloadPlans, boardGroups, workloadCounts } = await import(pathToFileURL(resolve('.dt-app/tests/workloads.mjs')).href);
const now = Date.parse('2026-10-13T06:00:00Z');
test('Pod events include native Kubernetes DAVIS events and normalize their actual reason/message fields', () => {
  const query = eventsQuery('cluster-one', 'ns-one', 'pod-one');
  assert.match(query, /event.provider == "KUBERNETES_EVENT" or event.kind == "K8S_EVENT"/);
  assert.match(query, /coalesce\(dt.kubernetes.event.reason, event.reason\)/);
  assert.match(query, /coalesce\(dt.kubernetes.event.message, event.message\)/);
  assert.match(query, /k8s.cluster.uid == "cluster-one" and k8s.namespace.name == "ns-one" and k8s.pod.name == "pod-one"/);
  assert.match(query, /from: now\(\)-1h, scanLimitGBytes: 1/);
  assert.match(query, /sort timestamp desc\n\| limit 20/);
  assert.match(query, /fields timestamp, event.id,/);
  assert.ok(eventsQuery('cluster-one', 'ns-one', 'pod"\n| filter true').includes(JSON.stringify('pod"\n| filter true')));
});
test('Pod event links open the exact Smartscape Pod Events tab in the current environment', () => {
  const pod = { id: 'K8S_POD-0011223344556677', cluster: 'cluster-one', namespace: 'application-system', workload: 'portal-api' };
  const url = new URL(kubernetesPodEventsLink('https://customer.apps.dynatrace.com/', pod));
  assert.equal(url.origin, 'https://customer.apps.dynatrace.com');
  assert.equal(url.pathname, '/ui/apps/dynatrace.kubernetes/smartscape/workload/K8S_POD');
  assert.equal(url.searchParams.get('detailsId'), pod.id);
  assert.equal(url.searchParams.get('detailsTab'), 'events');
  assert.equal(url.searchParams.get('perspective'), 'Health');
  assert.equal(url.searchParams.get('sidebarOpen'), 'false');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('filtering'), '"Cluster" = "cluster-one" "Namespace" = "application-system" "Workload" = "portal-api"');
  const other = new URL(kubernetesPodEventsLink(url.origin, { ...pod, id: 'K8S_POD-1234ABCD' }));
  assert.equal(other.searchParams.get('detailsId'), 'K8S_POD-1234ABCD');
});

test('Pod event links encode filter values and never substitute a Kubernetes UID for a Smartscape ID', () => {
  const pod = { id: 'K8S_POD-1234ABCD', cluster: '고객 "A" & B', namespace: 'ns+one', workload: '' };
  const url = new URL(kubernetesPodEventsLink('https://customer.apps.dynatrace.com', pod));
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('filtering'), `"Cluster" = ${JSON.stringify(pod.cluster)} "Namespace" = "ns+one"`);
  for (const id of ['', 'cluster/pod-uid', '00000000-0000-4000-8000-000000000001']) assert.equal(kubernetesPodEventsLink(url.origin, { ...pod, id }), null);
});
const record = (status, extra = {}) => ({ id: 'pod-test', 'k8s.cluster.uid': 'cluster-test',
  'k8s.pod.uid': 'uid-test', 'k8s.pod.name': 'test', container_count: 1,
  last_seen: new Date(now - 60_000), created_at: new Date(now - 600_000), pod_status: status, ...extra });
const ready = { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }],
  containerStatuses: [{ name: 'app', ready: true, restartCount: 0, state: { running: {} } }] };

test('Running requires an affirmative Ready condition', () => {
  assert.equal(normalizePod(record(ready), now).health, 'healthy');
  assert.equal(normalizePod(record({ ...ready, conditions: [{ type: 'Ready', status: 'False' }] }), now).health, 'warning');
  assert.equal(normalizePod(record({ ...ready, conditions: [] }), now).health, 'unknown');
});
test('recovered OOM and cumulative restarts do not color a healthy Pod red', () => {
  const pod = normalizePod(record({ ...ready, containerStatuses: [{ ...ready.containerStatuses[0],
    restartCount: 11, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137 } } }] }), now);
  assert.equal(pod.health, 'healthy'); assert.equal(pod.restarts, 11);
});
test('current crash loops, init failures and Failed phase are red', () => {
  assert.equal(normalizePod(record({ ...ready, containerStatuses: [{ state: { waiting: { reason: 'CrashLoopBackOff' } } }] }), now).health, 'critical');
  assert.equal(normalizePod(record({ ...ready, initContainerStatuses: [{ state: { terminated: { exitCode: 1, reason: 'Error' } } }] }), now).health, 'critical');
  assert.equal(normalizePod(record({ phase: 'Failed' }), now).health, 'critical');
});
test('Succeeded is completed; Pending is yellow with age context', () => {
  assert.equal(normalizePod(record({ phase: 'Succeeded' }), now).health, 'completed');
  const pending = normalizePod(record({ phase: 'Pending' }), now);
  assert.equal(pending.health, 'warning'); assert.match(pending.reason, /5분 이상/);
});
test('missing status and stale or missing observation timestamps never become healthy', () => {
  assert.equal(normalizePod(record(null), now).health, 'unknown');
  assert.equal(normalizePod(record(ready, { last_seen: null }), now).health, 'unknown');
  assert.equal(normalizePod(record(ready, { last_seen: new Date(now - 960_000) }), now).health, 'unknown');
});
test('counts preserve every health category, including unknown data', () => {
  const pods = [ready, { phase: 'Pending' }, { phase: 'Failed' }, { phase: 'Succeeded' }, null]
    .map(status => normalizePod(record(status), now));
  assert.deepEqual(healthCounts(pods), { healthy: 1, warning: 1, critical: 1, completed: 1, unknown: 1 });
});
test('namespace selection uses membership inside a cluster; empty selection cannot expand scope', () => {
  const query = podsQuery({ cluster: 'cluster-one', namespaces: ['ns-one', 'ns-two'] });
  assert.match(query, /k8s.cluster.uid == "cluster-one"/);
  assert.match(query, /getEnd\(lifetime\) >= now\(\)-15m/);
  assert.match(query, /in\(k8s.namespace.name, \{"ns-one", "ns-two"\}\)/);
  assert.match(podsQuery({ cluster: 'cluster-one', namespaces: [] }), /filter false/);
  assert.doesNotMatch(podsQuery({ cluster: 'cluster-one', namespaces: null }), /filter in\(k8s.namespace/);
  assert.equal(REFRESH_MS, 60_000);
});
test('untrusted filter values are encoded as DQL literals', () => {
  const value = 'a"\n| filter true';
  assert.ok(podsQuery({ cluster: value, namespaces: null }).includes(JSON.stringify(value)));
});
test('all namespaces and explicit customer namespaces are available without a name prefix restriction', () => {
  for (const query of [namespacesQuery(''), namespacesQuery('cluster-one'), podsQuery({ cluster: '', namespaces: null }),
    podsQuery({ cluster: 'cluster-one', namespaces: null }), workloadsQuery({ cluster: '', namespaces: null })]) {
    assert.doesNotMatch(query, /startsWith/);
    assert.doesNotMatch(query, /filter in\(k8s.namespace/);
  }
  const selected = podsQuery({ cluster: 'customer-cluster', namespaces: ['kube-system', 'production'] });
  assert.match(selected, /in\(k8s.namespace.name, \{"kube-system", "production"\}\)/);
  assert.ok(selected.indexOf('k8s.cluster.uid == "customer-cluster"') < selected.indexOf('| parse'));
});

test('whole-environment queries omit cluster filtering; selected clusters remain isolated', () => {
  for (const query of [namespacesQuery(''), podsQuery({ cluster: '', namespaces: null }), workloadsQuery({ cluster: '', namespaces: null })]) assert.doesNotMatch(query, /filter k8s.cluster.uid/);
  for (const query of [namespacesQuery('cluster-two'), podsQuery({ cluster: 'cluster-two', namespaces: null }), workloadsQuery({ cluster: 'cluster-two', namespaces: null })]) assert.match(query, /filter k8s.cluster.uid == "cluster-two"/);
});

test('namespace discovery includes Pod namespaces even when namespace inventory is not observed', () => {
  const query = namespacesQuery('cluster-one');
  assert.match(query, /smartscapeNodes K8S_NAMESPACE/);
  assert.match(query, /append \[\s+smartscapeNodes K8S_POD/);
  assert.equal(query.match(/filter k8s.cluster.uid == "cluster-one"/g).length, 2);
  assert.doesNotMatch(query, /parse k8s.object/);
});

test('namespace preferences restore independently for each cluster and the all-clusters scope', () => {
  let scope = parseScopePreferences(null);
  assert.equal(scope.cluster, ALL_CLUSTERS);
  scope = selectNamespaces(scope, ['shared']);
  scope = selectNamespaces(selectCluster(scope, 'cluster-one'), ['production', 'kube-system']);
  scope = selectNamespaces(selectCluster(scope, 'cluster-two'), ['staging']);
  assert.deepEqual(namespaceSelection(selectCluster(scope, 'cluster-one')), ['production', 'kube-system']);
  assert.deepEqual(namespaceSelection(selectCluster(scope, ALL_CLUSTERS)), ['shared']);
  assert.equal(namespaceSelection(selectCluster(scope, 'new-cluster')), null);
  const restored = parseScopePreferences(JSON.stringify(scope));
  assert.equal(restored.cluster, 'cluster-two');
  assert.deepEqual(namespaceSelection(restored), ['staging']);
  assert.notEqual(scopeStorageKey('https://customer-one/'), scopeStorageKey('https://customer-two/'));
  assert.equal(scopeStorageKey('https://customer-one/'), scopeStorageKey('https://customer-one'));
});

test('saved empty selections never expand to all namespaces and invalid storage cannot crash restoration', () => {
  const empty = selectNamespaces(selectCluster(parseScopePreferences(null), 'cluster-one'), []);
  assert.deepEqual(namespaceSelection(parseScopePreferences(JSON.stringify(empty))), []);
  assert.equal(namespaceSelection(selectNamespaces(empty, null)), null);
  assert.equal(parseScopePreferences('broken-json').cluster, ALL_CLUSTERS);
  assert.equal(namespaceSelection(parseScopePreferences('{"cluster":"constructor"}')), null);
  const sanitized = parseScopePreferences('{"cluster":"c","namespacesByCluster":{"c":["production",7,"production",""]}}');
  assert.deepEqual(namespaceSelection(sanitized), ['production']);
});
test('selected Pod detail is restricted by UID, cluster and namespace before parsing; missing UID cannot broaden lookup', () => {
  const query = podDetailsQuery('cluster-one', 'orbit-airflow', 'uid-one');
  assert.match(query, /k8s.cluster.uid == "cluster-one"/);
  assert.match(query, /in\(k8s.namespace.name, \{"orbit-airflow"\}\)/);
  assert.match(query, /k8s.pod.uid == "uid-one"/);
  assert.match(query, /container_specs = object\[spec\]\[containers\]/);
  assert.doesNotMatch(podsQuery({ cluster: 'cluster-one', namespaces: null }), /container_specs/);
  assert.ok(query.indexOf('k8s.pod.uid == "uid-one"') < query.indexOf('| parse'));
  assert.match(podDetailsQuery('cluster-one', 'orbit-airflow', ''), /filter false/);
  const hostileUid = 'uid"\n| filter true';
  assert.ok(podDetailsQuery('cluster-one', 'orbit-airflow', hostileUid).includes(JSON.stringify(hostileUid)));
});

const metricResult = (records) => ({ records, types: [], metadata: { metrics: [
  { fieldName: 'cpu', unit: 'Millicore' }, { fieldName: 'cpu_limit', unit: 'Millicore' },
  { fieldName: 'memory', unit: 'Byte' }, { fieldName: 'memory_limit', unit: 'Byte' },
] } });
const metricRow = (name, cpu, limit, uid = 'uid-test') => ({ 'k8s.container.name': name, 'k8s.pod.uid': uid,
  timeframe: { start: new Date(now - 120_000), end: new Date(now) }, interval: 60_000_000_000,
  cpu, cpu_limit: limit, memory: cpu, memory_limit: limit });
test('Pod percentages divide summed container usage by summed limits, not average percentages', () => {
  const pod = normalizePod(record({ ...ready, containerStatuses: [
    { ...ready.containerStatuses[0], name: 'app' }, { ...ready.containerStatuses[0], name: 'sidecar' },
  ] }), now);
  const result = resourceSeries(metricResult([metricRow('app',[100,200],[1000,1000]), metricRow('sidecar',[50,100],[500,500])]), pod, 'cpu');
  assert.equal(result.percentage, true); assert.equal(result.series.datapoints[0].value, 10);
  assert.equal(result.series.datapoints[1].value, 20);
  assert.equal(result.series.datapoints[1].start.getTime() - result.series.datapoints[0].start.getTime(), 60_000);
});
test('missing limits show absolute usage; missing usage leaves a gap, not zero', () => {
  const pod = normalizePod(record(ready),now);
  const result = resourceSeries(metricResult([metricRow('app',[100,null],[null,null])]),pod,'cpu');
  assert.equal(result.percentage,false); assert.equal(result.series.unit,'core'); assert.equal(result.series.datapoints[0].value,0.1);
  assert.ok(Number.isNaN(result.series.datapoints[1].value));
});
test('metrics from a different Pod UID and missing containers never fabricate totals', () => {
  const pod = normalizePod(record(ready),now);
  assert.equal(resourceSeries(metricResult([metricRow('app',[100],[1000],'other-uid')]),pod,'cpu').hasData,false);
});

test('configuration normalizes CPU to core while preserving memory, explicit zero and init separation', () => {
  const pod = normalizePod(record(ready, { container_specs: [{ name: 'app', resources: {
    requests: { cpu: '250m', memory: '128Mi' }, limits: { cpu: 0, memory: '1Gi' },
  } }], init_container_specs: [{ name: 'setup', resources: { requests: { cpu: '10m' } } }] }), now);
  const rows = resourceConfiguration(pod, metricResult([metricRow('app', [10,20], [1000,1000])]), now);
  const app = rows.find(row => row.name === 'app');
  assert.deepEqual(app.cpuRequest, { text: '0.25 core', source: 'Pod 설정' });
  assert.deepEqual(app.cpuLimit, { text: '0 core', source: 'Pod 설정' });
  assert.equal(app.memoryLimit.text, '1Gi');
  assert.equal(rows.find(row => row.name === 'setup').init, true);
  assert.equal(rows.find(row => row.name === 'setup').cpuRequest.text, '0.01 core');
});

test('CPU quantities share core units without rounding small nonzero allocations to zero', () => {
  for (const [raw, expected] of [['100m', '0.1 core'], ['2', '2 core'], ['0.5', '0.5 core'], ['1e-3', '0.001 core'], ['1u', '0.000001 core'], ['1n', '0.000000001 core']]) {
    assert.equal(formatCpuCores(cpuQuantityCores(raw)), expected);
  }
  for (const raw of ['unknown', '-100m', 'NaN', '1e999']) assert.equal(cpuQuantityCores(raw), null);
});

test('metric CPU unit conversions preserve absolute core usage and mixed-unit limit percentages', () => {
  const pod = normalizePod(record(ready), now);
  for (const [unit, usage] of [['Core', 0.1], ['Millicore', 100], ['Microcore', 100000], ['Nanocore', 100000000]]) {
    const result = metricResult([metricRow('app', [usage], [null])]);
    result.metadata.metrics.find(metric => metric.fieldName === 'cpu').unit = unit;
    const series = resourceSeries(result, pod, 'cpu');
    assert.equal(series.series.unit, 'core');
    assert.ok(Math.abs(series.series.datapoints[0].value - 0.1) < 1e-12);
  }
  const mixed = metricResult([metricRow('app', [100], [2])]);
  mixed.metadata.metrics.find(metric => metric.fieldName === 'cpu_limit').unit = 'Core';
  assert.equal(resourceSeries(mixed, pod, 'cpu').series.datapoints[0].value, 5);
});
test('configuration fallback uses latest observed values and metric units, without averaging', () => {
  const pod = normalizePod(record(ready), now);
  const result = metricResult([{ ...metricRow('app', [10,20], [1000,2000]),
    cpu_request: [0.1,0.2], memory_request: [67108864,134217728], memory_limit: [268435456,536870912],
  }]);
  result.metadata.metrics.push({ fieldName: 'cpu_request', unit: 'Core' }, { fieldName: 'memory_request', unit: 'Byte' });
  const row = resourceConfiguration(pod, result, now)[0];
  assert.equal(row.cpuRequest.text, '0.2 core');
  assert.equal(row.cpuLimit.text, '2 core');
  assert.equal(row.memoryRequest.text, '128Mi');
  assert.equal(row.memoryLimit.text, '512Mi');
  assert.equal(row.cpuRequest.observedAt, now - 60000);
});
test('configuration never fills settings from wrong UID, stale/pre-creation data, zero limits or unsupported units', () => {
  const pod = normalizePod(record(ready), now);
  assert.equal(resourceConfiguration(pod, metricResult([metricRow('app', [10], [1000], 'other-uid')]), now)[0].cpuLimit, null);
  const old = { ...metricRow('app', [10], [1000]), timeframe: { start: new Date(now - 960000), end: new Date(now) } };
  assert.equal(resourceConfiguration(pod, metricResult([old]), now)[0].cpuLimit, null);
  const recreated = { ...pod, createdAt: now - 30000 };
  assert.equal(resourceConfiguration(recreated, metricResult([metricRow('app', [10,20], [1000,1000])]), now)[0].cpuLimit, null);
  assert.equal(resourceConfiguration(pod, metricResult([metricRow('app', [10], [0])]), now)[0].cpuLimit, null);
  const unknownUnit = metricResult([metricRow('app', [10], [1000])]);
  unknownUnit.metadata.metrics.find(metric => metric.fieldName === 'cpu_limit').unit = 'unknown';
  assert.equal(resourceConfiguration(pod, unknownUnit, now)[0].cpuLimit, null);
});
test('Dynatrace explicit theme takes priority and auto mode follows browser light/dark preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
});

const planRecord = (extra = {}) => ({ 'k8s.cluster.uid': 'cluster-test', 'k8s.namespace.name': 'orbit-main',
  workload_name: 'app', workload_kind: 'deployment', spec_replicas: '2', last_seen: new Date(now - 60000), ...extra });

test('workload plans preserve real replica goals, string long counts and scaled-to-zero; DaemonSets use desired scheduling', () => {
  assert.equal(workloadPlans([planRecord()], now)[0].desired, 2);
  assert.equal(workloadPlans([planRecord({ spec_replicas: 0 })], now)[0].desired, 0);
  assert.equal(workloadPlans([planRecord({ workload_kind: 'statefulset', spec_replicas: 3 })], now)[0].desired, 3);
  assert.equal(workloadPlans([planRecord({ workload_kind: 'daemonset', spec_replicas: 99, desired_scheduled: '8' })], now)[0].desired, 8);
  for (const value of [null, '', false, -1, 1.5, '2pods', '9007199254740993']) {
    assert.equal(workloadPlans([planRecord({ spec_replicas: value })], now)[0].desired, null);
  }
  for (const value of [planRecord({last_seen:null}), planRecord({last_seen:new Date(now-960000)}), planRecord({deleting_at:new Date(now-1000)}), planRecord({workload_kind:'cronjob'})]) {
    assert.equal(workloadPlans([value], now)[0].desired, null);
  }
  // An older observed value must not override the latest value for the same controller key.
  assert.equal(workloadPlans([planRecord({spec_replicas:9,last_seen:new Date(now-120000)}), planRecord()], now)[0].desired, 2);
});

test('workload board includes zero-Pod goals without fake tiles and matches by cluster, namespace and controller kind', () => {
  const plans = workloadPlans([planRecord(), planRecord({'k8s.namespace.name':'orbit-other'}), planRecord({'k8s.cluster.uid':'other-cluster'}), planRecord({workload_kind:'statefulset'})], now);
  const pod = normalizePod(record(ready, {'k8s.namespace.name':'orbit-main','k8s.workload.name':'app','k8s.workload.kind':'deployment'}), now);
  const groups = boardGroups([pod], plans);
  assert.equal(groups.length, 3);
  const workloads = groups.flatMap(group=>group.workloads);
  assert.equal(workloads.length, 4);
  assert.equal(workloads.reduce((sum,group)=>sum+group.pods.length,0), 1);
  const empty = workloads.find(group=>group.pods.length===0);
  assert.deepEqual(workloadCounts(empty,now), {running:0,ready:0,desired:2,shortfall:true});
  const matching = workloads.find(group=>group.pods.length===1);
  assert.deepEqual(workloadCounts(matching,now), {running:1,ready:1,desired:2,shortfall:true});
});

test('identical namespace and workload names in different clusters keep separate Pods and desired counts', () => {
  const plans = workloadPlans([
    planRecord({ 'k8s.cluster.uid': 'cluster-a', 'k8s.namespace.name': 'production', spec_replicas: 2 }),
    planRecord({ 'k8s.cluster.uid': 'cluster-b', 'k8s.namespace.name': 'production', spec_replicas: 4 }),
  ], now);
  const pods = ['cluster-a', 'cluster-b'].map(cluster => normalizePod(record(ready, {
    id: `pod-${cluster}`, 'k8s.cluster.uid': cluster, 'k8s.namespace.name': 'production', 'k8s.workload.name': 'app', 'k8s.workload.kind': 'deployment',
  }), now));
  const groups = boardGroups(pods, plans);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.clusterUid).sort(), ['cluster-a', 'cluster-b']);
  assert.equal(groups.find(group => group.clusterUid === 'cluster-a').workloads[0].plan.desired, 2);
  assert.equal(groups.find(group => group.clusterUid === 'cluster-b').workloads[0].plan.desired, 4);
  for (const group of groups) assert.ok(group.pods.every(pod => pod.clusterUid === group.clusterUid));
});

test('running/desired differs from Ready and excludes pending, completed, deleting and stale Pods', () => {
  const pod = status => normalizePod(record(status),now);
  const notReady = pod({...ready,conditions:[{type:'Ready',status:'False'}]});
  const stale = normalizePod(record(ready,{last_seen:new Date(now-960000)}),now);
  const deleting = normalizePod(record(ready,{deleting_at:new Date(now-1000)}),now);
  const group={key:'test',name:'test',kind:'deployment',pods:[pod(ready),notReady,pod({phase:'Pending'}),pod({phase:'Succeeded'}),deleting,stale],plan:workloadPlans([planRecord({spec_replicas:2})],now)[0]};
  assert.deepEqual(workloadCounts(group,now),{running:2,ready:1,desired:2,shortfall:false});
  assert.equal(workloadCounts({...group,plan:undefined},now).desired,null);
});

test('workload query applies selected cluster and namespace before parsing and never counts Pods as desired', () => {
  const query=workloadsQuery({cluster:'cluster-one',namespaces:['production']});
  assert.ok(query.includes('K8S_DEPLOYMENT, K8S_STATEFULSET, K8S_DAEMONSET'));
  assert.ok(query.includes('k8s.cluster.uid == "cluster-one"'));
  assert.ok(query.indexOf('in(k8s.namespace.name, {"production"})')<query.indexOf('| parse'));
  assert.doesNotMatch(query,/startsWith/);
  assert.ok(query.includes('object[spec][replicas]'));
  assert.ok(query.includes('object[status][desiredNumberScheduled]'));
  assert.match(workloadsQuery({cluster:'cluster-one',namespaces:[]}),/filter false/);
  const literal='orbit-"\n| filter true';
  assert.ok(workloadsQuery({cluster:literal,namespaces:[literal]}).includes(JSON.stringify(literal)));
});
