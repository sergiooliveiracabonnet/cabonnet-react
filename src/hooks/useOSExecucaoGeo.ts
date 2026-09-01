import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'

export interface OSExecucaoGeoPoint {
  numos:          string
  lat:            number
  lng:            number
  equipeagendada: string | null
}

export function parseExecucaoGeoRow(raw: Record<string, unknown>): OSExecucaoGeoPoint | null {
  const lat = parseFloat(String(raw.latitudeinicio ?? ''))
  const lng = parseFloat(String(raw.longitudeinicio ?? ''))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null
  return {
    numos:          String(raw.numos ?? ''),
    lat,
    lng,
    equipeagendada: (raw.equipeagendada as string) || null,
  }
}

export function useOSExecucaoGeo() {
  return useQuery({
    queryKey: ['os-execucao-geo'],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>[]>(endpoints.osExecucaoGeo)
      return raw.map(parseExecucaoGeoRow).filter((p): p is OSExecucaoGeoPoint => p !== null)
    },
    staleTime:       1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  })
}
