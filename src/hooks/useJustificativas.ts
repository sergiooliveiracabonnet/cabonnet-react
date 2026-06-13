import { useQuery, useQueryClient } from '@tanstack/react-query'
import { justificativas } from '../lib/api'

export interface JustificativaRecord {
  id:              number
  data_pico:       string
  periodo_inicio:  string
  periodo_fim:     string
  count_os:        number
  zscore:          number | null
  contexto_real:   string
  causa_principal: string
  impacto:         string
  contexto_ia:     string
  acoes:           string[]
  recomendacao:    string
  criado_em:       string
}

const QK = ['justificativas']

export function useJustificativas() {
  return useQuery<JustificativaRecord[]>({
    queryKey:  QK,
    queryFn:   async () => {
      const res = await justificativas.list()
      return res.items as JustificativaRecord[]
    },
    staleTime: 60_000,
  })
}

export function useJustificativasActions() {
  const qc = useQueryClient()

  const save = async (body: {
    data_pico:      string
    periodo_inicio: string
    periodo_fim:    string
    count_os:       number
    zscore?:        number | null
    contexto_real?: string
    ia_result?:     unknown
  }) => {
    const res = await justificativas.save(body)
    await qc.invalidateQueries({ queryKey: QK })
    return res
  }

  const remove = async (id: number) => {
    await justificativas.delete(id)
    await qc.invalidateQueries({ queryKey: QK })
  }

  return { save, remove }
}
