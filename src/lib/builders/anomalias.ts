import { isCOPE, isReagend } from '../transform'
import type { OSRow } from '../types'
import { avg, stdDev } from './_helpers'

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

  const bairroMap = new Map<string, { total: number; slaExc: number }>()
  for (const r of base) {
    const b = (r.bairro || '').trim()
    if (!b) continue
    if (!bairroMap.has(b)) bairroMap.set(b, { total: 0, slaExc: 0 })
    bairroMap.get(b)!.total++
    if (r._slaExcedido) bairroMap.get(b)!.slaExc++
  }
  const bairroRates = [...bairroMap.entries()]
    .filter(([, e]) => e.total >= 5)
    .map(([bairro, e]) => ({ bairro, total: e.total, slaExc: e.slaExc, rate: e.slaExc / e.total }))
  const bMean = bairroRates.length ? bairroRates.reduce((a, b) => a + b.rate, 0) / bairroRates.length : 0
  const bStd  = stdDev(bairroRates.map(b => b.rate))
  const bairrosAnomalia = bairroRates
    .filter(b => bStd > 0 && b.rate > bMean + 1.5 * bStd)
    .sort((a, b) => b.rate - a.rate).slice(0, 5)
    .map(b => ({ ...b, ratePct: Math.round(b.rate * 100), zScore: +((( b.rate - bMean) / bStd).toFixed(1)) }))

  const eqMap = new Map<string, number[]>()
  for (const r of base) {
    if (r._aging == null) continue
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!eqMap.has(eq)) eqMap.set(eq, [])
    eqMap.get(eq)!.push(r._aging)
  }
  const eqAging = [...eqMap.entries()]
    .filter(([, arr]) => arr.length >= 3)
    .map(([nome, arr]) => ({ nome, agingMed: avg(arr), count: arr.length }))
  const aMean = eqAging.length ? eqAging.reduce((a, b) => a + b.agingMed, 0) / eqAging.length : 0
  const aStd  = stdDev(eqAging.map(e => e.agingMed))
  const equipesAnomalia = eqAging
    .filter(e => aStd > 0 && e.agingMed > aMean + 1.5 * aStd)
    .sort((a, b) => b.agingMed - a.agingMed).slice(0, 5)
    .map(e => ({ ...e, zScore: +((( e.agingMed - aMean) / aStd).toFixed(1)) }))

  return {
    total: picosDia.length + bairrosAnomalia.length + equipesAnomalia.length,
    picosDia,
    bairrosAnomalia,
    equipesAnomalia,
  }
}
