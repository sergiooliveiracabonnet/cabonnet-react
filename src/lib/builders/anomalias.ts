import { isCOPE, isReagend } from '../transform'
import type { ClienteRecorrente, Composicao, DistItem, OSRow } from '../types'
import { avg, stdDev, topN } from './_helpers'

// Decompõe as OS de uma anomalia (bairro ou equipe) nas dimensões que já estão
// disponíveis em memória — sem isso, a análise de causa raiz (ai.py) só recebe
// contagem + Z-score e não tem como concluir nada, só "sugerir investigar".
function distTop(map: Map<string, number>, total: number, n = 3): DistItem[] {
  return topN(map, n).map(([nome, count]) => ({ nome, count, pct: total ? Math.round((count / total) * 100) : 0 }))
}

function buildComposicao(rows: OSRow[], outraDimensao: 'equipe' | 'bairro'): Composicao {
  const total   = rows.length
  const tipoMap = new Map<string, number>()
  const fornMap = new Map<string, number>()
  const cliMap  = new Map<string, { nomecliente: string; numos: string[] }>()
  const outMap  = new Map<string, number>()

  for (const r of rows) {
    const tipo = (r.tiposervico || '').trim() || 'Não informado'
    tipoMap.set(tipo, (tipoMap.get(tipo) ?? 0) + 1)

    const forn = (r._fornecedor as string) || 'OUTRO'
    fornMap.set(forn, (fornMap.get(forn) ?? 0) + 1)

    const cliKey = String(r.codigocliente || r.nomecliente || '').trim()
    if (cliKey) {
      const entry = cliMap.get(cliKey) ?? { nomecliente: (r.nomecliente || '').trim(), numos: [] }
      entry.numos.push(String(r.numos))
      cliMap.set(cliKey, entry)
    }

    const outKey = outraDimensao === 'equipe'
      ? ((r.nomedaequipe || '').trim() || 'Sem equipe')
      : ((r.bairro || '').trim() || 'Sem bairro')
    outMap.set(outKey, (outMap.get(outKey) ?? 0) + 1)
  }

  const clientesRecorrentes: ClienteRecorrente[] = [...cliMap.entries()]
    .filter(([, e]) => e.numos.length > 1)
    .sort((a, b) => b[1].numos.length - a[1].numos.length)
    .slice(0, 5)
    .map(([codigocliente, e]) => ({ codigocliente, nomecliente: e.nomecliente, count: e.numos.length, numos: e.numos }))

  return {
    tiposervicoTop:       distTop(tipoMap, total),
    fornecedorTop:        distTop(fornMap, total),
    clientesRecorrentes,
    outrasDimensoes:      distTop(outMap, total, 5),
    outrasDimensoesLabel: outraDimensao,
  }
}

export function buildAnomalias(rows: OSRow[]) {
  const base = rows.filter(r => !isCOPE(r) && !isReagend(r))

  const diaCnt = new Map<string, number>()
  for (const r of base) {
    const d = (r.datacadastro || '').split(' ')[0]
    if (d) diaCnt.set(d, (diaCnt.get(d) ?? 0) + 1)
  }
  const diaVals  = [...diaCnt.values()]
  const diaMean  = diaVals.length ? diaVals.reduce((a, b) => a + b, 0) / diaVals.length : 0
  const diaStd   = stdDev(diaVals)
  const picosDia = [...diaCnt.entries()]
    .filter(([, v]) => v > diaMean + 2 * diaStd && diaStd > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([date, count]) => ({ date, count, zScore: diaStd > 0 ? +(((count - diaMean) / diaStd).toFixed(1)) : 0 }))

  const bairroMap = new Map<string, { total: number; slaExc: number; rows: OSRow[] }>()
  for (const r of base) {
    const b = (r.bairro || '').trim()
    if (!b) continue
    if (!bairroMap.has(b)) bairroMap.set(b, { total: 0, slaExc: 0, rows: [] })
    const entry = bairroMap.get(b)!
    entry.total++
    if (r._slaExcedido) entry.slaExc++
    entry.rows.push(r)
  }
  const bairroRates = [...bairroMap.entries()]
    .filter(([, e]) => e.total >= 5)
    .map(([bairro, e]) => ({ bairro, total: e.total, slaExc: e.slaExc, rate: e.slaExc / e.total }))
  const bMean = bairroRates.length ? bairroRates.reduce((a, b) => a + b.rate, 0) / bairroRates.length : 0
  const bStd  = stdDev(bairroRates.map(b => b.rate))
  const bairrosAnomalia = bairroRates
    .filter(b => bStd > 0 && b.rate > bMean + 1.5 * bStd)
    .sort((a, b) => b.rate - a.rate).slice(0, 5)
    .map(b => ({
      ...b,
      ratePct:    Math.round(b.rate * 100),
      zScore:     +(((b.rate - bMean) / bStd).toFixed(1)),
      composicao: buildComposicao(bairroMap.get(b.bairro)!.rows, 'equipe'),
    }))

  const eqMap = new Map<string, { aging: number[]; rows: OSRow[] }>()
  for (const r of base) {
    if (r._aging == null) continue
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!eqMap.has(eq)) eqMap.set(eq, { aging: [], rows: [] })
    const entry = eqMap.get(eq)!
    entry.aging.push(r._aging)
    entry.rows.push(r)
  }
  const eqAging = [...eqMap.entries()]
    .filter(([, e]) => e.aging.length >= 3)
    .map(([nome, e]) => ({ nome, agingMed: avg(e.aging), count: e.aging.length }))
  const aMean = eqAging.length ? eqAging.reduce((a, b) => a + b.agingMed, 0) / eqAging.length : 0
  const aStd  = stdDev(eqAging.map(e => e.agingMed))
  const equipesAnomalia = eqAging
    .filter(e => aStd > 0 && e.agingMed > aMean + 1.5 * aStd)
    .sort((a, b) => b.agingMed - a.agingMed).slice(0, 5)
    .map(e => ({
      ...e,
      zScore:     +(((e.agingMed - aMean) / aStd).toFixed(1)),
      composicao: buildComposicao(eqMap.get(e.nome)!.rows, 'bairro'),
    }))

  return {
    total: picosDia.length + bairrosAnomalia.length + equipesAnomalia.length,
    picosDia,
    bairrosAnomalia,
    equipesAnomalia,
  }
}
