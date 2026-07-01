import { useQuery, useQueryClient } from '@tanstack/react-query'
import { tecnicos, type TecnicoItem } from '../lib/api'

const QK = ['tecnicos']

export function useTecnicos() {
  return useQuery<TecnicoItem[]>({
    queryKey:             QK,
    queryFn:              async () => (await tecnicos.list()).items,
    staleTime:            60_000,
    retry:                1,
    refetchOnWindowFocus: false,
  })
}

export function useTecnicosActions() {
  const qc = useQueryClient()

  const upsert = async (body: { codigo: string; nome_real?: string; contato?: string; ativo?: boolean }) => {
    await tecnicos.upsert(body)
    await qc.invalidateQueries({ queryKey: QK })
  }

  const remove = async (codigo: string) => {
    await tecnicos.remove(codigo)
    await qc.invalidateQueries({ queryKey: QK })
  }

  return { upsert, remove }
}
