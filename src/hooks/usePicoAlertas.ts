import { useQuery, useQueryClient } from '@tanstack/react-query'
import { picoAlertas } from '../lib/api'

export interface PicoAlerta {
  id:        number
  data:      string   // YYYY-MM-DD
  count_os:  number
  zscore:    number
  status:    'pending' | 'dismissed' | 'justified'
  criado_em: string
}

const QK = ['pico-alertas']

export function usePicoAlertas() {
  return useQuery<PicoAlerta[]>({
    queryKey:        QK,
    queryFn:         async () => {
      const res = await picoAlertas.list()
      return res.items as PicoAlerta[]
    },
    staleTime:       2 * 60_000,
    refetchInterval: 5 * 60_000,   // polling a cada 5 min
    refetchOnWindowFocus: true,
  })
}

export function usePicoAlertasActions() {
  const qc = useQueryClient()

  const dismiss = async (id: number) => {
    await picoAlertas.dismiss(id)
    qc.setQueryData<PicoAlerta[]>(QK, old => (old ?? []).filter(a => a.id !== id))
  }

  const markJustified = async (id: number) => {
    await picoAlertas.justified(id)
    qc.setQueryData<PicoAlerta[]>(QK, old => (old ?? []).filter(a => a.id !== id))
  }

  return { dismiss, markJustified }
}
