import { useQuery } from '@tanstack/react-query'
import { revisitaMotivos, type RevisitaMotivoDist, type RevisitaMotivoItem } from '../lib/api'

export interface RevisitaMotivosData {
  total:        number
  distribuicao: RevisitaMotivoDist[]
  itens:        RevisitaMotivoItem[]
}

// Causa raiz real de revisitas — classificada manualmente pelo operador no Telegram
// no momento em que o sistema detecta o retorno (não é estimativa nem inferência de IA).
export function useRevisitaMotivos(dias = 90) {
  return useQuery<RevisitaMotivosData>({
    queryKey: ['revisita-motivos', dias],
    queryFn:  async () => {
      const res = await revisitaMotivos.get(dias)
      return { total: res.total, distribuicao: res.distribuicao, itens: res.itens }
    },
    staleTime:            60_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })
}
