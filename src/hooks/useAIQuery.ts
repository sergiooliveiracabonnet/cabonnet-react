import { useQuery, type UseQueryResult } from '@tanstack/react-query'

/**
 * Resposta-padrão de qualquer endpoint /ai/*: traz `ok` e, opcionalmente, `cached`.
 * O backend devolve `{ ok: false }` quando a IA falha ou está desabilitada.
 */
interface AIResponse {
  ok?:     boolean
  cached?: boolean
}

const MIN = 60_000

interface UseAIQueryParams {
  /** queryKey completa, ex.: `['ai-campo', payload]`. O React Query faz hash
   *  determinístico por conteúdo, então pode-se passar o payload inline (sem
   *  useMemo nem chave-de-conteúdo manual) — mesmo conteúdo = mesma query, sem refetch. */
  key:        readonly unknown[]
  fn:         () => Promise<unknown>
  enabled:    boolean
  staleTime?: number
  gcTime?:    number
}

/**
 * Wrapper único para todas as consultas de IA. Centraliza o que era boilerplate
 * repetido em 12 hooks: `retry: false`, o `select` que descarta respostas `ok:false`,
 * e os tempos de cache padrão. Confia no hash de queryKey do React Query para
 * estabilidade — o que torna desnecessários os `useMemo` + `eslint-disable` que
 * cada hook mantinha (e que, em dois deles, deixavam o resultado stale).
 */
export function useAIQuery<T extends AIResponse>({
  key,
  fn,
  enabled,
  staleTime = 5 * MIN,
  gcTime    = 15 * MIN,
}: UseAIQueryParams): UseQueryResult<T | null, Error> {
  return useQuery<unknown, Error, T | null>({
    queryKey: key,
    queryFn:  fn,
    staleTime,
    gcTime,
    retry:    false,
    enabled,
    select:   (data) => {
      const d = data as AIResponse | null
      return d?.ok ? (d as T) : null
    },
  })
}
