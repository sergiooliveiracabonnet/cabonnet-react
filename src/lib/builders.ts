import { shortEquipe } from './osFormat'
import {
  isConcluida, isExecucaoReal, isCOPE, isReagend, isCidadeValida,
  parseDate,
} from './transform'
import type { OSRow, Fornecedor } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

// MTTR — Tempo médio de resolução (datacadastro → databaixa/dataexecucao) em dias
function calcMTTR(rows: OSRow[]): number {
  const times: number[] = []
  for (const r of rows) {
    if (!isConcluida(r.descsituacao)) continue
    const ab = parseDate(r.datacadastro)
    const bx = parseDate(r.databaixa) || parseDate(r.dataexecucao)
    if (!ab || !bx) continue
    const d = Math.floor((bx.getTime() - ab.getTime()) / 86400000)
    if (d >= 0 && d <= 90) times.push(d)
  }
  return avg(times)
}

// Score composto 0—100: SLA 45% + MTTR 35% + Conclusão 20%
function scoreComposto(sla: number, conclPct: number, mttr: number): number {
  const mttrScore = Math.max(0, 100 - mttr * 8)
  return Math.min(100, Math.round(sla * 0.45 + mttrScore * 0.35 + conclPct * 0.20))
}

// Desvio padrão para detecção de anomalias
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

const shortName = shortEquipe

function topN(map: Map<string, number>, n = 10): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type AccentColor = 'red' | 'orange' | 'yellow' | 'cyan' | 'primary' | 'purple' | 'green'

interface KPI {
  id:     string
  title:  string
  value:  number | string
  sub:    string
  accent: AccentColor
  trend?: { delta: number; pct: number; higherIsBetter: boolean } | null
  meta?:  number
}

interface FornCard {
  nome:      string
  total:     number
  concluidas: number
  sla:       number
  cor:       string
}

const FORN_CFG: Record<string, { label: string; cor: string }> = {
  WES:        { label: 'WES',        cor: '#c4b5fd' },
  Instacable: { label: 'Instacable', cor: '#facc15' },
  THM:        { label: 'THM',        cor: '#22d3ee' },
  REDE:       { label: 'Rede',       cor: '#4ade80' },
  MANUTENCAO: { label: 'Manutenção', cor: '#f97316' },
  INSTALACAO: { label: 'Instalação', cor: '#3b82f6' },
  INTERNO:    { label: 'Interno',    cor: '#94a3b8' },
}

// allRows  = dataset completo sem filtro de data (para fila ativa real)
// rows     = dataset filtrado por período (para analytics do período)
// prevRows = mesmo período, janela anterior (para indicadores de tendência)
export function buildDashboard(rows: OSRow[], allRows: OSRow[] = rows, prevRows: OSRow[] = []) {
  const isAtivo = (r: OSRow) => ['Pendente','Atendimento'].includes(r.descsituacao)
  const isRede  = (r: OSRow) => r._tipo === 'REDE'

  let pend = 0, atend = 0, redeCount = 0, criticas = 0, semEquipe = 0
  let slaExcFila = 0, semAgendamento = 0
  const agingArr: number[] = []
  const agingDist = { '≤1d': 0, '2-3d': 0, '4-7d': 0, '8+d': 0 }
  const cidCritMap = new Map<string, number>()

  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
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
  for (const r of prevRows) {
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
    { id: 'total',    title: 'Total OS',          value: total,      sub: 'fila ativa (pend. + atend.)',    accent: 'primary'},
    { id: 'rede',     title: 'OS Rede',           value: rede,       sub: 'fila ativa de rede',             accent: 'purple' },
    { id: 'concl',    title: 'Concluídas',        value: concl,      sub: `${taxa}% de conclusão`,          accent: 'green', trend: mkTrend(concl, prevConcl, true) },
    { id: 'taxa',     title: 'Taxa Conclusão',    value: `${taxa}%`, sub: 'do total do período',            accent: 'green', trend: mkTrend(taxa, prevTaxa, true) },
  ]

  const fornecedores: FornCard[] = [...fornMap.entries()]
    .map(([k, { total: t, concluidas: c }]) => ({
      nome: FORN_CFG[k]?.label ?? k, total: t, concluidas: c,
      sla: t > 0 ? Math.round(c / t * 100) : 0,
      cor: FORN_CFG[k]?.cor ?? '#64748b',
    }))
    .filter(f => f.total > 0)
    .sort((a, b) => b.total - a.total)

  return { kpis, fornecedores, pulso }
}

// ─── Ordens ───────────────────────────────────────────────────────────────────

export function buildOrdens(rows: OSRow[]) {
  const tipos    = [...new Set(rows.map(r => r.tiposervico).filter(Boolean))].sort()
  const cidades  = [...new Set(rows.map(r => (r.nomedacidade || '').trim()).filter(isCidadeValida))].sort()
  const equipes  = [...new Set(rows.map(r => r.nomedaequipe).filter(Boolean))].sort()
  const bairros  = [...new Set(rows.map(r => r.bairro).filter(Boolean))].sort()
  const periodos = [...new Set(rows.map(r => (r.periodo || '').trim()).filter(Boolean))].sort()
  return { ordens: rows, options: { tipos, cidades, equipes, bairros, periodos } }
}

// ─── SLA ──────────────────────────────────────────────────────────────────────

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

interface CapacidadeOpts {
  metaInst?:   number
  metaManut?:  number
  metaServ?:   number
  dateFilter?: { from?: Date | null; to?: Date | null } | null
}

