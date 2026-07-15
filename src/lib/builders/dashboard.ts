import { isExecucaoReal, isCOPE, isReagend, getReagendTipo, parseDate } from '../transform'
import type { OSRow, KPI } from '../types'
import {
  avg, calcMTTR, mttrStats, estourouSLA, scoreComposto, mttrToScore, SCORE_PESOS,
  type FornCard, FORN_CFG,
} from './_helpers'

// ─── Saúde do período (comparável entre janelas) ──────────────────────────────
// Diferente do slaFila "ao vivo" (fila atual), mede a saúde das OS do PERÍODO,
// permitindo comparar período atual vs anterior. Pesos únicos: SCORE_PESOS (_helpers).

export interface PeriodHealth {
  total:  number
  slaPct: number
  taxa:   number
  mttr:   number
  score:  number
}

export function periodHealth(set: OSRow[]): PeriodHealth {
  let total = 0, concl = 0, breach = 0
  for (const r of set) {
    if (isCOPE(r) || isReagend(r) || r._tipo === 'REDE') continue
    total++
    if (isExecucaoReal(r.descsituacao)) concl++
    if (estourouSLA(r)) breach++
  }
  const slaPct = total > 0 ? Math.round((total - breach) / total * 100) : 100
  const taxa   = total > 0 ? Math.round(concl / total * 100) : 0
  const mttr   = calcMTTR(set)
  const score  = total > 0 ? scoreComposto(slaPct, taxa, mttr) : 0
  return { total, slaPct, taxa, mttr, score }
}

// ─── Projeção de risco (preditivo) ────────────────────────────────────────────
// OS ativas que ainda NÃO são críticas mas vão estourar o SLA (2× limite) em breve,
// usando _diasAteViolacao já calculado no enrichRows. Olha a fila ao vivo (allRows).

export interface ProjecaoRisco {
  proj24h: number       // viram críticas em ≤ 24h
  proj48h: number       // viram críticas em ≤ 48h (além das de 24h)
  amostra: OSRow[]      // as mais iminentes primeiro (para drill-down)
}

export function buildProjecaoRisco(allRows: OSRow[]): ProjecaoRisco {
  let proj24h = 0, proj48h = 0
  const risco: OSRow[] = []
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || r._tipo === 'REDE') continue
    if (!['Pendente', 'Atendimento'].includes(r.descsituacao)) continue
    if (r._slaCritico) continue
    const d = r._diasAteViolacao
    if (d == null) continue
    if (d <= 1)      { proj24h++; risco.push(r) }
    else if (d === 2) { proj48h++; risco.push(r) }
  }
  const amostra = risco
    .sort((a, b) => (a._diasAteViolacao ?? 99) - (b._diasAteViolacao ?? 99))
    .slice(0, 50)
  return { proj24h, proj48h, amostra }
}

// Média diária de entradas (OS criadas) — baseline fixo dos últimos N dias,
// independente do filtro de data do usuário (senão filtro "hoje" compararia hoje com hoje).
export function entradaMediaDia(rows: OSRow[], janelaDias = 28): number {
  const corte = new Date()
  corte.setHours(0, 0, 0, 0)
  corte.setDate(corte.getDate() - janelaDias)
  const perDay = new Map<string, number>()
  for (const r of rows) {
    if (isCOPE(r) || isReagend(r)) continue
    const day = (r.datacadastro || '').split(' ')[0]
    if (!day) continue
    const dt = parseDate(day)
    if (!dt || dt < corte) continue
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  if (perDay.size === 0) return 0
  const total = [...perDay.values()].reduce((a, b) => a + b, 0)
  return Math.round(total / perDay.size)
}

export interface DashboardMover {
  id:       string
  label:    string
  atual:    number
  anterior: number
  delta:    number
  unidade:  string
  melhorou: boolean
  impacto:  number   // impacto assinado no score (positivo = melhorou)
}

export function buildMudancas(cur: PeriodHealth, prev: PeriodHealth): DashboardMover[] {
  const defs = [
    { id: 'sla',  label: 'SLA do período',    atual: cur.slaPct, anterior: prev.slaPct, unidade: '%', w: SCORE_PESOS.sla,  mttr: false },
    { id: 'taxa', label: 'Taxa de conclusão', atual: cur.taxa,   anterior: prev.taxa,   unidade: '%', w: SCORE_PESOS.taxa, mttr: false },
    { id: 'mttr', label: 'MTTR',              atual: cur.mttr,   anterior: prev.mttr,   unidade: 'd', w: SCORE_PESOS.mttr, mttr: true  },
  ]
  return defs
    .map(d => {
      const delta = Math.round((d.atual - d.anterior) * 10) / 10
      const impacto = d.mttr
        ? (mttrToScore(cur.mttr) - mttrToScore(prev.mttr)) * d.w
        : delta * d.w
      return {
        id: d.id, label: d.label, atual: d.atual, anterior: d.anterior, delta,
        unidade: d.unidade, melhorou: impacto > 0, impacto: Math.round(impacto * 10) / 10,
      }
    })
    .filter(m => m.delta !== 0)
    .sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto))
}

