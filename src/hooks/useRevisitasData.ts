import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'
import { parseCSV, enrichRows } from '../lib/transform'

export function useRevisitasData() {
  const { data, isLoading, error } = useQuery({
    queryKey:  ['revisitas'],
    queryFn:   () => api.get(endpoints.revisitas),
    staleTime: 1000 * 60 * 5,
    retry:     2,
  })

  const revisitaRows = useMemo(() => {
    if (!data) return []
    const parsed = parseCSV((data as Record<string, string>).concluidas || '')
    return enrichRows(parsed)
  }, [data])

  return { revisitaRows, isLoading, error }
}
