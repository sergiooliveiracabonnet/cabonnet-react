import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface ObservationItem { observacoes: string; observacaocritica: string }

export function useReincidenciaDetails(numos: string[]) {
  return useQuery({
    queryKey: ['reincidencias-observacoes', numos],
    queryFn: () => api.post<{ ok: boolean; items: Record<string, ObservationItem> }>('/api/os-observacoes', { numos }),
    enabled: numos.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
    select: response => response.items,
  })
}
