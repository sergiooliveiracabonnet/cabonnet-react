import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'
import { parseCSV, enrichRows, applyDateFilter } from '../lib/transform'
import { useUIStore } from '../store/uiStore'
import { useAlertStore } from '../store/alertStore'

export function useOSData() {
  const { dateFilter } = useUIStore()
  const { slaLimits }  = useAlertStore()

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey:  ['os-query'],
    queryFn:   () => api.get(endpoints.query),
    staleTime: 1000 * 60 * 2,
    retry:     2,
  })

  const { allRows, discardedLixo, duplicadosLixo } = useMemo(() => {
    if (!data) return { allRows: [], discardedLixo: 0, duplicadosLixo: 0 }
    const pendente = parseCSV((data as Record<string, string>).pendente || '')
    const agendado = parseCSV((data as Record<string, string>).agendado || '')
    const futuro   = parseCSV((data as Record<string, string>).futuro   || '')
    const discardedLixo  = (pendente._discarded  ?? 0) + (agendado._discarded  ?? 0) + (futuro._discarded  ?? 0)
    const duplicadosLixo = (pendente._duplicados ?? 0) + (agendado._duplicados ?? 0) + (futuro._duplicados ?? 0)
    return { allRows: enrichRows([...pendente, ...agendado, ...futuro], slaLimits), discardedLixo, duplicadosLixo }
  }, [data, slaLimits])

  const rows = useMemo(
    () => applyDateFilter(allRows, dateFilter),
    [allRows, dateFilter]
  )

  const prevRows = useMemo(() => {
    const { from, to } = dateFilter ?? {}
    if (!from || !to) return []
    const duration = to.getTime() - from.getTime()
    const prevTo   = new Date(from.getTime() - 1)
    const prevFrom = new Date(from.getTime() - duration - 1)
    return applyDateFilter(allRows, { ...dateFilter, from: prevFrom, to: prevTo })
  }, [allRows, dateFilter])

  return { rows, allRows, prevRows, discardedLixo, duplicadosLixo, isLoading, error, dataUpdatedAt }
}
