// Forecast de demanda — regressão linear + sazonalidade por dia da semana.
// Antes disso, a "previsão" era o LLM olhando a série em texto e inventando 7
// números — sem modelo, sem intervalo de confiança, apresentado como se fosse
// cálculo. Isso é estatística de verdade, determinística e auditável; a IA
// (quando ligada) só explica o padrão, não gera os números.

export interface SeriePonto { data: string; abertas: number }
export interface ForecastDay { data: string; volume: number; confianca: 'alta' | 'media' | 'baixa' }
export interface ForecastResult {
  tendencia:     'crescente' | 'estável' | 'decrescente'
  previsao:      ForecastDay[]
  pico_previsto: { data: string; volume: number } | null
  r2:            number
}

function parseBR(d: string): Date | null {
  const [dd, mm, yyyy] = d.split('/')
  if (!dd || !mm || !yyyy) return null
  return new Date(+yyyy, +mm - 1, +dd)
}

function fmtBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Regressão linear simples (mínimos quadrados) — y = b0 + b1*x
function linearRegression(y: number[]): { b0: number; b1: number; r2: number } {
  const n = y.length
  const xs = y.map((_, i) => i)
  const xMean = xs.reduce((a, b) => a + b, 0) / n
  const yMean = y.reduce((a, b) => a + b, 0) / n

  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (y[i] - yMean)
    den += (xs[i] - xMean) ** 2
  }
  const b1 = den === 0 ? 0 : num / den
  const b0 = yMean - b1 * xMean

  let ssRes = 0, ssTot = 0
  for (let i = 0; i < n; i++) {
    const pred = b0 + b1 * xs[i]
    ssRes += (y[i] - pred) ** 2
    ssTot += (y[i] - yMean) ** 2
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot)
  return { b0, b1, r2 }
}

// Fator sazonal por dia da semana — média do dia / média geral. Precisa de pelo
// menos 2 semanas de histórico pra ser confiável; abaixo disso, neutraliza (fator 1).
function weekdayFactors(pontos: { date: Date; abertas: number }[]): number[] {
  const somaPorDow = Array(7).fill(0)
  const contPorDow = Array(7).fill(0)
  let somaTotal = 0
  for (const p of pontos) {
    somaPorDow[p.date.getDay()] += p.abertas
    contPorDow[p.date.getDay()]++
    somaTotal += p.abertas
  }
  const mediaGeral = somaTotal / pontos.length
  if (pontos.length < 14 || mediaGeral === 0) return Array(7).fill(1)
  return somaPorDow.map((soma, dow) => {
    const cont = contPorDow[dow]
    if (cont === 0) return 1
    return (soma / cont) / mediaGeral
  })
}

export function forecastDemand(serie: SeriePonto[], horizonte = 7): ForecastResult | null {
  const pontos = serie
    .map(p => ({ date: parseBR(p.data), abertas: p.abertas }))
    .filter((p): p is { date: Date; abertas: number } => p.date != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (pontos.length < 7) return null

  const y = pontos.map(p => p.abertas)
  const { b0, b1, r2 } = linearRegression(y)
  const fatores = weekdayFactors(pontos)

  const mediaRecente = y.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, y.length)
  const tendenciaPct = mediaRecente > 0 ? (b1 * 7) / mediaRecente : 0
  const tendencia: ForecastResult['tendencia'] =
    tendenciaPct > 0.10 ? 'crescente' : tendenciaPct < -0.10 ? 'decrescente' : 'estável'

  const confianca: ForecastDay['confianca'] =
    pontos.length >= 21 && r2 >= 0.3 ? 'alta' :
    pontos.length >= 14 ? 'media' : 'baixa'

  const lastDate = pontos[pontos.length - 1].date
  const previsao: ForecastDay[] = []
  for (let h = 1; h <= horizonte; h++) {
    const x = pontos.length - 1 + h
    const dt = new Date(lastDate)
    dt.setDate(dt.getDate() + h)
    const baseline = b0 + b1 * x
    const ajustado = Math.max(0, Math.round(baseline * fatores[dt.getDay()]))
    previsao.push({ data: fmtBR(dt), volume: ajustado, confianca })
  }

  const pico = previsao.reduce((max, d) => (d.volume > (max?.volume ?? -1) ? d : max), null as ForecastDay | null)
  const pico_previsto = pico ? { data: pico.data, volume: pico.volume } : null

  return { tendencia, previsao, pico_previsto, r2: Math.round(r2 * 100) / 100 }
}
