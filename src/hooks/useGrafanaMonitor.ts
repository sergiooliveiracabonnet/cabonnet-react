import { useState, useEffect, useCallback, useMemo } from 'react'
import { grafana } from '../lib/grafana'
import { useUIStore } from '../store/uiStore'

const INTERVAL = 2 * 60 * 1000

interface Incident {
  sevNum: number
  ack:    boolean
  [key: string]: unknown
}

export function useGrafanaMonitor() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [lastSync,  setLastSync]  = useState<Date | null>(null)

  const globalTick = useUIStore(s => s.globalRefreshTick)

  const refresh = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await grafana.incidentes() as { ok: boolean; data?: any[] }
      if (r.ok) setIncidents(r.data ?? [])
      setLastSync(new Date())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (globalTick > 0) refresh()
  }, [globalTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => ({
    total:    incidents.length,
    desastre: incidents.filter(i => i.sevNum >= 5).length,
    critico:  incidents.filter(i => i.sevNum === 4).length,
    alto:     incidents.filter(i => i.sevNum === 3).length,
    semAck:   incidents.filter(i => !i.ack).length,
  }), [incidents])

  return { incidents, stats, loading, error, lastSync, refresh }
}
