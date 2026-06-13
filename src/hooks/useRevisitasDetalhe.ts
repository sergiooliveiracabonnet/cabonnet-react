import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface ParRevisita {
  tipo:          'inst' | 'manut'
  nomecliente:   string
  codigocliente: string
  nomedacidade:  string
  equipe_orig:   string
  equipe_rev:    string
  numos_orig:    string
  servico_orig:  string
  obs_orig:      string
  data_orig:     string
  numos_rev:     string
  servico_rev:   string
  obs_rev:       string
  data_rev:      string
  dias_entre:    number
  // Preenchidos pela IA após análise
  causa?:          string
  feito_primeira?: string
  o_que_faltou?:   string
}

export interface RevisitasDetalheData {
  pares:   ParRevisita[]
  n:       number
  periodo: string
  fim:     string
}

export function useRevisitasDetalhe(inicio: string, fim: string) {
  return useQuery<RevisitasDetalheData>({
    queryKey:        ['revisitas-detalhe', inicio, fim],
    queryFn:         () => api.get<RevisitasDetalheData>(`/revisitas-detalhe?inicio=${inicio}&fim=${fim}`),
    staleTime:       5 * 60_000,
    gcTime:          10 * 60_000,
    retry:           1,
    enabled:         !!inicio && !!fim,
    placeholderData: (prev) => prev,
  })
}
