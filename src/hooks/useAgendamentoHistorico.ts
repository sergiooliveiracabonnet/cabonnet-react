import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'

export interface AgendamentoHistoricoEntry {
  numos:           string
  nomedaequipe:    string | null
  dataagendamento: string | null
  descsituacao:    string | null
  ts:              number
}

interface AgendamentoHistoricoResponse {
  historico: AgendamentoHistoricoEntry[]
}

// Histórico real de por quais equipes/datas uma OS passou — vem do polling em
// cache.py (Python), não do Grafana, que só reflete o estado atual da OS.
export function useAgendamentoHistorico(numos: string | null | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agendamento-historico', numos],
    queryFn:  () => api.get<AgendamentoHistoricoResponse>(`${endpoints.detalhes}/agendamentos?numos=${numos}`),
    enabled:  !!numos,
    staleTime: 1000 * 60 * 5,
    retry:    0,
  })

  return {
    historico: data?.historico ?? [],
    isLoading: !!(numos && isLoading),
    error:     error as Error | null,
  }
}
