import React, { useEffect, useMemo, useRef } from 'react';
import { Button } from '@dynatrace/strato-components/buttons';
import { TimeseriesChart } from '@dynatrace/strato-components/charts';
import { RefreshIcon } from '@dynatrace/strato-icons';
import { resultWarnings, useLiveQuery } from './data';
import { timeText, type Pod } from './model';
import { resourcesQuery } from './queries';
import { resourceSeries } from './resources';
import { PodConfiguration } from './PodConfiguration';
import { usePlatformTheme } from './ThemeRoot';

export function PodResources({ pod, refreshVersion }: { pod: Pod; refreshVersion: number }) {
  const theme = usePlatformTheme();
  const query = useMemo(() => resourcesQuery(pod.clusterUid,pod.namespace,pod.name,pod.uid), [pod.clusterUid,pod.namespace,pod.name,pod.uid]);
  const metrics = useLiveQuery(query, false);
  const refreshMetrics = metrics.refresh;
  const previousRefresh = useRef(refreshVersion);
  useEffect(() => { if(previousRefresh.current !== refreshVersion) { previousRefresh.current = refreshVersion; void refreshMetrics(); } }, [refreshVersion,refreshMetrics]);
  const data = useMemo(() => metrics.result ? {
    cpu: resourceSeries(metrics.result,pod,'cpu'), memory: resourceSeries(metrics.result,pod,'memory'),
  } : null, [metrics.result,pod]);
  const missingMetrics = data ? (['cpu','memory'] as const).filter(key => !data[key].hasData) : [];
  return <><PodConfiguration pod={pod} result={metrics.result} loading={metrics.loading}/><section className="resources" aria-label="최근 30분 CPU MEM">
    <div className="resources-header"><h3>CPU · MEM <small>최근 30분</small></h3><Button size="condensed" aria-label="리소스 새로고침" onClick={() => { void metrics.refresh(); }} loading={metrics.loading}><Button.Prefix><RefreshIcon/></Button.Prefix></Button></div>
    <p className="resource-caption">1분 단위 · 일반 컨테이너 합계 · Limit 대비 사용률</p>
    {metrics.loading && !data && <p className="muted">실제 리소스 메트릭 조회 중…</p>}
    {metrics.error && <p className="inline-error">{metrics.error}{data ? ' · 이전 조회 결과입니다.' : ''}</p>}
    {missingMetrics.length > 0 && <p className="muted metric-unavailable" aria-label={`${missingMetrics.map(key => key === 'cpu' ? 'CPU' : 'MEM').join(' · ')} 메트릭 없음`}>컨테이너 메트릭 일부가 없어서 Pod 전체 사용량을 계산할 수 없습니다.</p>}
    {data && (['cpu','memory'] as const).map(key => {
      const item = data[key];
      if (!item.hasData) return null;
      const measured = item.series.datapoints.filter(point => Number.isFinite(point.value));
      const latest = measured[measured.length-1]; const average = measured.length ? measured.reduce((sum,p)=>sum+p.value,0)/measured.length : null;
      const peak = measured.length ? Math.max(...measured.map(point=>point.value)) : null;
      const fmt = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value.toLocaleString('ko-KR',item.series.unit === 'core' ? {maximumSignificantDigits:4} : {maximumFractionDigits:1})}${item.series.unit === '%' ? '%' : ` ${item.series.unit}`}`;
      return <div className="resource-chart-card" key={key} aria-label={`${key === 'cpu' ? 'CPU' : 'MEM'} 최근 30분 추이`}>
        <div className="resource-values"><div><span>{key === 'cpu' ? 'CPU' : 'MEM'} {item.percentage?'사용률':'사용량'}</span><strong>{fmt(latest?.value)}</strong></div><div><span>30분 평균</span><b>{fmt(average)}</b><span>최대 {fmt(peak)}</span></div></div>
        <TimeseriesChart height={125} gapPolicy="gap"><TimeseriesChart.Line data={item.series} color={key === 'cpu' ? theme === 'dark' ? '#85b3ff' : '#0b56e5' : theme === 'dark' ? '#c4a0ff' : '#8053db'}/><TimeseriesChart.YAxis min={0} label={item.series.unit}/><TimeseriesChart.XAxis label="시간 (Dynatrace 설정)"/><TimeseriesChart.Legend hidden/><TimeseriesChart.Toolbar hidden/><TimeseriesChart.Tooltip/></TimeseriesChart>
        {!item.percentage && item.hasData && <p className="metric-foot">Limit 미설정 또는 Limit 메트릭 부족 · 실제 사용량 표시</p>}
        {latest && <p className="metric-foot">마지막 값 {timeText(latest.start.getTime())} KST{item.partial?' · 일부 컨테이너 데이터 누락':''}</p>}
        <span className="metric-source" title={`사용량 단위: ${item.sourceUnit || '미제공'}, Limit 단위: ${item.limitUnit || '미제공'}`}>실제 Grail 메트릭</span>
      </div>;
    })}
    {metrics.result && resultWarnings(metrics.result).map((warning,index) => <p className="inline-error" key={index}>{warning}</p>)}
  </section></>;
}
