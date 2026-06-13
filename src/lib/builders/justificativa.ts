import { isCOPE, isReagend } from '../transform'
import type { OSRow } from '../types'
import { stdDev } from './_helpers'

export interface PicoDia {
  date:   string
  count:  number
  zScore: number
}

export interface ClusterBairro {
  bairro:    string
  cidade:    string
  total:     number
  redeTotal: number
}

export interface OsRedeDia {
  date:  string
  count: number
}

export interface JustificativaData {
  picosDia:       PicoDia[]
  bairrosAnomalia: Array<{ bairro: string; total: number; slaExc: number; ratePct: number; zScore: number }>
  clustersAtivos:  ClusterBairro[]
  osRedePorDia:    OsRedeDia[]
  totalRede:       number
  mediaAberturas:  number
  periodoLabel:    string
}

export function buildJustificativa(rows: OSRow[], allRows: OSRow[] = rows): JustificativaData {
  const isAtivo = (r: OSRow) => ['Pendente', 'Atendimento'].includes(r.descsituacao)
  const isRede  = (r: OSRow) => r._tipo === 'REDE'

  // ─── Picos de abertura (Z-score sobre datacadastro) ─────────────────────────
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
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([date, count]) => ({
      date,
      count,
      zScore: diaStd > 0 ? +(((count - diaMean) / diaStd).toFixed(1)) : 0,
    }))

  // ─── Bairros com SLA anômalo ────────────────────────────────────────────────
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
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)
    .map(b => ({
      bairro:   b.bairro,
      total:    b.total,
      slaExc:   b.slaExc,
      ratePct:  Math.round(b.rate * 100),
      zScore:   +((( b.rate - bMean) / bStd).toFixed(1)),
    }))

  // ─── Clusters ativos (≥3 OS ativas/bairro — indício de rompimento/evento) ──
  const clusterMap = new Map<string, ClusterBairro>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (!isAtivo(r)) continue
    const b = (r.bairro || '').trim()
    const c = (r.nomedacidade || '').trim()
    if (!b) continue
    const key = `${b}|${c}`
    if (!clusterMap.has(key)) clusterMap.set(key, { bairro: b, cidade: c, total: 0, redeTotal: 0 })
    const cl = clusterMap.get(key)!
    cl.total++
    if (isRede(r)) cl.redeTotal++
  }
  const clustersAtivos = [...clusterMap.values()]
    .filter(cl => cl.total >= 3)
    .sort((a, b) => b.total - a.total)

  // ─── OS REDE por dia (evidência de rompimento) ──────────────────────────────
  const redeDia = new Map<string, number>()
  for (const r of allRows) {
    if (!isRede(r)) continue
    const d = (r.datacadastro || '').split(' ')[0]
    if (d) redeDia.set(d, (redeDia.get(d) ?? 0) + 1)
  }
  const osRedePorDia = [...redeDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))
  const totalRede = [...redeDia.values()].reduce((a, b) => a + b, 0)

  return {
    picosDia,
    bairrosAnomalia,
    clustersAtivos,
    osRedePorDia,
    totalRede,
    mediaAberturas: Math.round(diaMean * 10) / 10,
    periodoLabel:   '',
  }
}
