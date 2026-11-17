import React, { useMemo } from 'react';
import type { QueryResult } from '@dynatrace-sdk/client-query';
import { resourceConfiguration, type SettingValue } from './configuration';
import { timeText, type Pod } from './model';

function Setting({ value, loading }: { value: SettingValue | null; loading: boolean }) {
  return <td title={value ? `${value.source}${value.observedAt ? ` · ${timeText(value.observedAt)} KST` : ''}` : '미설정 또는 설정 데이터 미수집'}>{value ? <>{value.text}{value.source === '수집 메트릭' && <span className="metric-setting" aria-label="수집 메트릭 기준">*</span>}</> : <span className="setting-missing">{loading ? '조회 중' : '—'}</span>}</td>;
}

export function PodConfiguration({ pod, result, loading }: { pod: Pod; result: QueryResult | null; loading: boolean }) {
  const rows = useMemo(() => resourceConfiguration(pod, result, Date.now()), [pod, result]);
  return <section className="pod-configuration" aria-label="Pod 리소스 설정">
    <h3>리소스 설정 <small>컨테이너별 requests / limits</small></h3>
    <p className="resource-caption">CPU core · MEM Mi / Gi · init은 별도 표시</p>
    {rows.length === 0 ? <p className="muted">컨테이너 설정을 수집하지 못했습니다.</p> : <table className="configuration-table"><thead><tr><th rowSpan={2}>컨테이너</th><th colSpan={2}>CPU</th><th colSpan={2}>MEM</th></tr><tr><th>Request</th><th>Limit</th><th>Request</th><th>Limit</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><th scope="row">{row.name}{row.init && <small>init</small>}</th><Setting value={row.cpuRequest} loading={loading}/><Setting value={row.cpuLimit} loading={loading}/><Setting value={row.memoryRequest} loading={loading}/><Setting value={row.memoryLimit} loading={loading}/></tr>)}</tbody></table>}
    <p className="metric-foot">Pod 설정 우선 · * 최근 15분 내 수집 메트릭 · — 미설정 / 미수집</p>
  </section>;
}