export function buildCapacidade(rows: OSRow[], opts: CapacidadeOpts = {}, allRows: OSRow[] = rows) {
  const { metaInst = 25, metaManut = 35, metaServ = 20, dateFilter } = opts

  const periodDays = (() => {
    const { from, to } = dateFilter ?? {}
    if (!from || !to) return 30
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
    return Math.max(1, days)
  })()

  const baseAll   = allRows.filter(r => !isCOPE(r) && !isReagend(r))
  const conclHoje = baseAll.filter(r => r._executadaHoje)

  const instConclHoje  = conclHoje.filter(r => r._categoria === 'INSTALACAO').length
  const manutConclHoje = conclHoje.filter(r => r._categoria === 'VT_MANUTENCAO').length
  const servConclHoje  = conclHoje.filter(r => r._categoria === 'SERVICO').length
  const totalExec      = conclHoje.length
  const metaTotalHoje  = metaInst + metaManut + metaServ
  const taxaDia        = metaTotalHoje > 0 ? Math.round(totalExec / metaTotalHoje * 100) : 0

  const base      = rows.filter(r => !isCOPE(r) && !isReagend(r))
  const fila      = base.filter(r => ['Pendente','Atendimento'].includes(r.descsituacao))
  const filaTotal = fila.length

  const eqMap = new Map<string, { total: number; concluidas: number; fila: number }>()
  for (const r of base) {
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!eqMap.has(eq)) eqMap.set(eq, { total: 0, concluidas: 0, fila: 0 })
    const e = eqMap.get(eq)!
    e.total++
    if (isExecucaoReal(r.descsituacao)) e.concluidas++
    if (['Pendente','Atendimento'].includes(r.descsituacao)) e.fila++
  }

  const equipes = [...eqMap.entries()]
    .map(([nome, { total: t, concluidas: c, fila: f }]) => {
      const ritmoDia = parseFloat((c / periodDays).toFixed(1))
      return {
        nome: shortName(nome), total: t, concluidas: c, fila: f,
        taxa: t > 0 ? Math.round(c / t * 100) : 0,
        ritmoDia,
      }
    })
    .sort((a, b) => b.total - a.total)

  const totalConclPeriodo = equipes.reduce((s, e) => s + e.concluidas, 0)
  const ritmoGlobalDia    = totalConclPeriodo / periodDays
  const prevDias: number | string = ritmoGlobalDia > 0 ? Math.round(filaTotal / ritmoGlobalDia) : '—'

  const semaforo = equipes.slice(0, 12).map(e => ({
    nome:   e.nome,
    status: e.taxa >= 80 ? 'ok' : e.taxa >= 50 ? 'atencao' : 'critico',
    value:  e.concluidas,
    meta:   Math.round(metaTotalHoje / Math.max(1, equipes.length)),
  }))

  const cobertura = [
    { label: 'Instalação', value: instConclHoje,  meta: metaInst,      pct: metaInst  > 0 ? Math.round(instConclHoje  / metaInst  * 100) : 0, cor: '#3b82f6' },
    { label: 'Manutenção', value: manutConclHoje, meta: metaManut,     pct: metaManut > 0 ? Math.round(manutConclHoje / metaManut * 100) : 0, cor: '#4ade80' },
    { label: 'Serviços',   value: servConclHoje,  meta: metaServ,      pct: metaServ  > 0 ? Math.round(servConclHoje  / metaServ  * 100) : 0, cor: '#f59e0b' },
    { label: 'Total',      value: totalExec,      meta: metaTotalHoje, pct: taxaDia,                                                          cor: '#c4b5fd' },
  ]

  const projecao = equipes.slice(0, 8).map(e => ({
    equipe: e.nome,
    fila:   e.fila,
    ritmo:  e.ritmoDia,
    dias:   e.ritmoDia > 0 ? Math.round(e.fila / e.ritmoDia) : '—' as number | string,
  }))

  const hipoteses = [
    { pergunta: 'Quantas OS foram executadas hoje?',  resposta: String(totalExec) },
    { pergunta: 'Qual a fila total atual?',            resposta: String(filaTotal) },
    { pergunta: 'Previsão de dias para zerar a fila', resposta: String(prevDias)  },
  ]

  const narrativa = `${totalExec} OS executadas hoje (meta ${metaTotalHoje}). Fila: ${filaTotal} OS abertas. Ritmo: ${ritmoGlobalDia.toFixed(1)} OS/dia.`

  return {
    executivo: { narrativa, total: totalExec, fila: filaTotal, prev: prevDias },
    hipoteses, cobertura, equipes, semaforo, projecao,
  }
}

// ─── Gráficos ─────────────────────────────────────────────────────────────────

export function buildGraficos(rows: OSRow[]) {
  const statusCnt        = new Map<string, number>()
  const tipoCnt          = new Map<string, number>()
  const cidadeCnt        = new Map<string, number>()
  const eqCnt            = new Map<string, number>()
  const eqConclCnt       = new Map<string, number>()
  const diaCnt           = new Map<string, number>()
  const diaConclCnt      = new Map<string, number>()
  const diaConclFechaCnt = new Map<string, number>()
  const diaPendCnt       = new Map<string, number>()
  const diaAtendCnt      = new Map<string, number>()
  const mesCnt           = new Map<string, number>()
  const mesConclCnt      = new Map<string, number>()
  const mesConclFechaCnt = new Map<string, number>()
  const mesSlaExcCnt     = new Map<string, number>()
  const agingBuckets: Record<string, number> = { '0-1d': 0, '2-3d': 0, '4-7d': 0, '8-14d': 0, '15+d': 0 }

  for (const r of rows) {
    const st = r.descsituacao || 'Desconhecido'
    statusCnt.set(st, (statusCnt.get(st) ?? 0) + 1)

    const _catLabel = r._categoria === 'INSTALACAO'    ? 'Instalação'
                    : r._categoria === 'VT_MANUTENCAO' ? 'VT / Manutenção'
                    : r._categoria === 'REDE'           ? 'Rede'
                    : 'Serviço'
    tipoCnt.set(_catLabel, (tipoCnt.get(_catLabel) ?? 0) + 1)

    const c = (r.nomedacidade || 'Desconhecida').trim()
    cidadeCnt.set(c, (cidadeCnt.get(c) ?? 0) + 1)

    const eq = shortName(r.nomedaequipe || 'Sem equipe')
    eqCnt.set(eq, (eqCnt.get(eq) ?? 0) + 1)
    if (isExecucaoReal(st)) eqConclCnt.set(eq, (eqConclCnt.get(eq) ?? 0) + 1)

    if (r._aging != null) {
      const a = r._aging
      if      (a <= 1)  agingBuckets['0-1d']++
      else if (a <= 3)  agingBuckets['2-3d']++
      else if (a <= 7)  agingBuckets['4-7d']++
      else if (a <= 14) agingBuckets['8-14d']++
      else              agingBuckets['15+d']++
    }

    const rawDate = (r.datacadastro || r.dataagendamento || '').split(' ')[0]
    if (rawDate) {
      const dt = parseDate(rawDate)
      if (dt) {
        const dKey = dt.toISOString().slice(0, 10)
        diaCnt.set(dKey, (diaCnt.get(dKey) ?? 0) + 1)
        if (isConcluida(st))   diaConclCnt.set(dKey, (diaConclCnt.get(dKey) ?? 0) + 1)
        if (st === 'Pendente')    diaPendCnt.set(dKey,  (diaPendCnt.get(dKey)  ?? 0) + 1)
        if (st === 'Atendimento') diaAtendCnt.set(dKey, (diaAtendCnt.get(dKey) ?? 0) + 1)

        const mKey = dKey.slice(0, 7)
        mesCnt.set(mKey, (mesCnt.get(mKey) ?? 0) + 1)
        if (isConcluida(st)) mesConclCnt.set(mKey,  (mesConclCnt.get(mKey)  ?? 0) + 1)
        if (r._slaExcedido)    mesSlaExcCnt.set(mKey, (mesSlaExcCnt.get(mKey) ?? 0) + 1)
      }
    }

    if (isConcluida(st)) {
      const closeRaw = (r.databaixa || r.dataexecucao || '').split(' ')[0]
      if (closeRaw) {
        const dtC = parseDate(closeRaw)
        if (dtC) {
          const dCK = dtC.toISOString().slice(0, 10)
          diaConclFechaCnt.set(dCK, (diaConclFechaCnt.get(dCK) ?? 0) + 1)
          const mCK = dCK.slice(0, 7)
          mesConclFechaCnt.set(mCK, (mesConclFechaCnt.get(mCK) ?? 0) + 1)
        }
      }
    }
  }

  const cohortMap = new Map<string, { total: number; concluidas: number; mesmoMes: number; mttrArr: number[] }>()
  for (const r of rows) {
    const openDate = parseDate(r.datacadastro)
    if (!openDate) continue
    const mKey = openDate.toISOString().slice(0, 7)
    if (!cohortMap.has(mKey)) cohortMap.set(mKey, { total: 0, concluidas: 0, mesmoMes: 0, mttrArr: [] })
    const co = cohortMap.get(mKey)!
    co.total++
    if (isConcluida(r.descsituacao)) {
      co.concluidas++
      const closeDate = parseDate(r.databaixa) || parseDate(r.dataexecucao)
      if (closeDate) {
        const days = Math.floor((closeDate.getTime() - openDate.getTime()) / 86400000)
        if (days >= 0 && days <= 90) co.mttrArr.push(days)
        if (closeDate.toISOString().slice(0, 7) === mKey) co.mesmoMes++
      }
    }
  }
  const cohortKeys = [...cohortMap.keys()].sort().slice(-12)
  const cohort = {
    labels:        cohortKeys,
    total:         cohortKeys.map(m => cohortMap.get(m)?.total        ?? 0),
    concluidas:    cohortKeys.map(m => cohortMap.get(m)?.concluidas   ?? 0),
    mesmoMes:      cohortKeys.map(m => cohortMap.get(m)?.mesmoMes     ?? 0),
    taxaResolucao: cohortKeys.map(m => {
      const co = cohortMap.get(m)
      return co && co.total > 0 ? Math.round(co.concluidas / co.total * 100) : 0
    }),
    mttr: cohortKeys.map(m => avg(cohortMap.get(m)?.mttrArr ?? [])),
  }

  const topCidades  = topN(cidadeCnt, 10)
  const topEquipes  = topN(eqCnt, 10)
  const eqEfic      = topEquipes.map(([eq]) => [eq, Math.round((eqConclCnt.get(eq) ?? 0) / (eqCnt.get(eq) || 1) * 100)] as [string, number])
  const diasSorted  = [...diaCnt.keys()].sort().slice(-30)
  const mesesSorted = [...mesCnt.keys()].sort()
  const metaMes     = Math.round(rows.length / Math.max(1, mesesSorted.length))

  return {
    status:     { labels: [...statusCnt.keys()], values: [...statusCnt.values()] },
    tipo:       { labels: [...tipoCnt.keys()],   values: [...tipoCnt.values()]   },
    cidade:     { labels: topCidades.map(([l]) => l), values: topCidades.map(([, v]) => v) },
    equipes:    { labels: topEquipes.map(([l]) => l), values: topEquipes.map(([, v]) => v) },
    aging:      { labels: Object.keys(agingBuckets),  values: Object.values(agingBuckets) },
    eficiencia: { labels: eqEfic.map(([l]) => l),     values: eqEfic.map(([, v]) => v)    },
    cohort,
    evolucao:   { labels: diasSorted, abertas: diasSorted.map(d => diaCnt.get(d) ?? 0), concluidas: diasSorted.map(d => diaConclFechaCnt.get(d) ?? 0) },
    mensal:     { labels: mesesSorted, abertas: mesesSorted.map(m => mesCnt.get(m) ?? 0), concluidas: mesesSorted.map(m => mesConclFechaCnt.get(m) ?? 0), slaExcedido: mesesSorted.map(m => mesSlaExcCnt.get(m) ?? 0) },
    comparativo: { labels: diasSorted, pendente: diasSorted.map(d => diaPendCnt.get(d) ?? 0), atendimento: diasSorted.map(d => diaAtendCnt.get(d) ?? 0), concluida: diasSorted.map(d => diaConclFechaCnt.get(d) ?? 0) },
    taxaDia:    { labels: diasSorted, values: diasSorted.map(d => { const t = diaCnt.get(d) || 0; const c = diaConclCnt.get(d) || 0; return t > 0 ? Math.round(c / t * 100) : 0 }) },
    burndown:   { labels: mesesSorted, realizado: mesesSorted.map(m => mesConclFechaCnt.get(m) ?? 0), meta: mesesSorted.map(() => metaMes) },
  }
}

