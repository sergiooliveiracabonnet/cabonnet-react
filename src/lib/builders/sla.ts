import { isCOPE, isReagend } from '../transform'
import type { OSRow } from '../types'
import { avg, shortName } from './_helpers'

export function buildSla(rows: OSRow[]) {
  const base = rows.filter(r => !isCOPE(r) && !isReagend(r))

  const eqMap = new Map<string, { rows: OSRow[]; tipo: string }>()
  for (const r of base) {
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!eqMap.has(eq)) eqMap.set(eq, { rows: [], tipo: r._tipo || 'OUTRO' })
    eqMap.get(eq)!.rows.push(r)
  }

  const equipes: { nome: string; tipo: string; sla: number; total: number; criticas: number; agingMed: number }[] = []
  for (const [nome, { rows: er, tipo }] of eqMap) {
    const active   = er.filter(r => ['Atendimento', 'Pendente'].includes(r.descsituacao))
    if (active.length === 0) continue
    const slaExc   = active.filter(r => r._slaExcedido).length
    const criticas = active.filter(r => r._slaCritico).length
    const sla      = Math.round((active.length - slaExc) / active.length * 100)
    const agingArr = active.filter(r => r._aging != null).map(r => r._aging as number)
    equipes.push({ nome, tipo, sla, total: active.length, criticas, agingMed: avg(agingArr) })
  }
  equipes.sort((a, b) => a.sla - b.sla)

  const ok      = equipes.filter(e => e.sla >= 90).length
  const atencao = equipes.filter(e => e.sla >= 75 && e.sla < 90).length
  const fora    = equipes.filter(e => e.sla < 75).length
  const crit    = equipes.filter(e => e.criticas > 0).length
  const score   = equipes.length ? Math.round(equipes.reduce((s, e) => s + e.sla, 0) / equipes.length) : 0
  const scoreLabel = score >= 90 ? 'Excelente' : score >= 75 ? 'Bom' : score >= 50 ? 'Regular' : 'Crítico'

  const slaExcTotal = base.filter(r => r._slaExcedido).length
  const semAgend    = base.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao) && !r.dataagendamento?.trim()).length
  const pior        = equipes[0]

  const hipoteses = [
    { pergunta: 'Qual equipe tem maior risco de SLA?', resposta: pior?.nome ?? '—', sub: pior ? `${pior.sla}% SLA · ${pior.criticas} críticas` : null },
    { pergunta: 'Quantas OS estão fora do SLA?', resposta: String(slaExcTotal), sub: `${Math.round(slaExcTotal / (base.length || 1) * 100)}% do total ativo` },
    { pergunta: 'OS sem data de agendamento', resposta: String(semAgend), sub: semAgend > 0 ? 'precisam ser agendadas' : 'Todas agendadas ✓' },
  ]

  const statuses  = ['Pendente','Atendimento','Concluída','Concluída/Sem Execução']
  const totalBase = base.length
  const resumo = statuses
    .map(s => ({ status: s, total: base.filter(r => r.descsituacao === s).length, pct: totalBase > 0 ? Math.round(base.filter(r => r.descsituacao === s).length / totalBase * 100) : 0 }))
    .filter(r => r.total > 0)

  const ranking  = [...equipes].sort((a, b) => b.sla - a.sla).slice(0, 5)
  const semaforo = equipes.map(e => ({ nome: e.nome, tipo: e.tipo, sla: e.sla, total: e.total, criticas: e.criticas }))

  const topAging = [...equipes].sort((a, b) => b.agingMed - a.agingMed).slice(0, 10)
  const agingEq  = { labels: topAging.map(e => shortName(e.nome)), values: topAging.map(e => e.agingMed) }

  const clusterMap = new Map<string, number>()
  for (const r of base.filter(r => r._slaExcedido)) {
    const b = (r.bairro || '').trim()
    const c = (r.nomedacidade || '').trim()
    if (!b) continue
    const key = `${b}|${c}`
    clusterMap.set(key, (clusterMap.get(key) ?? 0) + 1)
  }
  const clusters = [...clusterMap.entries()]
    .map(([k, t]) => { const [bairro, cidade] = k.split('|'); return { bairro, cidade, total: t } })
    .sort((a, b) => b.total - a.total).slice(0, 10)

  const narrativa = `${ok} equipe(s) no SLA · ${fora} abaixo da meta · ${crit} com OS críticas`

  return {
    pulso: { narrativa, ok, atencao, fora, criticas: crit, score, scoreLabel },
    hipoteses, resumo, ranking, agingEq, semaforo, clusters,
  }
}

// ─── Capacidade ───────────────────────────────────────────────────────────────