export function buildDashboard(rows: OSRow[], allRows: OSRow[] = rows, prevRows: OSRow[] = []) {
  const isAtivo = (r: OSRow) => ['Pendente','Atendimento'].includes(r.descsituacao)
  const isRede  = (r: OSRow) => r._tipo === 'REDE'

  // Data de hoje em DD/MM/YYYY para comparar com dataagendamento (mesmo formato do CSV)
  const _now = new Date()
  const _hojeStr = `${String(_now.getDate()).padStart(2, '0')}/${String(_now.getMonth() + 1).padStart(2, '0')}/${_now.getFullYear()}`
  const isAgendadaHoje = (r: OSRow) => (r.dataagendamento || '').split(' ')[0] === _hojeStr

  let pend = 0, atend = 0, redeCount = 0, criticas = 0, criticasHoje = 0, semEquipe = 0
  let reagendInviab = 0, reagendMobile = 0, reagendFutura = 0
  let copeAguardando = 0
  let slaExcFila = 0, semAgendamento = 0
  const agingArr: number[] = []
  const agingDist = { ok: 0, limite: 0, estourado: 0, critico: 0 }
  const cidCritMap = new Map<string, number>()

  for (const r of allRows) {
    if (isReagend(r)) {
      if (isAtivo(r)) {
        const t = getReagendTipo(r)
        if      (t === 'inviabilidade') reagendInviab++
        else if (t === 'mobile')        reagendMobile++
        else                            reagendFutura++
      }
      continue
    }
    if (isCOPE(r)) {
      if (isAtivo(r)) copeAguardando++
      continue
    }
    if (!isAtivo(r)) continue
    if (isRede(r)) { redeCount++; continue }
    if (r._situacaoEfetiva === 'Pendente')    pend++
    if (r._situacaoEfetiva === 'Atendimento') atend++
    if (!r.nomedaequipe?.trim()) semEquipe++
    if (r._slaCritico) {
      criticas++
      if (isAgendadaHoje(r)) criticasHoje++
      const c = (r.nomedacidade || '').trim()
      if (c) cidCritMap.set(c, (cidCritMap.get(c) ?? 0) + 1)
    }
    if (r._slaExcedido || r._slaSemAgend) slaExcFila++
    if (!r.dataagendamento?.trim()) semAgendamento++
    if (r._aging != null) {
      agingArr.push(r._aging)
      // Bucket relativo ao SLA da OS: manutenção com 2d (limite 1) já estourou;
      // instalação com 2d (limite 2) está no limite. Dias absolutos escondem isso.
      const ratio = r._slaLimite > 0 ? r._aging / r._slaLimite : r._aging
      if      (ratio < 0.5) agingDist.ok++
      else if (ratio <= 1)  agingDist.limite++
      else if (ratio <= 2)  agingDist.estourado++
      else                  agingDist.critico++
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

  // ─── Backlog em dias de capacidade: fila ÷ média de saídas/dia (14 dias) ──
  // "120 OS na fila" não diz nada; "3,2 dias de fila no ritmo atual" decide
  // se precisa de frente extra. Exclui hoje (dia incompleto) e domingos
  // (plantão de 2–4 técnicos não representa a capacidade real) do baseline.
  const saidasPorDia = new Map<string, number>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isRede(r)) continue
    if (!isExecucaoReal(r.descsituacao)) continue
    const day = (r.dataexecucao || r.databaixa || '').split(' ')[0]
    if (!day || day === hojeStr) continue
    const dt = parseDate(day)
    if (!dt || dt.getDay() === 0 || (now.getTime() - dt.getTime()) > 14 * 86400000) continue
    saidasPorDia.set(day, (saidasPorDia.get(day) ?? 0) + 1)
  }
  const mediaSaidasDia = saidasPorDia.size > 0
    ? [...saidasPorDia.values()].reduce((a, b) => a + b, 0) / saidasPorDia.size
    : 0
  const backlogDias = mediaSaidasDia > 0 ? Math.round(total / mediaSaidasDia * 10) / 10 : null

  // ─── Ritmo intradiário: conclusões de hoje por turno (manhã/tarde) ────────
  let manhaHoje = 0, tardeHoje = 0, semPeriodoHoje = 0
  for (const r of allRows) {
    if (!r._executadaHoje) continue
    const p = (r.periodo || '').toLowerCase()
    if      (p.includes('manh'))  manhaHoje++
    else if (p.includes('tarde')) tardeHoje++
    else                           semPeriodoHoje++
  }
  // Normaliza pela fração do turno decorrida: às 13h30 a tarde mal começou —
  // comparar com a manhã completa geraria falso positivo estrutural.
  const TARDE_INI_H = 13, TARDE_FIM_H = 18.5
  const horaAtual   = now.getHours() + now.getMinutes() / 60
  const fracTarde   = Math.max(0, Math.min(1, (horaAtual - TARDE_INI_H) / (TARDE_FIM_H - TARDE_INI_H)))
  const esperadoTarde = Math.round(manhaHoje * fracTarde)
  const ritmoIntradiario = {
    manha: manhaHoje, tarde: tardeHoje, semPeriodo: semPeriodoHoje,
    tardeIniciada: fracTarde > 0,
    fracTarde: Math.round(fracTarde * 100) / 100,
    esperadoTarde,
    // Só alerta com ≥35% do turno decorrido e produção < metade do esperado
    alerta: fracTarde >= 0.35 && manhaHoje >= 5 && tardeHoje < esperadoTarde * 0.5,
  }

  // ─── Meta do mês: concluídas no mês atual vs média dos 3 meses anteriores ─
  const monthKey   = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const curMonthKey = monthKey(now)
  const concluPorMes = new Map<string, number>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isRede(r)) continue
    if (!isExecucaoReal(r.descsituacao)) continue
    const dt = parseDate(r.databaixa) || parseDate(r.dataexecucao)
    if (!dt) continue
    const k = monthKey(dt)
    concluPorMes.set(k, (concluPorMes.get(k) ?? 0) + 1)
  }
  const concluidasMesAtual = concluPorMes.get(curMonthKey) ?? 0
  const baselineMeses = [1, 2, 3].map(i => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  const baselineVals  = baselineMeses.map(k => concluPorMes.get(k) ?? 0).filter(v => v > 0)
  const metaMesAtual  = baselineVals.length > 0 ? Math.round(baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length) : 0

  // Operação Cabonnet: equipes atuam sábado normalmente; domingo é só plantão
  // (2–4 técnicos) — dia útil = seg–sáb, domingo fora da meta e da projeção.
  const diasUteisAte = (ano: number, mes: number, diaFinal: number): number => {
    let n = 0
    for (let d = 1; d <= diaFinal; d++) {
      if (new Date(ano, mes, d).getDay() !== 0) n++
    }
    return n
  }
  const ultimoDiaMes      = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const diasUteisTotal    = diasUteisAte(now.getFullYear(), now.getMonth(), ultimoDiaMes)
  // Hoje conta como fração do expediente decorrido (7h–18h30), não como dia
  // inteiro — senão a projeção fica subestimada toda manhã.
  const EXP_INI_H = 7, EXP_FIM_H = 18.5
  const horaExp     = now.getHours() + now.getMinutes() / 60
  const fracaoHoje  = Math.max(0, Math.min(1, (horaExp - EXP_INI_H) / (EXP_FIM_H - EXP_INI_H)))
  const hojeEhUtil  = now.getDay() !== 0
  const diasUteisInteiros = diasUteisAte(now.getFullYear(), now.getMonth(), now.getDate()) - (hojeEhUtil ? 1 : 0)
  const diasUteisDecorr   = diasUteisInteiros + (hojeEhUtil ? fracaoHoje : 0)
  const diasUteisRestantes = Math.max(0, diasUteisTotal - Math.ceil(diasUteisDecorr))
  const pctMetaMes      = metaMesAtual > 0 ? Math.round(concluidasMesAtual / metaMesAtual * 100) : null
  const projecaoMesFinal = diasUteisDecorr >= 0.25
    ? Math.round(concluidasMesAtual / diasUteisDecorr * diasUteisTotal)
    : null
  const metaMesStatus: 'acima' | 'abaixo' | 'neutro' =
    metaMesAtual === 0 || projecaoMesFinal == null ? 'neutro'
    : projecaoMesFinal >= metaMesAtual ? 'acima' : 'abaixo'
  const metaMes = {
    concluidas: concluidasMesAtual, meta: metaMesAtual, pct: pctMetaMes,
    diasUteisRestantes, diasUteisTotal, projecaoFinal: projecaoMesFinal,
    status: metaMesStatus,
  }

  let concl = 0, totalPeriodo = 0, conclNoPrazo = 0
  const fornMap = new Map<string, { total: number; concluidas: number; noPrazo: number }>()
  for (const r of rows) {
    if (isCOPE(r) || isReagend(r)) continue
    const k = r._fornecedor === 'OUTRO' ? null : r._fornecedor
    if (k) {
      if (!fornMap.has(k)) fornMap.set(k, { total: 0, concluidas: 0, noPrazo: 0 })
      const f = fornMap.get(k)!
      f.total++
      if (isExecucaoReal(r.descsituacao)) f.concluidas++
      if (!estourouSLA(r)) f.noPrazo++
    }
    if (isRede(r)) continue
    totalPeriodo++
    if (isExecucaoReal(r.descsituacao)) {
      concl++
      // Atingimento: entregue dentro do SLA (aging congelado na baixa)
      if (r._agingAbertura != null && r._agingAbertura <= r._slaLimite) conclNoPrazo++
    }
  }
  const taxa = totalPeriodo > 0 ? Math.round(concl / totalPeriodo * 100) : 0
  // SLA de atingimento (fluxo): % das CONCLUÍDAS do período entregues no prazo.
  // Complementa o slaFila (estoque), que só enxerga o que ainda está na fila.
  const slaAtingimento = concl > 0 ? Math.round(conclNoPrazo / concl * 100) : null

  let prevConcl = 0, prevTotalPeriodo = 0
  const prevFornMap = new Map<string, { total: number; noPrazo: number }>()
  for (const r of prevRows) {
    const k = r._fornecedor === 'OUTRO' ? null : r._fornecedor
    if (k && !isCOPE(r) && !isReagend(r)) {
      if (!prevFornMap.has(k)) prevFornMap.set(k, { total: 0, noPrazo: 0 })
      const f = prevFornMap.get(k)!
      f.total++
      if (!estourouSLA(r)) f.noPrazo++
    }
    if (isCOPE(r) || isReagend(r) || isRede(r)) continue
    prevTotalPeriodo++
    if (isExecucaoReal(r.descsituacao)) prevConcl++
  }
  const prevTaxa = prevTotalPeriodo > 0 ? Math.round(prevConcl / prevTotalPeriodo * 100) : 0

  const mttrS      = mttrStats(rows)
  const mttr       = mttrS.p50
  const scorePulso = total > 0 ? scoreComposto(slaFila, taxa, mttr) : 0
  const scorePulsoLabel = scorePulso >= 85 ? 'Excelente' : scorePulso >= 70 ? 'Bom' : scorePulso >= 50 ? 'Regular' : 'Crítico'

  const scoreBreakdown = [
    { id: 'sla',  label: 'SLA da Fila',     value: slaFila,           weight: SCORE_PESOS.sla  },
    { id: 'taxa', label: 'Taxa Conclusão',  value: taxa,              weight: SCORE_PESOS.taxa },
    { id: 'mttr', label: 'MTTR',            value: mttrToScore(mttr), weight: SCORE_PESOS.mttr },
  ]

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
  if (slaAtingimento != null && slaAtingimento < 75)
    quickInsights.push({ level: 'red', text: `Só ${slaAtingimento}% das concluídas saíram dentro do prazo` })
  if (backlogDias != null && backlogDias > 3)
    quickInsights.push({ level: 'orange', text: `Fila equivale a ${backlogDias.toLocaleString('pt-BR')} dias de trabalho no ritmo atual` })

  const narrativaPulso = [
    `${total} OS ativa${total !== 1 ? 's' : ''}`,
    `${criticas} crítica${criticas !== 1 ? 's' : ''}`,
    `SLA ${slaFila}%`,
    mttr > 0 ? `MTTR ${mttr}d` : null,
    `${taxa}% concluídas no período`,
  ].filter(Boolean).join(' · ')

  // Instalação em massa no mesmo bairro é prática normal do PAP (arrastão), não indício de
  // falha de infraestrutura — só conta OS de Manutenção/Outro para "Cluster de Falha".
  const clusterBairroMap = new Map<string, { bairro: string; cidade: string; total: number }>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isRede(r) || r._tipo === 'INSTALACAO') continue
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
    score: scorePulso, scoreLabel: scorePulsoLabel, scoreBreakdown,
    narrativa: narrativaPulso, quickInsights,
    agingMed, agingDist, slaFila, slaAtingimento, semAgendamento,
    mttr, mttrP90: mttrS.p90, backlogDias,
    topCidadesCriticas, clustersAtivos, criticasTotal: criticas,
    entradasHoje, saidasHoje, fluxoHoje, entradaMediaDia: entradaMediaDia(allRows), metaMes, ritmoIntradiario,
  }

  const mkTrend = (cur: number, prev: number, higherIsBetter = true) => {
    if (!prev) return null
    const delta = cur - prev
    const pct   = Math.round(Math.abs(delta) / prev * 100)
    return { delta, pct, higherIsBetter }
  }

  const kpis: KPI[] = [
    { id: 'criticas', title: 'OS Críticas',      value: criticasHoje, sub: 'SLA 2× · agend. hoje',          accent: 'red'    },
    { id: 'semEq',    title: 'Sem Equipe',        value: semEquipe,  sub: 'pendente atribuição',            accent: 'orange' },
    { id: 'pend',     title: 'Pendentes',         value: pend,       sub: 'aguardando campo',               accent: 'yellow' },
    { id: 'atend',    title: 'Em Atendimento',    value: atend,      sub: 'em campo + agend. futuro',       accent: 'cyan'   },
    { id: 'copeAguardando', title: 'Aguard. Roteirização', value: copeAguardando, sub: 'parado no COPE',   accent: 'orange' },
    { id: 'reagendInviab', title: 'Reag. Inviab.', value: reagendInviab, sub: 'reagend. por inviabilidade',  accent: 'orange' },
    { id: 'reagendMobile', title: 'Reag. Mobile',  value: reagendMobile, sub: 'reagend. via OS mobile',      accent: 'orange' },
    { id: 'reagendFutura', title: 'Reag. Futura',  value: reagendFutura, sub: 'reagend. p/ data futura',     accent: 'orange' },
    { id: 'total',    title: 'Total OS',          value: total,      sub: 'fila ativa (pend. + atend.)',    accent: 'primary'},
    { id: 'rede',     title: 'OS Rede',           value: rede,       sub: 'fila ativa de rede',             accent: 'purple' },
    { id: 'concl',    title: 'Concluídas',        value: concl,      sub: `${taxa}% de conclusão`,          accent: 'green', trend: mkTrend(concl, prevConcl, true) },
    { id: 'taxa',     title: 'Taxa Conclusão',    value: `${taxa}%`, sub: 'do total do período',            accent: 'green', trend: mkTrend(taxa, prevTaxa, true) },
  ]

  // ─── Trajetória: saúde do período atual vs anterior ──────────────────────
  const hAtual  = periodHealth(rows)
  const hPrev   = periodHealth(prevRows)
  const temPrev = prevRows.length > 0
  const scoreTendencia = {
    atual:    hAtual.score,
    anterior: temPrev ? hPrev.score : null,
    delta:    temPrev ? hAtual.score - hPrev.score : null,
  }
  const mudancas  = temPrev ? buildMudancas(hAtual, hPrev) : []
  const metaScore = 85   // alvo de referência no gauge (limiar "Excelente"); configurável numa fase futura
  const projecaoRisco = buildProjecaoRisco(allRows)

  const fornecedores: FornCard[] = [...fornMap.entries()]
    .map(([k, { total: t, concluidas: c, noPrazo }]) => {
      // SLA = % dentro do prazo (estourouSLA); conclPct = throughput. São coisas
      // diferentes — o rótulo "SLA" já induziu leitura errada quando era conclusão.
      const sla      = t > 0 ? Math.round(noPrazo / t * 100) : 100
      const conclPct = t > 0 ? Math.round(c / t * 100) : 0
      const prevF    = prevFornMap.get(k)
      const prevSla  = prevF && prevF.total > 0 ? Math.round(prevF.noPrazo / prevF.total * 100) : 0
      return {
        nome: FORN_CFG[k]?.label ?? k, total: t, concluidas: c, sla, conclPct,
        cor: FORN_CFG[k]?.cor ?? '#64748b',
        slaTrend: mkTrend(sla, prevSla, true),
      }
    })
    .filter(f => f.total > 0)
    .sort((a, b) => b.total - a.total)

  return { kpis, fornecedores, pulso, scoreTendencia, mudancas, metaScore, projecaoRisco }
}

// ─── SLA ──────────────────────────────────────────────────────────────────────


