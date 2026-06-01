import { useState, useEffect, useCallback } from 'react'
import { grafana } from '../lib/grafana'

const INTERVAL = 5 * 60 * 1000

export function useGrafanaOS() {
  const [totais,   setTotais]   = useState<unknown>(null)
  const [cidades,  setCidades]  = useState<unknown[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
       
      const [t, c] = await Promise.all([grafana.osTotais(), grafana.osCidades()]) as [any, any]
      if (t.ok) setTotais(t.data)
      if (c.ok) setCidades(c.data ?? [])
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

  return { totais, cidades, loading, error, lastSync, refresh }
}
