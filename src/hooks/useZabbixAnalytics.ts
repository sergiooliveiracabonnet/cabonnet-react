import { useState, useEffect, useCallback } from 'react'
import { grafana } from '../lib/grafana'
import { useUIStore } from '../store/uiStore'

const INTERVAL_MTTR  = 10 * 60 * 1000
const INTERVAL_LIVE  =  3 * 60 * 1000
const INTERVAL_INFRA =  5 * 60 * 1000

interface EndpointState<T = unknown> {
  data:     T | null
  loading:  boolean
  error:    string | null
  lastSync: Date | null
  refresh:  () => Promise<void>
}

function useZabbixEndpoint<T = unknown>(
  fetcher:  () => Promise<unknown>,
  interval: number,
): EndpointState<T> {
  const [data,     setData]     = useState<T | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const globalTick = useUIStore(s => s.globalRefreshTick)

  const refresh = useCallback(async () => {
    try {
      const r = await fetcher() as { ok: boolean; data?: T; error?: string }
      if (r.ok) { setData(r.data as T); setError(null) }
      else setError((r.error as string) ?? 'Erro desconhecido')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
      setLastSync(new Date())
    }
  }, [fetcher])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  useEffect(() => {
    if (globalTick > 0) refresh()
  }, [globalTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, lastSync, refresh }
}

export function useZabbixAnalytics() {
  const mttr       = useZabbixEndpoint(grafana.zabbixMttr,       INTERVAL_MTTR)
  const cidades    = useZabbixEndpoint(grafana.zabbixCidades,    INTERVAL_LIVE)
  const topEquip   = useZabbixEndpoint(grafana.zabbixTopEquip,   INTERVAL_MTTR)
  const pppoe      = useZabbixEndpoint(grafana.zabbixPppoe,      INTERVAL_LIVE)
  const olt        = useZabbixEndpoint(grafana.zabbixOlt,        INTERVAL_INFRA)
  const infra      = useZabbixEndpoint(grafana.zabbixInfra,      INTERVAL_INFRA)
  const assinantes = useZabbixEndpoint(grafana.zabbixAssinantes, INTERVAL_LIVE)

  const loading  = mttr.loading || cidades.loading || topEquip.loading || pppoe.loading
  const lastSync = ([mttr.lastSync, cidades.lastSync, topEquip.lastSync, pppoe.lastSync]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
    .pop()) ?? null

  return { mttr, cidades, topEquip, pppoe, olt, infra, assinantes, loading, lastSync }
}
