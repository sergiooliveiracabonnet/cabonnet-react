import { useQuery, useQueryClient } from '@tanstack/react-query'
import { escala, type EscalaItem } from '../lib/api'

const QK = (dias: string[]) => ['escala', dias.join(',')]

export function useEscalaSemana(dias: string[]) {
  return useQuery<EscalaItem[]>({
    queryKey:             QK(dias),
    queryFn:              async () => (await escala.list(dias)).items,
    enabled:              dias.length > 0,
    staleTime:            30_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })
}

export function useEscalaActions(dias: string[]) {
  const qc = useQueryClient()

  const setStatus = async (body: { team_code: string; dia: string; local1?: string; local2?: string }) => {
    await escala.save(body)
    await qc.invalidateQueries({ queryKey: QK(dias) })
  }

  return { setStatus }
}
