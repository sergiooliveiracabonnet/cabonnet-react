import { useQuery, useQueryClient } from '@tanstack/react-query'
import { signalOccurrencesApi, ponTreatmentsApi, type SignalImport } from '../../lib/api'
import { parseSignalCsv, type SignalRow } from './nivelSinal'
import type { SignalOccurrence } from './signalOccurrenceModel'
import type { PonTreatment } from './ponTreatments'

const STALE_MS = 1000 * 60 * 5    // 5 minutos — ocorrências/tratativas podem mudar entre usuários
const GC_MS    = 1000 * 60 * 30   // 30 minutos
const ROWS_GC_MS = 1000 * 60 * 60 // 1h — o parse de ~23 mil linhas é caro, vale manter mais tempo

export const NIVEL_SINAL_KEYS = {
  ocorrencias: ['nivel-sinal', 'ocorrencias'] as const,
  tratadas: ['nivel-sinal', 'pons-tratadas'] as const,
  importLatest: ['nivel-sinal', 'import-latest'] as const,
  parsedRows: (importId: number | null) => ['nivel-sinal', 'parsed-rows', importId] as const,
}

/**
 * A página é lazy-loaded e desmonta ao trocar de rota. Sem isso, cada volta ao
 * menu baixava o CSV inteiro (alguns MB) e reparseava ~23 mil linhas do zero.
 * Guardar o resultado no cache do React Query (que vive fora do ciclo de vida
 * do componente) faz a volta ao menu ser instantânea enquanto o cache não expira.
 */
export function useNivelSinalData() {
  const queryClient = useQueryClient()

  const occurrencesQuery = useQuery({
    queryKey: NIVEL_SINAL_KEYS.ocorrencias,
    queryFn: () => signalOccurrencesApi.list<SignalOccurrence>(),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  })

  const treatmentsQuery = useQuery({
    queryKey: NIVEL_SINAL_KEYS.tratadas,
    queryFn: () => ponTreatmentsApi.list<PonTreatment>(),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  })

  const importQuery = useQuery({
    queryKey: NIVEL_SINAL_KEYS.importLatest,
    queryFn: () => signalOccurrencesApi.latestImport(),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  })

  const importItem: SignalImport | null = importQuery.data?.item ?? null

  const rowsQuery = useQuery({
    queryKey: NIVEL_SINAL_KEYS.parsedRows(importItem?.id ?? null),
    queryFn: () => parseSignalCsv(importItem!.csv_text, { includeNonAlerts: true }),
    enabled: importItem != null,
    staleTime: Infinity, // o CSV de um import_id já persistido nunca muda
    gcTime: ROWS_GC_MS,
  })

  const loadError = occurrencesQuery.isError ? 'Não foi possível carregar as ocorrências salvas no servidor.'
    : treatmentsQuery.isError ? 'Não foi possível carregar as PONs tratadas salvas no servidor.'
    : importQuery.isError ? 'Não foi possível carregar o último CSV importado no servidor.'
    : ''

  return {
    occurrences: occurrencesQuery.data?.items ?? [],
    treatments: treatmentsQuery.data?.items ?? [],
    allRows: (rowsQuery.data ?? []) as SignalRow[],
    fileName: importItem?.file_name ?? '',
    loadError,
    queryClient,
  }
}