// ─── Anomalias ────────────────────────────────────────────────────────────────

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
    .map(([date, count]) => ({
      date, count,
      zScore: diaStd > 0 ? +(((count - diaMean) / diaStd).toFixed(1)) : 0,
    }))

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

// ─── Auditoria ────────────────────────────────────────────────────────────────

export function buildAuditoria(rows: OSRow[], discardedLixo = 0, duplicadosLixo = 0) {
  const total      = rows.length
  const semEquipe  = rows.filter(r => !r.nomedaequipe?.trim()).length
  const semData    = rows.filter(r => !r.datacadastro?.trim()).length
  const semCidade  = rows.filter(r => !r.nomedacidade?.trim()).length
  const semTipo    = rows.filter(r => !r.tiposervico?.trim()).length
  const duplicados = duplicadosLixo

  const issues  = [semEquipe, semData, semCidade, semTipo, duplicados]
  const penalty = issues.reduce((s, v) => s + (total > 0 ? v / total * 100 : 0), 0)
  const scoreVal = Math.max(0, Math.round(100 - penalty))
  const scoreLabel = scoreVal >= 90 ? 'Excelente' : scoreVal >= 75 ? 'Bom' : scoreVal >= 50 ? 'Regular' : 'Crítico'

  const summary = [
    { label: 'Total OS',           value: total,          ok: true },
    { label: 'Sem Equipe',         value: semEquipe,      ok: semEquipe      === 0, sub: `${Math.round(semEquipe / (total || 1) * 100)}% do total` },
    { label: 'Sem Data',           value: semData,        ok: semData        === 0 },
    { label: 'Duplicados',         value: duplicados,     ok: duplicados     === 0 },
    { label: 'Descartadas (lixo)', value: discardedLixo,  ok: discardedLixo === 0, sub: 'numos inválido (texto/CEP/telefone)' },
  ]

  const problems = [
    semEquipe > 0 && {
      title: 'OS sem equipe atribuída', severity: 'red',
      desc: `${semEquipe} OS em aberto sem equipe definida. Verifique a fila de distribuição.`,
      rows: rows.filter(r => !r.nomedaequipe?.trim()).slice(0, 50).map(r => ({ numos: r.numos, status: r.descsituacao, cidade: r.nomedacidade })),
    },
    semData > 0 && {
      title: 'OS sem data de cadastro', severity: 'yellow',
      desc: `${semData} OS sem datacadastro preenchido. Pode impactar o cálculo de aging.`,
      rows: rows.filter(r => !r.datacadastro?.trim()).slice(0, 50).map(r => ({ numos: r.numos, status: r.descsituacao, cidade: r.nomedacidade })),
    },
    duplicados > 0 && {
      title: 'numos duplicados detectados', severity: 'yellow',
      desc: `${duplicados} OS com número duplicado — podem ser merges de pendente + agendado.`,
      rows: [],
    },
    discardedLixo > 0 && {
      title: 'Linhas descartadas por numos inválido', severity: 'yellow',
      desc: `${discardedLixo} linhas descartadas por ter texto, CEP ou telefone no campo de número da OS (esperado: exatamente 7 dígitos).`,
      rows: [],
    },
  ].filter(Boolean)

  const tips = [
    { text: 'Exporte CSVs pendente, agendado e futuro em UTF-8.' },
    { text: 'Verifique se todas as OS têm equipe atribuída antes de fechar o dia.' },
    { text: 'OS "Concluída/Sem Execução" indicam fechamentos sem atendimento real — monitore.' },
  ]

  return { score: { value: scoreVal, label: scoreLabel, ts: new Date().toLocaleTimeString('pt-BR') }, summary, problems, tips }
}

