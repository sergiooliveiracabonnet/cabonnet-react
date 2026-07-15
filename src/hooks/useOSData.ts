import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'
import { parseCSV, enrichRows, applyDateFilter } from '../lib/transform'
import { useUIStore } from '../store/uiStore'
import { useAlertStore } from '../store/alertStore'
import { persistSave, persistLoad, broadcastData, subscribeSync } from '../lib/queryPersist'
import { useMemo } from 'react'

const STALE_MS = 1000 * 60 * 5   // 5 minutos
const GC_MS    = 1000 * 60 * 30  // 30 minutos

export function useOSData() {
  const { dateFilter } = useUIStore()
  const { slaLimits }  = useAlertStore()
  const queryClient    = useQueryClient()

  // Recebe dados frescos de outras abas via BroadcastChannel.
  // Só quem recebe do servidor faz broadcast — sem loops.
  useEffect(() => {
    return subscribeSync((payload, ts) => {
      queryClient.setQueryData(['os-query'], payload)
      queryClient.setQueryDefaults(['os-query'], { initialDataUpdatedAt: ts })
      persistSave(payload)
    })
  }, [queryClient])

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey:  ['os-query'],
    queryFn:   async () => {
      const result = await api.get(endpoints.query) as Record<string, string>
      persistSave(result)
      broadcastData(result)
      return result
    },
    staleTime: STALE_MS,
    gcTime:    GC_MS,
    retry:     2,
    // Dados do localStorage servem como cache inicial — aba duplicada mostra
    // dados instantaneamente sem spinner. Se o dado tiver < 5 min não refetch.
    initialData:          () => persistLoad()?.payload,
    initialDataUpdatedAt: () => persistLoad()?.ts,
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
    const { from, to, preset } = dateFilter ?? {}
    if (!from || !to) return []
    // Mensal: compara com os MESMOS dias do mês anterior (1–15 jul vs 1–15 jun).
    // A janela deslizante compararia com o FIM do mês anterior, que é inflado
    // pela corrida de fechamento — baseline enviesado para cima.
    if (preset === 'mensal') {
      const prevFrom     = new Date(from.getFullYear(), from.getMonth() - 1, 1)
      const ultimoDiaPrev = new Date(from.getFullYear(), from.getMonth(), 0).getDate()
      const prevTo       = new Date(prevFrom.getFullYear(), prevFrom.getMonth(),
                                    Math.min(to.getDate(), ultimoDiaPrev),
                                    to.getHours(), to.getMinutes(), 59, 999)
      return applyDateFilter(allRows, { ...dateFilter, from: prevFrom, to: prevTo })
    }
    const duration = to.getTime() - from.getTime()
    const prevTo   = new Date(from.getTime() - 1)
    const prevFrom = new Date(from.getTime() - duration - 1)
    return applyDateFilter(allRows, { ...dateFilter, from: prevFrom, to: prevTo })
  }, [allRows, dateFilter])

  return { rows, allRows, prevRows, discardedLixo, duplicadosLixo, isLoading, error, dataUpdatedAt }
}
