import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { escala, type EscalaItem } from '../lib/api'
import { ESCALA_EQUIPES } from '../features/erp/escala/escalaConstants'

const QK = (dias: string[]) => ['escala', dias.join(',')]
const QK_EQUIPES = ['escala-equipes']

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

/** Equipes da escala: o roster completo menos as desabilitadas. `equipes` é o que
 *  as telas mostram; `todas` serve para o painel de gerenciamento. */
export function useEscalaEquipes() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<string[]>({
    queryKey:             QK_EQUIPES,
    queryFn:              async () => (await escala.equipesInativas()).inativas,
    staleTime:            30_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })
  const inativas = useMemo(() => new Set(data ?? []), [data])
  const equipes  = useMemo(() => ESCALA_EQUIPES.filter(e => !inativas.has(e.codigo)), [inativas])

  const setAtiva = async (codigo: string, ativo: boolean) => {
    await escala.setEquipeAtiva(codigo, ativo)
    await qc.invalidateQueries({ queryKey: QK_EQUIPES })
  }

  return { equipes, todas: ESCALA_EQUIPES, inativas, isLoading, setAtiva }
}