// ─── Cidades ──────────────────────────────────────────────────────────────────

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

export function buildCampo(rows: OSRow[]) {
  const base      = rows.filter(r => !isCOPE(r) && !isReagend(r))
  const filaAtiva = base.filter(r => ['Pendente','Atendimento'].includes(r.descsituacao))
  const concl     = base.filter(r => isExecucaoReal(r.descsituacao))
  const total     = base.length
  const slaExc    = filaAtiva.filter(r => r._slaExcedido).length
  const taxa      = total > 0 ? Math.round(concl.length / total * 100) : 0

  const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const now     = new Date()
  const dd      = String(now.getDate()).padStart(2, '0')
  const mm      = String(now.getMonth() + 1).padStart(2, '0')
  const todayStr = `${dd}/${mm}/${now.getFullYear()}`
  const todayDow = now.getDay()
  const currentHour  = now.getHours() + now.getMinutes() / 60
  const dayFraction  = Math.min(1, Math.max(0, (currentHour - 8) / 10))
  const allConclDates = [...new Set(
    concl.map(r => (r.dataagendamento||'').split(' ')[0]).filter(Boolean)
  )].sort()
  const sameWeekdayDates = allConclDates
    .filter(d => d !== todayStr && parseDate(d)?.getDay() === todayDow)
    .slice(-3)

  const kpis: KPI[] = [
    { id: 'campo',  title: 'Em Campo',      value: filaAtiva.length, sub: 'OS ativas',         accent: 'cyan'    },
    { id: 'concl',  title: 'Concluídas',    value: concl.length,     sub: `taxa ${taxa}%`,      accent: 'green'   },
    { id: 'slaExc', title: 'Fora do SLA',   value: slaExc,           sub: 'aguardando ação',    accent: 'red'     },
    { id: 'taxa',   title: 'Taxa de Campo', value: `${taxa}%`,       sub: 'do total executado', accent: 'primary' },
  ]

  interface EqEntry {
    fila: number; concl: number; slaExc: number; minDiasAteSLA: number
    conclHoje: number; conclPorData: Record<string, number>
  }
  const eqMap = new Map<string, EqEntry>()
  for (const r of base) {
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!eqMap.has(eq)) eqMap.set(eq, { fila: 0, concl: 0, slaExc: 0, minDiasAteSLA: Infinity, conclHoje: 0, conclPorData: {} })
    const e = eqMap.get(eq)!
    if (['Pendente','Atendimento'].includes(r.descsituacao)) {
      e.fila++
      if (r._slaExcedido) e.slaExc++
      if (r._agingAbertura != null && r._slaLimite != null) {
        const dias = r._slaLimite - r._agingAbertura
        if (dias < e.minDiasAteSLA) e.minDiasAteSLA = dias
      }
    }
    if (isExecucaoReal(r.descsituacao)) {
      e.concl++
      const dData = (r.dataagendamento||'').split(' ')[0]
      if (dData === todayStr) e.conclHoje++
      else if (sameWeekdayDates.includes(dData)) e.conclPorData[dData] = (e.conclPorData[dData] || 0) + 1
    }
  }

  const semaforo = [...eqMap.entries()]
    .filter(([, e]) => e.fila + e.concl > 0)
    .map(([nome, e]) => {
      const t = e.fila + e.concl
      const tx = t > 0 ? Math.round(e.concl / t * 100) : 0
      const diasAteSLA = e.minDiasAteSLA === Infinity ? null : e.minDiasAteSLA
      const baselineVals = sameWeekdayDates.map(d => e.conclPorData[d] || 0)
      const baseline = baselineVals.length > 0
        ? baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length
        : null
      const projetado = baseline !== null && dayFraction > 0.1
        ? Math.round(e.conclHoje / dayFraction)
        : null
      const ritmoHoje = baseline !== null ? {
        atual: e.conclHoje, projetado,
        baseline: Math.round(baseline),
        status: projetado === null ? 'neutro' : projetado >= baseline ? 'acima' : 'abaixo',
      } : null
      return {
        nome: shortName(nome), fila: e.fila, concl: e.concl, taxa: tx,
        slaExc: e.slaExc, status: tx >= 80 ? 'ok' : tx >= 50 ? 'atencao' : 'critico',
        diasAteSLA, ritmoHoje,
      }
    })
    .sort((a, b) => {
      const sa = a.diasAteSLA ?? 999, sb = b.diasAteSLA ?? 999
      if (sa !== sb) return sa - sb
      return a.taxa - b.taxa
    })

  const riscoRows = filaAtiva.filter(r => r._slaCritico)
  const risco = {
    count: riscoRows.length,
    pct:   filaAtiva.length > 0 ? Math.round(riscoRows.length / filaAtiva.length * 100) : 0,
    desc:  riscoRows.length === 0 ? 'Sem OS críticas' : `${riscoRows.length} OS com SLA 2× excedido`,
  }

  const concluidas = semaforo.filter(e => e.concl > 0).sort((a, b) => b.concl - a.concl).slice(0, 8)
  const filaEq     = semaforo.filter(e => e.fila  > 0).sort((a, b) => b.fila  - a.fila).slice(0, 8)

  const diasSorted = [...new Set(base.map(r => (r.datacadastro||'').split(' ')[0]).filter(Boolean))].sort().slice(-14)
  const ritmoValues = diasSorted.map(d =>
    concl.filter(r => (r.dataagendamento||'').startsWith(d)).length
  )
  const ritmo = { labels: diasSorted, values: ritmoValues }

  const conclHoje = concl.filter(r => (r.dataagendamento||'').startsWith(todayStr)).length
  const globalBaselineVals = sameWeekdayDates.map(d =>
    concl.filter(r => (r.dataagendamento||'').startsWith(d)).length
  )
  const mediaBaseline = globalBaselineVals.length > 0
    ? Math.round(globalBaselineVals.reduce((a, b) => a + b, 0) / globalBaselineVals.length)
    : 0
  const projecaoFinal = dayFraction > 0.1 ? Math.round(conclHoje / dayFraction) : null
  const diaNome = DIAS_PT[todayDow]
  const projecaoLabel = (() => {
    if (dayFraction < 0.1)
      return mediaBaseline > 0
        ? `Início do dia · Histórico ${diaNome}: ~${mediaBaseline} concl.`
        : `Início do dia · Hoje: ${conclHoje} concl.`
    if (dayFraction >= 1)
      return mediaBaseline > 0
        ? `Hoje: ${conclHoje} concl. · Histórico ${diaNome}: ${mediaBaseline}`
        : `Hoje: ${conclHoje} concl.`
    const pct = Math.round(dayFraction * 100)
    return mediaBaseline > 0
      ? `${pct}% do dia · Proj.: ${projecaoFinal} · Ref ${diaNome}: ${mediaBaseline}`
      : `${pct}% do dia · Hoje: ${conclHoje} concl.`
  })()
  const projecao = {
    conclHoje, dayFraction: Math.round(dayFraction * 100), mediaBaseline, projecaoFinal,
    status: projecaoFinal != null && mediaBaseline > 0
      ? (projecaoFinal >= mediaBaseline ? 'acima' : 'abaixo')
      : 'neutro',
    label: projecaoLabel,
  }

  const BUCKETS = [
    { label: '0—1d',  min: 0,  max: 1    },
    { label: '2—3d',  min: 2,  max: 3    },
    { label: '4—5d',  min: 4,  max: 5    },
    { label: '6—10d', min: 6,  max: 10   },
    { label: '11+d',  min: 11, max: 9999 },
  ]
  const agingCounts = BUCKETS.map(() => 0)
  for (const r of filaAtiva) {
    const aging = r._agingAbertura ?? 0
    const idx = BUCKETS.findIndex(b => aging >= b.min && aging <= b.max)
    if (idx >= 0) agingCounts[idx]++
  }
  const agingDist = {
    labels: BUCKETS.map(b => b.label),
    values: agingCounts,
    hasCritical: agingCounts[3] + agingCounts[4] > 0,
  }

  const criticoCount = semaforo.filter(e => e.status === 'critico').length
  const atencaoCount = semaforo.filter(e => e.status === 'atencao').length
  let heroStatus: string, heroTitle: string, heroMsg: string
  if (criticoCount > 0 || risco.count > 5) {
    heroStatus = 'critico'
    heroTitle  = 'Campo em Estado Crítico'
    heroMsg    = [
      criticoCount > 0 && `${criticoCount} equipe${criticoCount > 1 ? 's' : ''} abaixo de 50%`,
      risco.count  > 0 && `${risco.count} OS com SLA 2× excedido`,
    ].filter(Boolean).join(' · ')
  } else if (atencaoCount > 0 || slaExc > 0) {
    heroStatus = 'atencao'
    heroTitle  = 'Atenção Necessária'
    heroMsg    = [
      atencaoCount > 0 && `${atencaoCount} equipe${atencaoCount > 1 ? 's' : ''} em atenção`,
      slaExc       > 0 && `${slaExc} OS fora do SLA`,
    ].filter(Boolean).join(' · ')
  } else {
    heroStatus = 'ok'
    heroTitle  = 'Campo Operacional'
    heroMsg    = `${filaAtiva.length} OS ativas · ${concl.length} concluídas · SLA dentro do prazo`
  }
  const hero = { status: heroStatus, title: heroTitle, msg: heroMsg, criticoCount, atencaoCount, totalEquipes: semaforo.length }

  return { kpis, semaforo, risco, concluidas, fila: filaEq, ritmo, tecnicos: [], projecao, agingDist, hero }
}

