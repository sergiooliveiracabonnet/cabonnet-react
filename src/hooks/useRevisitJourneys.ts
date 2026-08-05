import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'
import type { BacklogRow } from './useBacklog'

export type LinkConfidence = 'high' | 'medium' | 'low' | 'unlinked'
export interface RevisitJourney {
  origin_os: string | null
  revisit_os: string
  recurrence: number
  link_basis: 'contract' | 'customer' | null
  link_confidence: LinkConfidence
  days_between: number | null
  same_team: boolean | null
  origin: BacklogRow | null
  revisit: BacklogRow
}
export interface RevisitJourneysData {
  journeys: RevisitJourney[]
  n: number
  linked: number
  unlinked: number
  periodo: string
  fim: string
  source: string
}

export function useRevisitJourneys(inicio: string, fim: string) {
  const hideRede = useUIStore(s => s.hideRede)
  return useQuery<RevisitJourneysData>({
    queryKey: ['revisit-journeys', inicio, fim, hideRede],
    queryFn: () => api.get(
      `/api/revisit-journeys?inicio=${inicio}&fim=${fim}${hideRede ? '&hide_rede=1' : ''}`,
    ),
    staleTime: 5 * 60_000,
    enabled: Boolean(inicio && fim),
    retry: 1,
  })
}
