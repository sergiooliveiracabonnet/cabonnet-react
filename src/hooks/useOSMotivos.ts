import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { MotivosPorOS } from '../features/leitura/leituraMensal'

const LOTE = 4000

/** Motivo de abertura e ação da equipe de cada OS, lidos no servidor a partir do texto livre. */
export function useOSMotivos(numos: string[]) {
  const chave = [...numos].sort().join(',')
  return useQuery({
    queryKey: ['os-motivos', chave],
    queryFn: async () => {
      const itens: MotivosPorOS = {}
      for (let i = 0; i < numos.length; i += LOTE) {
        const r = await api.post<{ ok: boolean; items: MotivosPorOS }>('/api/os-motivos', { numos: numos.slice(i, i + LOTE) })
        Object.assign(itens, r.items)
      }
      return itens
    },
    enabled: numos.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
