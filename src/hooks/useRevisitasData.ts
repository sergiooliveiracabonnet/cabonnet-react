import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'
import { parseCSV, enrichRows } from '../lib/transform'
import { useAuthStore } from '../store/authStore'

export function useRevisitasData() {
  const fornecedorKey = useAuthStore(s => s.fornecedorKey)
  const cluster = useAuthStore(s => s.cluster)
  // Mesmo motivo do useOSData: o servidor filtra /revisitas pelo cluster da
  // sessão, então o cache do React Query precisa ser por cluster também, senão
  // troca de usuário no mesmo navegador vaza o recorte do usuário anterior.
  const dataScope = `${fornecedorKey ? `fornecedor:${fornecedorKey}` : 'interno'}:${cluster}`
  const { data, isLoading, error } = useQuery({
    queryKey:  ['revisitas', dataScope],
    queryFn:   () => api.get(endpoints.revisitas),
    staleTime: 1000 * 60 * 5,
    retry:     2,
  })

  const revisitaRows = useMemo(() => {
    if (!data) return []
    const parsed = parseCSV((data as Record<string, string>).concluidas || '')
    const enriched = enrichRows(parsed)
    return fornecedorKey ? enriched.filter(row => row._fornecedor === fornecedorKey) : enriched
  }, [data, fornecedorKey])

  return { revisitaRows, isLoading, error }
}
