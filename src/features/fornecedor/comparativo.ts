// Comparação com o período anterior. A regra que não é óbvia: fornecedor sem
// histórico devolve null, não o próprio valor. Mostrar "+87" para quem começou
// agora sugere uma melhora que nunca existiu — e é exatamente esse número que
// alguém leva para a renegociação de contrato.

export interface RankingSlim {
  fornKey: string
  sla:     number
}

/** Índice fornKey → SLA do período anterior. */
export function indexarSlaAnterior(anterior: RankingSlim[]): Record<string, number> {
  const idx: Record<string, number> = {}
  for (const f of anterior) idx[f.fornKey] = f.sla
  return idx
}

/** Variação em pontos percentuais, ou null quando não há base de comparação. */
export function variacaoSla(atual: number, anterior: number | undefined): number | null {
  if (anterior == null) return null
  return atual - anterior
}

/** Rótulo com sinal explícito. O zero é "=", não "+0" — estável é uma leitura,
 *  não uma variação de zero ponto. */
export function rotuloVariacao(delta: number | null): string | null {
  if (delta == null) return null
  if (delta === 0) return '='
  return delta > 0 ? `+${delta}` : `${delta}`
}
