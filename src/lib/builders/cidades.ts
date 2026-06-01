import { isCOPE, isReagend, isConcluida } from '../transform'
import type { OSRow, KPI } from '../types'
import { avg } from './_helpers'

export function buildCidades(rows: OSRow[]) {
  const cidMap = new Map<string, { rows: OSRow[] }>()
  for (const r of rows) {
    const c = (r.nomedacidade || 'Desconhecida').trim()
    if (!cidMap.has(c)) cidMap.set(c, { rows: [] })
    cidMap.get(c)!.rows.push(r)
  }

  const lista = [...cidMap.entries()].map(([cidade, { rows: cr }]) => {
    const atend    = cr.filter(r => r.descsituacao === 'Atendimento' && !isCOPE(r) && !isReagend(r)).length
    const pend     = cr.filter(r => r.descsituacao === 'Pendente'    && !isCOPE(r) && !isReagend(r)).length
    const reagend  = cr.filter(r => isReagend(r) && ['Pendente','Atendimento'].includes(r.descsituacao)).length
    const concl    = cr.filter(r => isConcluida(r.descsituacao)).length
    const slaExc   = cr.filter(r => r._slaExcedido).length
    const criticas = cr.filter(r => r._slaCritico).length
    const semEq    = cr.filter(r => !r.nomedaequipe?.trim() && !isCOPE(r) && !isReagend(r)).length
    const agingArr = cr.filter(r => r._aging != null).map(r => r._aging as number)
    const agingMed = avg(agingArr)
    const total    = atend + pend + reagend
    const score    = criticas * 10 + slaExc * 5 + pend * 2 + atend + reagend
    const taxa     = (total + concl) > 0 ? Math.round(concl / (total + concl) * 100) : 0
    const status   = criticas > 0 ? 'critico' : slaExc > 0 ? 'alto' : agingMed > 5 ? 'medio' : 'baixo'
    return { cidade, total, atend, pend, reagend, concl, slaExc, criticas, semEq, agingMed, score, taxa, status }
  })

  const cidadesAtivas = lista.filter(c => c.total > 0)
  const cidadesCriticasCount = cidadesAtivas.filter(c => c.criticas > 0).length
  const cidadesForaSLACount  = cidadesAtivas.filter(c => c.slaExc  > 0).length
  const agingMedGeral = cidadesAtivas.length > 0
    ? Math.round(cidadesAtivas.reduce((s, c) => s + c.agingMed, 0) / cidadesAtivas.length)
    : 0
  const kpis: KPI[] = [
    { id: 'total',    title: 'Cidades Ativas',  value: cidadesAtivas.length,  sub: 'com OS em aberto',      accent: 'primary' },
    { id: 'criticas', title: 'Estado Crítico',  value: cidadesCriticasCount,  sub: 'com SLA 2× excedido',   accent: 'red'    },
    { id: 'foraSla',  title: 'Fora do SLA',     value: cidadesForaSLACount,   sub: 'com SLA excedido',      accent: 'orange' },
    { id: 'aging',    title: 'Aging Médio',     value: `${agingMedGeral}d`,   sub: 'média geral das filas', accent: agingMedGeral > 5 ? 'red' : agingMedGeral > 2 ? 'yellow' : 'green' },
  ]

  const todasCidades = [...cidadesAtivas].sort((a, b) => b.score - a.score)
  const ranking = [...lista].sort((a, b) => b.score - a.score).slice(0, 10)
    .map(c => ({ cidade: c.cidade, score: c.score, criticas: c.criticas, slaExc: c.slaExc, total: c.total }))
  const pendencias = cidadesAtivas
    .sort((a, b) => b.total - a.total).slice(0, 15)
    .map(c => ({ cidade: c.cidade, atend: c.atend, pend: c.pend, total: c.total, slaRisco: c.slaExc > 0 ? 'Alto' : 'Normal' }))
  const fila = [...cidadesAtivas]
    .sort((a, b) => b.agingMed - a.agingMed).slice(0, 15)
    .map(c => ({ cidade: c.cidade, emAberto: c.total, agingMed: c.agingMed, criticas: c.criticas, semEquipe: c.semEq }))
  const heatmap = lista.map(c => ({
    cidade: c.cidade, total: c.total,
    nivel:  c.criticas > 0 ? 'critico' : c.slaExc > 0 ? 'alto' : c.total > 10 ? 'medio' : 'baixo',
  }))
  const execucoes = [...lista].filter(c => c.concl > 0)
    .sort((a, b) => b.concl - a.concl).slice(0, 10)
    .map(c => ({ cidade: c.cidade, concluidas: c.concl, total: c.total + c.concl, taxa: c.taxa }))
  const consolidado = [...lista].sort((a, b) => (b.total + b.concl) - (a.total + a.concl)).slice(0, 15)
    .map(c => ({ cidade: c.cidade, total: c.total + c.concl, atend: c.atend, pend: c.pend, concl: c.concl, criticas: c.criticas }))

  return { ranking, pendencias, fila, heatmap, execucoes, consolidado, kpis, todasCidades }
}

// ─── Campo ────────────────────────────────────────────────────────────────────


