import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motivoEncerramento, type MotivoEncerramentoItem } from '../lib/api'

export function useMotivoEncerramento(numos: string | undefined) {
  const qc = useQueryClient()

  const query = useQuery<MotivoEncerramentoItem | null>({
    queryKey: ['motivo-encerramento', numos],
    queryFn:  async () => {
      const res = await motivoEncerramento.get(numos!)
      return res.item
    },
    enabled:              !!numos,
    staleTime:            60_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })

  async function classificar(motivo: string, extra?: { observacao?: string; nomedaequipe?: string; nomedacidade?: string }) {
    if (!numos) return
    await motivoEncerramento.save({ numos, motivo, ...extra })
    await qc.invalidateQueries({ queryKey: ['motivo-encerramento', numos] })
    await qc.invalidateQueries({ queryKey: ['revisita-motivos'] })
  }

  return { ...query, classificar }
}
