import { isExecucaoReal, isCOPE, isReagend, parseDate } from '../transform'
import type { OSRow, KPI } from '../types'
import { shortName } from './_helpers'

export function buildCampo(rows: OSRow[], allRowsForRitmo?: OSRow[]) {
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

  // Ritmo compara "hoje" com o mesmo dia da semana em ocorrências passadas.
  // Isso não pode ficar restrito ao filtro de data global da UI — com o
  // filtro padrão "hoje", `rows` só teria a data de hoje e nunca haveria
  // histórico algum. `allRowsForRitmo` (quando informado) é a base completa,
  // sem o corte de período selecionado.
  const ritmoBase  = (allRowsForRitmo ?? rows).filter(r => !isCOPE(r) && !isReagend(r))
  const ritmoConcl = ritmoBase.filter(r => isExecucaoReal(r.descsituacao))
  const allConclDates = [...new Set(
    ritmoConcl.map(r => (r.dataagendamento||'').split(' ')[0]).filter(Boolean)
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
  }
  const eqMap = new Map<string, EqEntry>()
  for (const r of base) {
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!eqMap.has(eq)) eqMap.set(eq, { fila: 0, concl: 0, slaExc: 0, minDiasAteSLA: Infinity })
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
    }
  }

  interface RitmoEntry { conclHoje: number; conclPorData: Record<string, number> }
  const ritmoMap = new Map<string, RitmoEntry>()
  for (const r of ritmoConcl) {
    const eq = (r.nomedaequipe || '').trim() || 'Sem equipe'
    if (!ritmoMap.has(eq)) ritmoMap.set(eq, { conclHoje: 0, conclPorData: {} })
    const e = ritmoMap.get(eq)!
    const dData = (r.dataagendamento||'').split(' ')[0]
    if (dData === todayStr) e.conclHoje++
    else if (sameWeekdayDates.includes(dData)) e.conclPorData[dData] = (e.conclPorData[dData] || 0) + 1
  }

  const semaforo = [...eqMap.entries()]
    .filter(([, e]) => e.fila + e.concl > 0)
    .map(([nome, e]) => {
      const t = e.fila + e.concl
      const tx = t > 0 ? Math.round(e.concl / t * 100) : 0
      const diasAteSLA = e.minDiasAteSLA === Infinity ? null : e.minDiasAteSLA
      const ritmoEntry = ritmoMap.get(nome)
      const conclHojeEq = ritmoEntry?.conclHoje ?? 0
      const baselineVals = ritmoEntry ? sameWeekdayDates.map(d => ritmoEntry.conclPorData[d] || 0) : []
      const baseline = baselineVals.length > 0
        ? baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length
        : null
      const projetado = baseline !== null && dayFraction > 0.1
        ? Math.round(conclHojeEq / dayFraction)
        : null
      const ritmoHoje = baseline !== null ? {
        atual: conclHojeEq, projetado,
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

  const conclHoje = ritmoConcl.filter(r => (r.dataagendamento||'').startsWith(todayStr)).length
  const globalBaselineVals = sameWeekdayDates.map(d =>
    ritmoConcl.filter(r => (r.dataagendamento||'').startsWith(d)).length
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

