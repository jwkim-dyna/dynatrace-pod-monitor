export const REFRESH_MS = 60_000;
export const OBSERVATION_MINUTES = 15;
export const MAX_PODS = 10_000;
export const MAX_CLUSTERS = 1000;
export const MAX_NAMESPACES = 10_000;
export type Scope = { cluster: string; namespaces: string[] | null; podUid?: string };

// DQL string literals, never shell arguments. JSON quoting prevents filter injection.
const literal = (value: string) => JSON.stringify(value);
const clusterFilter = (cluster: string) => cluster ? `\n| filter k8s.cluster.uid == ${literal(cluster)}` : '';
const namespaceFilter = (namespaces: string[] | null) => namespaces === null ? '' : namespaces.length
  ? `\n| filter in(k8s.namespace.name, {${namespaces.map(literal).join(', ')}})` : '\n| filter false';

export const CLUSTERS_QUERY = `smartscapeNodes K8S_CLUSTER, from: now()-1h
| fields id, k8s.cluster.uid, k8s.cluster.name, last_seen = getEnd(lifetime)
| sort k8s.cluster.name asc
| limit ${MAX_CLUSTERS + 1}`;

export const namespacesQuery = (cluster: string) => `smartscapeNodes K8S_NAMESPACE, from: now()-1h${clusterFilter(cluster)}
| fields k8s.cluster.uid, k8s.namespace.name
| append [
  smartscapeNodes K8S_POD, from: now()-${OBSERVATION_MINUTES}m${clusterFilter(cluster)}
  | fields k8s.cluster.uid, k8s.namespace.name
]
| dedup k8s.namespace.name
| sort k8s.namespace.name asc
| limit ${MAX_NAMESPACES + 1}`;

export const podsQuery = (scope: Scope) => `smartscapeNodes K8S_POD, from: now()-${OBSERVATION_MINUTES}m${clusterFilter(scope.cluster)}${namespaceFilter(scope.namespaces)}${scope.podUid === undefined ? '' : scope.podUid ? `\n| filter k8s.pod.uid == ${literal(scope.podUid)}` : '\n| filter false'}
| filter isNull(getEnd(lifetime)) or getEnd(lifetime) >= now()-${OBSERVATION_MINUTES}m
| parse k8s.object, "JSON:object"
| fields id, k8s.cluster.uid, k8s.cluster.name, k8s.namespace.name,
    k8s.pod.uid, k8s.pod.name, k8s.workload.name, k8s.workload.kind, k8s.node.name,
    last_seen = getEnd(lifetime), pod_status = object[status],
    created_at = object[metadata][creationTimestamp], deleting_at = object[metadata][deletionTimestamp],
    container_count = arraySize(object[spec][containers])${scope.podUid === undefined ? '' : ',\n    container_specs = object[spec][containers], init_container_specs = object[spec][initContainers]'}
| sort k8s.cluster.name asc, k8s.namespace.name asc, k8s.pod.name asc
| limit ${MAX_PODS + 1}`;

export const podDetailsQuery = (cluster: string, namespace: string, uid: string) => podsQuery({ cluster, namespaces: [namespace], podUid: uid });

export const workloadsQuery = (scope: Scope) => `smartscapeNodes K8S_DEPLOYMENT, K8S_STATEFULSET, K8S_DAEMONSET, from: now()-${OBSERVATION_MINUTES}m${clusterFilter(scope.cluster)}${namespaceFilter(scope.namespaces)}
| filter isNull(getEnd(lifetime)) or getEnd(lifetime) >= now()-${OBSERVATION_MINUTES}m
| parse k8s.object, "JSON:object"
| fields id, k8s.cluster.uid, k8s.namespace.name,
    workload_name = coalesce(k8s.workload.name, object[metadata][name]),
    workload_kind = coalesce(k8s.workload.kind, lower(object[kind])),
    workload_uid = object[metadata][uid], last_seen = getEnd(lifetime),
    created_at = object[metadata][creationTimestamp], deleting_at = object[metadata][deletionTimestamp],
    spec_replicas = object[spec][replicas], desired_scheduled = object[status][desiredNumberScheduled]
| sort last_seen desc
| limit ${MAX_PODS + 1}`;

export const eventsQuery = (cluster: string, namespace: string, pod: string) => `fetch events, from: now()-1h, scanLimitGBytes: 1
| filter event.provider == "KUBERNETES_EVENT" or event.kind == "K8S_EVENT"
| filter k8s.cluster.uid == ${literal(cluster)} and k8s.namespace.name == ${literal(namespace)} and k8s.pod.name == ${literal(pod)}
| fields timestamp, event.id, event.type = coalesce(status, event.type),
    event.reason = coalesce(dt.kubernetes.event.reason, event.reason),
    event.message = coalesce(dt.kubernetes.event.message, event.message), k8s.pod.uid
| sort timestamp desc
| limit 20`;

export const resourcesQuery = (cluster: string, namespace: string, pod: string, uid: string) => `timeseries {
  cpu = sum(dt.kubernetes.container.cpu_usage),
  cpu_limit = sum(dt.kubernetes.container.limits_cpu),
  cpu_request = sum(dt.kubernetes.container.requests_cpu),
  memory = sum(dt.kubernetes.container.memory_working_set),
  memory_limit = sum(dt.kubernetes.container.limits_memory),
  memory_request = sum(dt.kubernetes.container.requests_memory)
}, by: {k8s.container.name, k8s.pod.uid},
  filter: {k8s.cluster.uid == ${literal(cluster)} and k8s.namespace.name == ${literal(namespace)} and k8s.pod.name == ${literal(pod)} and (isNull(k8s.pod.uid) or k8s.pod.uid == ${literal(uid)})},
  from: now()-30m, interval: 1m, union: true`;