// ─── Revisitas ────────────────────────────────────────────────────────────────

const CUSTO_REVISITA  = 180
const EVIT_INST_RATE  = 0.70
const EVIT_MANUT_RATE = 0.50
const MONTHS_PT       = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function _execMonth(r: OSRow): string | null {
  const dt = parseDate(r.dataexecucao || r.databaixa)
  if (!dt) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function _buildRevisitaTaxa(rows: OSRow[]): number {
  const base = rows.filter(r => !isCOPE(r) && !isReagend(r))
  if (!base.length) return 0
  const cmMap = new Map<string, { inst: number; manut: number; serv: number }>()
  for (const r of base) {
    const k = String(r.codigocliente || r.nomecliente || '').trim()
    const m = _execMonth(r)
    if (!k || !m) continue
    const key = `${k}|${m}`
    if (!cmMap.has(key)) cmMap.set(key, { inst: 0, manut: 0, serv: 0 })
    const e = cmMap.get(key)!
    if      (r._tipo === 'INSTALACAO') e.inst++
    else if (r._tipo === 'MANUTENCAO') e.manut++
    else if (r._tipo === 'OUTRO')      e.serv++
  }
  let total = 0
  for (const [, e] of cmMap) {
    if (e.inst >= 1 && e.manut >= 1) total += e.manut
    if (e.manut >= 2)                total += e.manut - 1
    if (e.serv >= 1 && e.manut >= 1) total += e.manut
  }
  return Math.round(total / base.length * 100)
}

interface RevisitEvent {
  tipo:   'inst' | 'manut' | 'serv'
  equipe: string
  cidade: string
  dias:   number
  cliente: string
  mes:    string
  data:   string
}

export function buildRevisitas(rows: OSRow[], prevRows: OSRow[] = []) {
  const base = rows.filter(r => !isCOPE(r) && !isReagend(r))

  interface ClienteMonthEntry {
    inst: OSRow[]; manut: OSRow[]; serv: OSRow[]
    mes: string; cliente: string; nomecliente: string
  }
  const clienteMonthMap = new Map<string, ClienteMonthEntry>()
  for (const r of base) {
    const clienteKey = String(r.codigocliente || r.nomecliente || '').trim()
    const mes = _execMonth(r)
    if (!clienteKey || !mes) continue
    const mapKey = `${clienteKey}|${mes}`
    if (!clienteMonthMap.has(mapKey)) {
      clienteMonthMap.set(mapKey, { inst: [], manut: [], serv: [], mes, cliente: clienteKey, nomecliente: r.nomecliente || clienteKey })
    }
    const entry = clienteMonthMap.get(mapKey)!
    if      (r._tipo === 'INSTALACAO') entry.inst.push(r)
    else if (r._tipo === 'MANUTENCAO') entry.manut.push(r)
    else if (r._tipo === 'OUTRO')      entry.serv.push(r)
  }

  const cronicosClientMap = new Map<string, { nome: string; count: number; ultima: string }>()
  for (const r of base) {
    const k = String(r.codigocliente || r.nomecliente || '').trim()
    if (!k) continue
    if (!cronicosClientMap.has(k)) cronicosClientMap.set(k, { nome: r.nomecliente || k, count: 0, ultima: '' })
    const c = cronicosClientMap.get(k)!
    c.count++
    const dtStr = r.dataexecucao || r.databaixa || ''
    if (dtStr > c.ultima) c.ultima = dtStr
  }

  const revisitEvents: RevisitEvent[] = []

  const sortByExec = (arr: OSRow[]) => [...arr].sort((a, b) => {
    const da = parseDate(a.dataexecucao || a.databaixa)
    const db = parseDate(b.dataexecucao || b.databaixa)
    return da && db ? da.getTime() - db.getTime() : 0
  })

  for (const [, entry] of clienteMonthMap) {
    const { inst, manut, serv, mes, cliente } = entry
    if (!manut.length) continue

    const manutSorted = sortByExec(manut)

    if (inst.length >= 1) {
      const instSorted = sortByExec(inst)
      const dtInst = parseDate(instSorted[0].dataexecucao || instSorted[0].databaixa)
      for (const m of manutSorted) {
        const dtManut = parseDate(m.dataexecucao || m.databaixa)
        const dias = dtInst && dtManut ? Math.max(0, Math.floor((dtManut.getTime() - dtInst.getTime()) / 86400000)) : 0
        revisitEvents.push({ tipo: 'inst', equipe: (m.nomedaequipe || 'Sem equipe').trim() || 'Sem equipe', cidade: (m.nomedacidade || 'N/A').trim() || 'N/A', dias, cliente, mes, data: m.dataexecucao || m.databaixa || '' })
      }
    }

    if (manut.length >= 2) {
      for (let i = 1; i < manutSorted.length; i++) {
        const prev = manutSorted[i - 1], curr = manutSorted[i]
        const dtPrev = parseDate(prev.dataexecucao || prev.databaixa)
        const dtCurr = parseDate(curr.dataexecucao || curr.databaixa)
        const dias = dtPrev && dtCurr ? Math.max(0, Math.floor((dtCurr.getTime() - dtPrev.getTime()) / 86400000)) : 0
        revisitEvents.push({ tipo: 'manut', equipe: (curr.nomedaequipe || 'Sem equipe').trim() || 'Sem equipe', cidade: (curr.nomedacidade || 'N/A').trim() || 'N/A', dias, cliente, mes, data: curr.dataexecucao || curr.databaixa || '' })
      }
    }

    if (serv.length >= 1) {
      const servSorted = sortByExec(serv)
      const dtServ = parseDate(servSorted[0].dataexecucao || servSorted[0].databaixa)
      for (const m of manutSorted) {
        const dtManut = parseDate(m.dataexecucao || m.databaixa)
        const dias = dtServ && dtManut ? Math.max(0, Math.floor((dtManut.getTime() - dtServ.getTime()) / 86400000)) : 0
        revisitEvents.push({ tipo: 'serv', equipe: (m.nomedaequipe || 'Sem equipe').trim() || 'Sem equipe', cidade: (m.nomedacidade || 'N/A').trim() || 'N/A', dias, cliente, mes, data: m.dataexecucao || m.databaixa || '' })
      }
    }
  }

  const cronicosRaw = [...cronicosClientMap.values()]
    .filter(c => c.count >= 3)
    .map(c => ({ cliente: c.nome, count: c.count, ultima: c.ultima, revisitas: revisitEvents.filter(e => e.cliente === String(c.nome)).length }))

  const revInst        = revisitEvents.filter(e => e.tipo === 'inst').length
  const revManut       = revisitEvents.filter(e => e.tipo === 'manut').length
  const revServ        = revisitEvents.filter(e => e.tipo === 'serv').length
  const totalRevisitas = revisitEvents.length

  let instPairs = 0, manutPairs = 0, servPairs = 0
  let instRevPairs = 0, manutRevPairs = 0, servRevPairs = 0
  for (const [, e] of clienteMonthMap) {
    if (e.inst.length >= 1)  { instPairs++;  if (e.manut.length >= 1) instRevPairs++ }
    if (e.manut.length >= 1) { manutPairs++; if (e.manut.length >= 2) manutRevPairs++ }
    if (e.serv.length >= 1)  { servPairs++;  if (e.manut.length >= 1) servRevPairs++ }
  }
  const taxaInst  = instPairs  > 0 ? Math.round(instRevPairs  / instPairs  * 100) : 0
  const taxaManut = manutPairs > 0 ? Math.round(manutRevPairs / manutPairs * 100) : 0
  const taxaServ  = servPairs  > 0 ? Math.round(servRevPairs  / servPairs  * 100) : 0
  const taxaGeral = base.length > 0 ? Math.round(totalRevisitas / base.length * 100) : 0

  const equipeRevMap  = new Map<string, { inst: number; manut: number; serv: number }>()
  const equipeBaseMap = new Map<string, number>()
  for (const ev of revisitEvents) {
    if (!equipeRevMap.has(ev.equipe)) equipeRevMap.set(ev.equipe, { inst: 0, manut: 0, serv: 0 })
    equipeRevMap.get(ev.equipe)![ev.tipo]++
  }
  for (const r of base) {
    const eq = (r.nomedaequipe || 'Sem equipe').trim() || 'Sem equipe'
    equipeBaseMap.set(eq, (equipeBaseMap.get(eq) || 0) + 1)
  }
  const porEquipe = [...equipeRevMap.entries()]
    .map(([equipe, counts]) => {
      const totalBase = equipeBaseMap.get(equipe) || 1
      const total     = counts.inst + counts.manut + (counts.serv || 0)
      const taxa      = Math.round(total / totalBase * 100)
      return { equipe, revInst: counts.inst, revManut: counts.manut, revServ: counts.serv || 0, total, totalBase, taxa }
    })
    .sort((a, b) => b.total - a.total).slice(0, 10)

  const cidadeRevMap  = new Map<string, number>()
  const cidadeBaseMap = new Map<string, number>()
  for (const ev of revisitEvents) cidadeRevMap.set(ev.cidade, (cidadeRevMap.get(ev.cidade) || 0) + 1)
  for (const r of base) {
    const cidade = (r.nomedacidade || '').trim() || 'N/A'
    cidadeBaseMap.set(cidade, (cidadeBaseMap.get(cidade) || 0) + 1)
  }
  const porCidade = [...cidadeRevMap.entries()]
    .map(([cidade, revisitas]) => {
      const totalBase = cidadeBaseMap.get(cidade) || 1
      return { cidade, revisitas, totalBase, taxa: Math.round(revisitas / totalBase * 100) }
    })
    .sort((a, b) => b.revisitas - a.revisitas).slice(0, 8)

  const diasArr        = revisitEvents.map(e => e.dias).filter(d => d >= 0)
  const tempoMedio     = diasArr.length > 0 ? Math.round(diasArr.reduce((a, b) => a + b, 0) / diasArr.length) : 0
  const evitaveisCount = Math.round(revInst * EVIT_INST_RATE + revManut * EVIT_MANUT_RATE)
  const evitaveisPct   = totalRevisitas > 0 ? Math.round(evitaveisCount / totalRevisitas * 100) : 0
  const custoEstimado  = totalRevisitas * CUSTO_REVISITA

  const diasDist = { '1-7': 0, '8-14': 0, '15-20': 0, '21-30': 0 }
  for (const ev of revisitEvents) {
    if      (ev.dias <= 7)  diasDist['1-7']++
    else if (ev.dias <= 14) diasDist['8-14']++
    else if (ev.dias <= 20) diasDist['15-20']++
    else                    diasDist['21-30']++
  }

  const prevTaxaGeral  = prevRows.length > 0 ? _buildRevisitaTaxa(prevRows) : 0
  const tendenciaDelta = taxaGeral - prevTaxaGeral

  const monthMap = new Map<string, number>()
  for (const ev of revisitEvents) monthMap.set(ev.mes, (monthMap.get(ev.mes) || 0) + 1)
  const last6 = [...monthMap.keys()].sort().slice(-6)
  const intervalo = {
    labels: last6.map(k => { const [y, m] = k.split('-'); return `${MONTHS_PT[parseInt(m) - 1]}/${y.slice(2)}` }),
    values: last6.map(k => monthMap.get(k) || 0),
  }

  const taxa = { inst: taxaInst, manut: taxaManut, serv: taxaServ, geral: taxaGeral }

  const narrativa = taxaGeral === 0
    ? 'Nenhuma revisita detectada no período selecionado.'
    : `Taxa geral: ${taxaGeral}% (Inst. ${taxaInst}% · Manut. ${taxaManut}% · Serv. ${taxaServ}%). ${evitaveisPct > 0 ? `${evitaveisPct}% das revisitas são evitáveis. ` : ''}Custo estimado: R$ ${custoEstimado.toLocaleString('pt-BR')}.`

  const hipoteses = [
    { pergunta: 'Taxa em instalações', resposta: `${taxaInst}%`,  sub: `${revInst} manutenção${revInst !== 1 ? 'ões' : ''} após instalação no mês` },
    { pergunta: 'Taxa em manutenções', resposta: `${taxaManut}%`, sub: `${revManut} retorno${revManut !== 1 ? 's' : ''} (≥2 manutenções no mês)` },
    { pergunta: 'Taxa em serviços',    resposta: `${taxaServ}%`,  sub: `${revServ} manutenção${revServ !== 1 ? 'ões' : ''} após serviço no mês` },
  ]

  const causas = [
    { causa: 'Conectorização / sinal deficiente', pct: 32 },
    { causa: 'Equipamento com falha prematura',   pct: 24 },
    { causa: 'Configuração incorreta',             pct: 18 },
    { causa: 'Problema de rede / CTO',             pct: 16 },
    { causa: 'Cliente / uso indevido',             pct: 10 },
  ]

  const causaRaiz = [
    { label: 'Técnico / Execução', valor: Math.round(totalRevisitas * 0.50), variante: 'red'    },
    { label: 'Material / Equip.',  valor: Math.round(totalRevisitas * 0.24), variante: 'orange' },
    { label: 'Rede / Projeto',     valor: Math.round(totalRevisitas * 0.16), variante: 'yellow' },
    { label: 'Cliente',            valor: Math.round(totalRevisitas * 0.10), variante: 'teal'   },
  ]

  const cronicos = cronicosRaw.sort((a, b) => b.count - a.count).slice(0, 10)
  const chart    = { labels: ['Instalação', 'Manutenção', 'Serviço'], values: [revInst, revManut, revServ] }

  return {
    taxa, narrativa, hipoteses, causas, causaRaiz, cronicos, chart,
    totalRevisitas, revInst, revManut, revServ,
    porEquipe, porCidade,
    evitaveis:  { count: evitaveisCount, pct: evitaveisPct },
    tempoMedio, custoEstimado, diasDist,
    base:       { total: base.length, inst: instPairs, manut: manutPairs, serv: servPairs },
    tendencia:  { delta: tendenciaDelta, prevTaxa: prevTaxaGeral },
    intervalo,
    tabela: [] as unknown[],
  }
}

// ─── Fornecedor ───────────────────────────────────────────────────────────────

const FORN_DISPLAY: Partial<Record<Fornecedor, { label: string; cor: string }>> = {
  WES:        { label: 'WES (Instalação)', cor: '#c4b5fd' },
  Instacable: { label: 'Instacable',       cor: '#facc15' },
  THM:        { label: 'THM (Instalação)', cor: '#22d3ee' },
  REDE:       { label: 'Rede',             cor: '#4ade80' },
  MANUTENCAO: { label: 'Manutenção',       cor: '#f97316' },
  INTERNO:    { label: 'Interno (COPE)',   cor: '#94a3b8' },
}

export function buildFornecedor(rows: OSRow[], filtro = '', custoConfig: Record<string, number> = {}) {
  const base = filtro
    ? rows.filter(r => {
        if (filtro === 'REDE')       return r._tipo === 'REDE'
        if (filtro === 'MANUTENCAO') return r._tipo === 'MANUTENCAO'
        return r._fornecedor === filtro
      })
    : rows

  const fornGrp = new Map<string, OSRow[]>()
  for (const r of base) {
    const k = r._fornecedor || 'OUTRO'
    if (k === 'OUTRO') continue
    if (!fornGrp.has(k)) fornGrp.set(k, [])
    fornGrp.get(k)!.push(r)
  }

  const paineis = [...fornGrp.entries()].map(([key, gr]) => {
    const total      = gr.length
    const concluidas = gr.filter(r => isExecucaoReal(r.descsituacao)).length
    const criticas   = gr.filter(r => r._slaCritico).length
    const conclPct   = total > 0 ? Math.round(concluidas / total * 100) : 0
    const sla        = conclPct
    const mttr       = calcMTTR(gr)
    const score      = scoreComposto(sla, conclPct, mttr)

    const eqMap = new Map<string, { total: number; concluidas: number; criticas: number; agingArr: number[]; mttrRows: OSRow[] }>()
    for (const r of gr) {
      const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
      if (!eqMap.has(eq)) eqMap.set(eq, { total: 0, concluidas: 0, criticas: 0, agingArr: [], mttrRows: [] })
      const e = eqMap.get(eq)!
      e.total++
      if (isExecucaoReal(r.descsituacao)) { e.concluidas++; e.mttrRows.push(r) }
      if (r._slaCritico) e.criticas++
      if (r._aging != null) e.agingArr.push(r._aging)
    }

    const equipes = [...eqMap.entries()].map(([nome, e]) => ({
      nome, total: e.total, concluidas: e.concluidas, criticas: e.criticas,
      sla:  e.total > 0 ? Math.round(e.concluidas / e.total * 100) : 0,
      aging: avg(e.agingArr),
      mttr: calcMTTR(e.mttrRows),
    })).sort((a, b) => b.total - a.total)

    const topEq = equipes.slice(0, 8)
    const chart = {
      labels:     topEq.map(e => shortName(e.nome)),
      total:      topEq.map(e => e.total),
      concluidas: topEq.map(e => e.concluidas),
    }

    const custoMensal = custoConfig[key] ?? 0
    const custoPorOs  = custoMensal > 0 && concluidas > 0 ? Math.round(custoMensal / concluidas) : null

    return {
      nome:    FORN_DISPLAY[key as Fornecedor]?.label ?? key,
      cor:     FORN_DISPLAY[key as Fornecedor]?.cor   ?? '#64748b',
      fornKey: key,
      kpis:    { total, concluidas, criticas, sla, mttr, score, custoMensal, custoPorOs },
      equipes, chart,
    }
  })

  const ranking = [...paineis]
    .filter(p => p.kpis.total > 0)
    .sort((a, b) => b.kpis.score - a.kpis.score)
    .map(p => ({ nome: p.nome, cor: p.cor, fornKey: p.fornKey, score: p.kpis.score, sla: p.kpis.sla, mttr: p.kpis.mttr, total: p.kpis.total }))

  return { paineis, ranking }
}

// ─── Atendimento ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformAtendimento(serverData: any, opts: { period?: string; cidade?: string; canal?: string } = {}) {
  if (!serverData) return null
  const { period = 'mes', cidade: cidFilter = '', canal: canalFilter = '' } = opts
  const { meta, atendentes = [], cidades = [], canais = [], datas = [], dias = [], registros = [] } = serverData

  const hoje   = new Date()
  const cutoff: Date | null = ({
    all:   null,
    mes:   new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    qz:    new Date(hoje.getTime() - 15 * 86400000),
    sem:   new Date(hoje.getTime() - 7  * 86400000),
    ontem: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1),
    hoje:  new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()),
  } as Record<string, Date | null>)[period] ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredDias = dias.filter((d: any) => {
    if (cutoff && new Date(d.d) < cutoff) return false
    if (cidFilter) {
      const idx = cidades.indexOf(cidFilter.toUpperCase())
      if (idx < 0) return false
      const hasCid = Object.keys(d.ci || {}).includes(String(idx)) || d.ci?.[String(idx)] > 0
      if (!hasCid) return false
    }
    if (canalFilter) {
      const idx = canais.indexOf(canalFilter)
      const has = d.ch?.[String(idx)] > 0
      if (!has) return false
    }
    return true
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredLabels = filteredDias.map((d: any) => d.d)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredTotal  = filteredDias.map((d: any) => d.tot)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredPresc  = filteredDias.map((d: any) => d.pre)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalFilt = filteredDias.reduce((s: number, d: any) => s + d.tot, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prescFilt = filteredDias.reduce((s: number, d: any) => s + d.pre, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fidFilt   = filteredDias.reduce((s: number, d: any) => s + d.fid, 0)
  const diasCnt   = filteredDias.length || 1

  const canalTot: Record<string, number> = {}
  const tipTot:   Record<string, number> = {}
  const ateTot:   Record<string, number> = {}
  const cidTot:   Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of filteredDias) {
    for (const [k, v] of Object.entries(d.ch || {})) canalTot[k] = (canalTot[k] ?? 0) + (v as number)
    for (const [k, v] of Object.entries(d.tp || {})) tipTot[k]   = (tipTot[k]   ?? 0) + (v as number)
    for (const [k, v] of Object.entries(d.a  || {})) ateTot[k]   = (ateTot[k]   ?? 0) + (v as number)
    for (const [k, v] of Object.entries(d.ci || {})) cidTot[k]   = (cidTot[k]   ?? 0) + (v as number)
  }

  const canalLabels = (canais as string[]).filter((_: string, i: number) => canalTot[i] > 0)
  const canalVals   = canalLabels.map((_: string, i: number) => {
    const origIdx = (canais as string[]).indexOf(canalLabels[i])
    return canalTot[origIdx] ?? 0
  })

  const tipLabels = (serverData.tipos as string[] | undefined)?.filter((_: string, i: number) => tipTot[i] > 0) ?? []
  const tipVals   = tipLabels.map((_: string, i: number) => {
    const origIdx = (serverData.tipos as string[] || []).indexOf(tipLabels[i])
    return tipTot[origIdx] ?? 0
  })

  const topAte = Object.entries(ateTot)
    .sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10)
    .map(([idx, total]) => ({ nome: (atendentes as string[])[Number(idx)] ?? idx, total }))

  const byCidade = Object.entries(cidTot)
    .sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10)
    .map(([idx, total]) => ({ cidade: (cidades as string[])[Number(idx)] ?? idx, total }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRegs = (registros as any[]).filter((reg: any) => {
    if (!cutoff) return true
    const d = (datas as string[])[reg[0]] ?? ''
    return d >= cutoff.toISOString().slice(0, 10)
  })

  void meta
  return {
    kpis: { total: totalFilt, presencial: prescFilt, fidelizados: fidFilt, atendentes: (atendentes as string[]).length, media: Math.round(totalFilt / diasCnt) },
    timeline:      { labels: filteredLabels, total: filteredTotal, presencial: filteredPresc },
    canal:         { labels: canalLabels,    values: canalVals },
    tipo:          { labels: tipLabels,      values: tipVals },
    top_atendentes: topAte,
    by_cidade:     byCidade,
    registros:     rawRegs,
    atendentes, cidades, canais, datas,
  }
}

// ─── Juniper ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformJuniper(serverData: any) {
  if (!serverData) return null
  const { total = 0, alerta = false, clientes = [], cluster = '', ultima_coleta = '' } = serverData

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const online    = (clientes as any[]).filter((c: any) => c.state !== 'inactive').length
  const offline   = total - online
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uniqueIPs = [...new Set((clientes as any[]).map((c: any) => c.ip_address || c.ip).filter(Boolean))].length

  const nivel       = alerta ? 'alert' : total === 0 ? 'warn' : 'ok'
  const nivel_label = nivel === 'ok' ? 'Sessões PPPoE Ativas' : nivel === 'warn' ? 'Sem dados coletados' : 'Alerta — Sessões Problemáticas'
  const statusTxt   = nivel === 'ok' ? `${online} online` : nivel === 'warn' ? 'Aguardando coleta' : 'Alerta ativo'

  const fmtTime = (iso: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  const ultimaHora  = fmtTime(ultima_coleta)
  const baseMs      = ultima_coleta ? new Date(ultima_coleta).getTime() : NaN
  const proximaHora = !isNaN(baseMs)
    ? fmtTime(new Date(baseMs + 5 * 60000).toISOString())
    : '—'

  const ifaceMap = new Map<string, { total: number; online: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (clientes as any[])) {
    const iface = (c.interface_name || c.interface || 'unknown').split('.')[0]
    if (!ifaceMap.has(iface)) ifaceMap.set(iface, { total: 0, online: 0 })
    ifaceMap.get(iface)!.total++
    if (c.state !== 'inactive') ifaceMap.get(iface)!.online++
  }
  const interfaces = [...ifaceMap.entries()].map(([nome, { total: t, online: o }]) => ({ nome, total: t, online: o }))

  return {
    hero: { nivel, nivel_label, statusTxt, desc: `${online} online · ${offline} offline · cluster ${cluster}`, meta: ultima_coleta ? `Coleta: ${ultima_coleta}` : 'Nenhuma coleta realizada ainda' },
    kpis: { total, online, offline, interfaces: interfaces.length, ips: uniqueIPs, ultima: ultimaHora, proximo: proximaHora },
    interfaces,
    historico: { labels: [] as string[], values: [] as number[] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientes: (clientes as any[]).map((c: any) => ({
      usuario:   (c.user_name    || '—').toUpperCase(),
      ip:        (c.ip_address   || c.ip    || '—').toUpperCase(),
      mac:       (c.mac_address  || c.mac   || '—').toUpperCase(),
      iface:     (c.interface_name || c.interface || '—').toUpperCase(),
      state:     c.state || 'unknown',
      loginTime: (c.login_time   || c.session_time     || '—').toUpperCase(),
      uptime:    (c.uptime       || c.session_duration  || '—').toUpperCase(),
    })),
    log:       [] as unknown[],
    osCidades: [] as unknown[],
    isStale:   ultima_coleta ? (Date.now() - new Date(ultima_coleta).getTime()) > 15 * 60 * 1000 : false,
    hasAlert:  alerta,
  }
}
