import type { Pod } from './model';

export function kubernetesPodLink(environmentUrl: string, pod: Pick<Pod, 'id' | 'cluster' | 'namespace' | 'workload'>, tab: 'Overview' | 'events' = 'Overview'): string | null {
  // Kubernetes detailsId expects the Smartscape node ID, not the Kubernetes UID.
  if (!/^K8S_POD-[0-9a-f]+$/i.test(pod.id)) return null;
  const url = new URL('/ui/apps/dynatrace.kubernetes/smartscape/workload/K8S_POD', environmentUrl);
  url.search = new URLSearchParams({ perspective: 'Health', sidebarOpen: 'false', detailsId: pod.id, detailsTab: tab }).toString();
  const filters = [`"Cluster" = ${JSON.stringify(pod.cluster)}`, `"Namespace" = ${JSON.stringify(pod.namespace)}`];
  if (pod.workload) filters.push(`"Workload" = ${JSON.stringify(pod.workload)}`);
  url.hash = new URLSearchParams({ filtering: filters.join(' ') }).toString();
  return url.toString();
}

export const kubernetesPodEventsLink = (environmentUrl: string, pod: Pick<Pod, 'id' | 'cluster' | 'namespace' | 'workload'>) => kubernetesPodLink(environmentUrl, pod, 'events');
