import { queryExecutionClient, type QueryResult, type ResultRecord } from '@dynatrace-sdk/client-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REFRESH_MS } from './queries';
import { asObject, asText } from './values';
export { asDate, asNumber, asObject, asObjects, asText } from './values';
export function errorMessage(error: unknown): string {
  const item = asObject(error);
  const detail = asObject(item.error);
  return asText(detail.message) || asText(item.message) || '데이터 조회에 실패했습니다. 로그인과 조회 권한을 확인하세요.';
}

export async function executeQuery(query: string, signal: AbortSignal): Promise<QueryResult> {
  let token: string | undefined;
  try {
    let response = await queryExecutionClient.queryExecute({
      body: { query, requestTimeoutMilliseconds: 1000, pollingPromiseSeconds: 60,
        maxResultRecords: 10001, maxResultBytes: 25_000_000, fetchTimeoutSeconds: 30,
        defaultScanLimitGbytes: 1, timezone: 'Asia/Seoul' },
      abortSignal: signal,
      enrich: 'metric-metadata',
    });
    token = response.requestToken;
    const started = Date.now();
    while (response.state === 'RUNNING' || response.state === 'NOT_STARTED') {
      if (!token || Date.now() - started > 60_000) throw new Error('조회 시간이 초과되었습니다. 범위를 좁히거나 다시 시도하세요.');
      response = await queryExecutionClient.queryPoll({ requestToken: token, requestTimeoutMilliseconds: 1000, abortSignal: signal, enrich: 'metric-metadata' });
    }
    if (response.state !== 'SUCCEEDED' || !response.result) throw new Error(`조회가 완료되지 않았습니다 (${response.state}).`);
    return response.result;
  } finally {
    if (signal.aborted && token) void queryExecutionClient.queryCancel({ requestToken: token }).catch(() => undefined);
  }
}

export function resultWarnings(result: QueryResult): string[] {
  return (result.metadata.grail?.notifications ?? [])
    .filter(item => item.severity === 'WARN' || item.severity === 'ERROR')
    .map(item => item.message || item.notificationType || '조회 결과가 일부 제한되었습니다.');
}

export function useLiveQuery(query: string | null, autoRefresh = true) {
  const [resultScope, setResultScope] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const latestSuccess = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!query || active.current) return;
    const request = new AbortController();
    controller.current = request;
    const version = generation.current;
    active.current = true;
    setLoading(true);
    try {
      const next = await executeQuery(query, request.signal);
      if (version !== generation.current || request.signal.aborted) return;
      const now = Date.now();
      setResult(next); setUpdatedAt(now); latestSuccess.current = now; setError(null);
    } catch (failure) {
      if (version === generation.current && !request.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (version === generation.current) { active.current = false; setLoading(false); }
    }
  }, [query]);

  useEffect(() => {
    generation.current += 1;
    controller.current?.abort(); active.current = false;
    setResultScope(query); setResult(null); setError(null); setUpdatedAt(null); latestSuccess.current = null; setLoading(false);
    void refresh();
    const interval = autoRefresh ? window.setInterval(() => { void refresh(); }, REFRESH_MS) : undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && autoRefresh && (!latestSuccess.current || Date.now() - latestSuccess.current >= REFRESH_MS)) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { generation.current += 1; controller.current?.abort(); active.current = false;
      window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, autoRefresh, query]);

  // Do not expose the previous scope even for the render before effect cleanup.
  const currentResult = resultScope === query ? result : null;
  const records = useMemo<ResultRecord[]>(() => currentResult?.records.filter((item): item is ResultRecord => item !== null) ?? [], [currentResult]);
  return { result: currentResult, records, loading: Boolean(query) && (resultScope !== query || loading), error: resultScope === query ? error : null, updatedAt: resultScope === query ? updatedAt : null, refresh };
}
