import { isExecucaoReal, isCOPE, isReagend } from '../transform'
import type { OSRow, KPI } from '../types'
import { avg, calcMTTR, type FornCard, FORN_CFG } from './_helpers'

export function buildDashboard(rows: OSRow[], allRows: OSRow[] = rows, prevRows: OSRow[] = []) {
  const isAtivo = (r: OSRow) => ['Pendente','Atendimento'].includes(r.descsituacao)
  const isRede  = (r: OSRow) => r._tipo === 'REDE'

  let pend = 0, atend = 0, redeCount = 0, criticas = 0, semEquipe = 0, reagend = 0
  let slaExcFila = 0, semAgendamento = 0
  const agingArr: number[] = []
  const agingDist = { '≤1d': 0, '2-3d': 0, '4-7d': 0, '8+d': 0 }
  const cidCritMap = new Map<string, number>()

  for (const r of allRows) {
    if (isReagend(r)) { if (isAtivo(r)) reagend++; continue }
    if (isCOPE(r)) continue
    if (!isAtivo(r)) continue
    if (isRede(r)) { redeCount++; continue }
    if (r._situacaoEfetiva === 'Pendente')    pend++
    if (r._situacaoEfetiva === 'Atendimento') atend++
    if (!r.nomedaequipe?.trim()) semEquipe++
    if (r._slaCritico) {
      criticas++
      const c = (r.nomedacidade || '').trim()
      if (c) cidCritMap.set(c, (cidCritMap.get(c) ?? 0) + 1)
    }
    if (r._slaExcedido || r._slaSemAgend) slaExcFila++
    if (!r.dataagendamento?.trim()) semAgendamento++
    if (r._aging != null) {
      agingArr.push(r._aging)
      const a = r._aging
      if      (a <= 1) agingDist['≤1d']++
      else if (a <= 3) agingDist['2-3d']++
      else if (a <= 7) agingDist['4-7d']++
      else             agingDist['8+d']++
    }
  }
  const total    = pend + atend
  const rede     = redeCount
  const agingMed = avg(agingArr)
  const slaFila  = total > 0 ? Math.round((total - slaExcFila) / total * 100) : 100
  const topCidadesCriticas = [...cidCritMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([cidade, count]) => ({ cidade, count }))

  // ─── Fluxo do dia: entradas vs saídas — ao vivo, ignora filtro de data ────
  const now     = new Date()
  const hojeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  let entradasHoje = 0, saidasHoje = 0
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if ((r.datacadastro || '').split(' ')[0] === hojeStr) entradasHoje++
    if (r._executadaHoje) saidasHoje++
  }
  const fluxoHoje = entradasHoje - saidasHoje

  let concl = 0, totalPeriodo = 0
  const fornMap = new Map<string, { total: number; concluidas: number }>()
  for (const r of rows) {
    if (isCOPE(r) || isReagend(r)) continue
    const k = r._fornecedor === 'OUTRO' ? null : r._fornecedor
    if (k) {
      if (!fornMap.has(k)) fornMap.set(k, { total: 0, concluidas: 0 })
      fornMap.get(k)!.total++
      if (isExecucaoReal(r.descsituacao)) fornMap.get(k)!.concluidas++
    }
    if (isRede(r)) continue
    totalPeriodo++
    if (isExecucaoReal(r.descsituacao)) concl++
  }
  const taxa = totalPeriodo > 0 ? Math.round(concl / totalPeriodo * 100) : 0

  let prevConcl = 0, prevTotalPeriodo = 0
  const prevFornMap = new Map<string, { total: number; concluidas: number }>()
  for (const r of prevRows) {
    const k = r._fornecedor === 'OUTRO' ? null : r._fornecedor
    if (k && !isCOPE(r) && !isReagend(r)) {
      if (!prevFornMap.has(k)) prevFornMap.set(k, { total: 0, concluidas: 0 })
      prevFornMap.get(k)!.total++
      if (isExecucaoReal(r.descsituacao)) prevFornMap.get(k)!.concluidas++
    }
    if (isCOPE(r) || isReagend(r) || isRede(r)) continue
    prevTotalPeriodo++
    if (isExecucaoReal(r.descsituacao)) prevConcl++
  }
  const prevTaxa = prevTotalPeriodo > 0 ? Math.round(prevConcl / prevTotalPeriodo * 100) : 0

  const mttr       = calcMTTR(rows)
  const mttrScore  = Math.max(0, 100 - mttr * 8)
  const scorePulso = total > 0
    ? Math.min(100, Math.round(slaFila * 0.45 + taxa * 0.35 + mttrScore * 0.20))
    : 0
  const scorePulsoLabel = scorePulso >= 85 ? 'Excelente' : scorePulso >= 70 ? 'Bom' : scorePulso >= 50 ? 'Regular' : 'Crítico'

  type InsightLevel = 'red' | 'orange' | 'yellow' | 'green'
  const quickInsights: { level: InsightLevel; text: string }[] = []
  if (criticas > 0)
    quickInsights.push({ level: 'red',    text: `${criticas} OS crítica${criticas !== 1 ? 's' : ''} — SLA 2× excedido` })
  else
    quickInsights.push({ level: 'green',  text: 'Nenhuma OS com SLA crítico' })
  if (slaFila < 75)
    quickInsights.push({ level: 'red',    text: `SLA da fila: ${slaFila}% — abaixo da meta` })
  else if (slaFila < 90)
    quickInsights.push({ level: 'yellow', text: `SLA da fila: ${slaFila}% — atenção` })
  else
    quickInsights.push({ level: 'green',  text: `SLA da fila: ${slaFila}%` })
  if (semEquipe > 0)
    quickInsights.push({ level: 'orange', text: `${semEquipe} OS sem equipe atribuída` })
  if (semAgendamento > 5)
    quickInsights.push({ level: 'yellow', text: `${semAgendamento} OS sem agendamento` })

  const narrativaPulso = [
    `${total} OS ativa${total !== 1 ? 's' : ''}`,
    `${criticas} crítica${criticas !== 1 ? 's' : ''}`,
    `SLA ${slaFila}%`,
    mttr > 0 ? `MTTR ${mttr}d` : null,
    `${taxa}% concluídas no período`,
  ].filter(Boolean).join(' · ')

  const clusterBairroMap = new Map<string, { bairro: string; cidade: string; total: number }>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isRede(r)) continue
    if (!isAtivo(r)) continue
    if (r._agingAbertura == null || r._agingAbertura > 1) continue
    const b = (r.bairro || '').trim()
    const c = (r.nomedacidade || '').trim()
    if (!b) continue
    const key = `${b}|${c}`
    if (!clusterBairroMap.has(key)) clusterBairroMap.set(key, { bairro: b, cidade: c, total: 0 })
    clusterBairroMap.get(key)!.total++
  }
  const clustersAtivos = [...clusterBairroMap.values()]
    .filter(cl => cl.total >= 4)
    .sort((a, b) => b.total - a.total)

  const pulso = {
    score: scorePulso, scoreLabel: scorePulsoLabel,
    narrativa: narrativaPulso, quickInsights,
    agingMed, agingDist, slaFila, semAgendamento, mttr,
    topCidadesCriticas, clustersAtivos,
    entradasHoje, saidasHoje, fluxoHoje,
  }

  const mkTrend = (cur: number, prev: number, higherIsBetter = true) => {
    if (!prev) return null
    const delta = cur - prev
    const pct   = Math.round(Math.abs(delta) / prev * 100)
    return { delta, pct, higherIsBetter }
  }

  const kpis: KPI[] = [
    { id: 'criticas', title: 'OS Críticas',      value: criticas,   sub: 'SLA 2× excedido',               accent: 'red'    },
    { id: 'semEq',    title: 'Sem Equipe',        value: semEquipe,  sub: 'pendente atribuição',            accent: 'orange' },
    { id: 'pend',     title: 'Pendentes',         value: pend,       sub: 'aguardando campo',               accent: 'yellow' },
    { id: 'atend',    title: 'Em Atendimento',    value: atend,      sub: 'em campo + agend. futuro',       accent: 'cyan'   },
    { id: 'reagend',  title: 'Reagendamentos',      value: reagend,    sub: 'aguardando rescheduling',        accent: 'orange' },
    { id: 'total',    title: 'Total OS',          value: total,      sub: 'fila ativa (pend. + atend.)',    accent: 'primary'},
    { id: 'rede',     title: 'OS Rede',           value: rede,       sub: 'fila ativa de rede',             accent: 'purple' },
    { id: 'concl',    title: 'Concluídas',        value: concl,      sub: `${taxa}% de conclusão`,          accent: 'green', trend: mkTrend(concl, prevConcl, true) },
    { id: 'taxa',     title: 'Taxa Conclusão',    value: `${taxa}%`, sub: 'do total do período',            accent: 'green', trend: mkTrend(taxa, prevTaxa, true) },
  ]

  const fornecedores: FornCard[] = [...fornMap.entries()]
    .map(([k, { total: t, concluidas: c }]) => {
      const sla = t > 0 ? Math.round(c / t * 100) : 0
      const prevF = prevFornMap.get(k)
      const prevSla = prevF && prevF.total > 0 ? Math.round(prevF.concluidas / prevF.total * 100) : 0
      return {
        nome: FORN_CFG[k]?.label ?? k, total: t, concluidas: c, sla,
        cor: FORN_CFG[k]?.cor ?? '#64748b',
        slaTrend: mkTrend(sla, prevSla, true),
      }
    })
    .filter(f => f.total > 0)
    .sort((a, b) => b.total - a.total)

  return { kpis, fornecedores, pulso }
}

// ─── SLA ──────────────────────────────────────────────────────────────────────


