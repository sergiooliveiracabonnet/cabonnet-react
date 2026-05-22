// @ts-nocheck
import { shortEquipe } from '../../lib/osFormat'

// ── Scope identifiers ──────────────────────────────────────────────────────────
const INST_EQS = ['F01', 'F04', 'F05', 'F07', 'F20', 'F27', 'F45', 'F48', 'F49', 'F50']
const WES_EQS  = ['F08', 'F11', 'F36', 'F39', 'F44']
const THM_EQS  = ['F12', 'F13', 'F14']
const normEq   = s => (s || '').toUpperCase().replace(/([A-Z])\s+(\d)/g, '$1$2')

export const isRede = r =>
  (r.nomedaequipe || '').toUpperCase().includes('- REDE') || r._tipo === 'REDE'

export const isInstacable = r => {
  const eq = normEq(r.nomedaequipe)
  return eq.includes('INSTALAC') && INST_EQS.some(f => eq.includes(f))
}

export const isWES = r => {
  const eq = normEq(r.nomedaequipe)
  return WES_EQS.some(f => eq.includes(f))
}

export const isTHM = r => {
  const eq = normEq(r.nomedaequipe)
  return THM_EQS.some(f => eq.includes(f))
}

export const ABA_LABEL = { global: 'Global', instacable: 'Instacable', wes: 'WES', thm: 'THM', rede: 'Rede' }

// ── Period helpers ─────────────────────────────────────────────────────────────
export function getPeriodDates(periodo, customFrom, customTo) {
  if (periodo === 'personalizado') return { from: customFrom, to: customTo }

  const hoje = new Date()
  const to   = new Date(hoje); to.setHours(23, 59, 59, 999)
  const from = new Date(hoje); from.setHours(0, 0, 0, 0)

  if (periodo === 'ontem') {
    from.setDate(from.getDate() - 1)
    const fim = new Date(from); fim.setHours(23, 59, 59, 999)
    return { from, to: fim }
  }
  if (periodo === 'semanal')   { from.setDate(from.getDate() - 6);  return { from, to } }
  if (periodo === 'quinzenal') { from.setDate(from.getDate() - 14); return { from, to } }
  if (periodo === 'mensal')    { from.setDate(1); return { from, to } }
  if (periodo === 'fechamento') {
    const ano = hoje.getFullYear(), mes = hoje.getMonth()
    return {
      from: new Date(ano, mes - 1, 20, 0, 0, 0, 0),
      to:   new Date(ano, mes,     20, 23, 59, 59, 999),
    }
  }
  return { from, to } // diario
}

export function getPeriodoNome(periodo) {
  const hoje = new Date()
  if (periodo === 'mensal') {
    const m = hoje.toLocaleString('pt-BR', { month: 'long' })
    return `Mês de ${m.charAt(0).toUpperCase() + m.slice(1)}`
  }
  if (periodo === 'fechamento') {
    const mesAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      .toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
    const mesAt  = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      .toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
    return `Fechamento 20/${mesAnt} – 20/${mesAt}`
  }
  const map = { diario: 'Diário', ontem: 'Ontem', semanal: 'Semanal (7d)', quinzenal: 'Quinzenal (15d)', personalizado: 'Personalizado' }
  return map[periodo] || periodo
}

// ── Row filtering ──────────────────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null
  const dateOnly = s.split(' ')[0]
  const parts = dateOnly.split(/[\/\\]/)
  if (parts.length < 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

export function filterRows(allRows, { aba, from, to }) {
  if (!allRows?.length) return []

  const base = allRows.filter(r => {
    const sit = r.descsituacao
    let d
    if (sit === 'Concluída' || sit === 'Atendimento/Finalizadas') {
      d = parseDate(r.dataexecucao) || parseDate(r.dataagendamento) || parseDate(r.datacadastro)
    } else {
      d = parseDate(r.dataagendamento) || parseDate(r.datacadastro)
      if (!d && (sit === 'Pendente' || sit === 'Atendimento')) return !from
    }
    if (!d) return false
    if (from && d < from) return false
    if (to   && d > to)   return false
    return true
  })

  switch (aba) {
    case 'instacable': return base.filter(isInstacable)
    case 'wes':        return base.filter(isWES)
    case 'thm':        return base.filter(isTHM)
    case 'rede':       return base.filter(isRede)
    default:           return base
  }
}

// ── Stats calculation ──────────────────────────────────────────────────────────
function tipoKey(r) {
  const t = (r.tiposervico || '').toUpperCase()
  if (t.includes('INSTALACAO') || t.includes('INSTALAÇÃO')) return 'Instalação'
  if (t.includes('MANUTENCAO') || t.includes('MANUTENÇÃO')) return 'Manutenção'
  if (t.includes('SERVICO')    || t.includes('SERVIÇO'))    return 'Serviço'
  return 'Outros'
}

export const SLA_MIN = 80

export function calcStats(rows, aba) {
  const total      = rows.length
  const concluidas = rows.filter(r => r.descsituacao === 'Concluída').length
  const semExec    = rows.filter(r => r.descsituacao === 'Concluída/Sem Execução').length
  const pendentes  = rows.filter(r => r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento').length
  const slaVenc    = rows.filter(r => r._slaExcedido || r._slaCritico).length

  // By team — pre-seed known fronts for instacable/wes so they always appear
  const byEquipe = {}
  if (aba === 'instacable') {
    INST_EQS.forEach(f => { byEquipe[`INST ${f}`] = { exec: 0, semExec: 0, pend: 0, slaVenc: 0 } })
  } else if (aba === 'wes') {
    WES_EQS.forEach(f => { byEquipe[`INST ${f}`] = { exec: 0, semExec: 0, pend: 0, slaVenc: 0 } })
  } else if (aba === 'thm') {
    THM_EQS.forEach(f => { byEquipe[`INST ${f}`] = { exec: 0, semExec: 0, pend: 0, slaVenc: 0 } })
  }
  rows.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe) || '(sem equipe)'
    if (!byEquipe[eq]) byEquipe[eq] = { exec: 0, semExec: 0, pend: 0, slaVenc: 0 }
    const d = byEquipe[eq]
    if (r.descsituacao === 'Concluída')              d.exec++
    if (r.descsituacao === 'Concluída/Sem Execução') d.semExec++
    if (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento') {
      d.pend++
      if (r._slaExcedido || r._slaCritico) d.slaVenc++
    }
  })

  // By city
  const byCidade = {}
  rows.forEach(r => {
    const cidade = (r.nomedacidade || '(sem cidade)').trim()
    if (!byCidade[cidade]) byCidade[cidade] = { exec: 0, semExec: 0, pend: 0, slaVenc: 0, agingSum: 0, agingCnt: 0 }
    const d = byCidade[cidade]
    if (r.descsituacao === 'Concluída')              d.exec++
    if (r.descsituacao === 'Concluída/Sem Execução') d.semExec++
    if (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento') {
      d.pend++
      if (r._aging != null && r._aging >= 0) { d.agingSum += r._aging; d.agingCnt++ }
      if (r._slaExcedido || r._slaCritico)   d.slaVenc++
    }
  })

  // By type
  const byTipo = {}
  rows.forEach(r => {
    const tipo = tipoKey(r)
    if (!byTipo[tipo]) byTipo[tipo] = { exec: 0, semExec: 0, pend: 0, slaVenc: 0 }
    const d = byTipo[tipo]
    if (r.descsituacao === 'Concluída')              d.exec++
    if (r.descsituacao === 'Concluída/Sem Execução') d.semExec++
    if (r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento') {
      d.pend++
      if (r._slaExcedido || r._slaCritico) d.slaVenc++
    }
  })

  return { total, concluidas, semExec, pendentes, slaVenc, byEquipe, byCidade, byTipo }
}

// ── CSV export ─────────────────────────────────────────────────────────────────
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportRelatorioCSV(rows, rede, stats, statsRede, periodoLabel) {
  const SEP = '\n\n'

  // OS completas
  const OSH = ['numos', 'nomecliente', 'nomedaequipe', 'nomedacidade', 'bairro',
               'descsituacao', 'tiposervico', 'servico', 'dataagendamento', 'dataexecucao', 'datacadastro',
               '_aging', '_slaExcedido', '_slaCritico']
  const rowsOS = [OSH.join(';'), ...rows.map(r => OSH.map(h => csvCell(r[h])).join(';'))]

  // Por equipe
  const rowsEq = [['equipe', 'exec', 'sem_exec', 'pendentes', 'sla_vencidas', 'taxa_pct'].join(';')]
  Object.entries(stats.byEquipe).sort((a, b) => b[1].exec - a[1].exec).forEach(([eq, d]) => {
    const tot = d.exec + d.semExec + d.pend
    rowsEq.push([eq, d.exec, d.semExec, d.pend, d.slaVenc, (tot > 0 ? Math.round(d.exec / tot * 100) : 0) + '%'].join(';'))
  })

  // Por cidade
  const rowsCid = [['cidade', 'exec', 'sem_exec', 'pendentes', 'sla_vencidas', 'aging_medio', 'taxa_pct'].join(';')]
  Object.entries(stats.byCidade).sort((a, b) => b[1].exec - a[1].exec).forEach(([cidade, d]) => {
    const tot = d.exec + d.semExec + d.pend
    const agMed = d.agingCnt > 0 ? (d.agingSum / d.agingCnt).toFixed(1) : '—'
    rowsCid.push([csvCell(cidade), d.exec, d.semExec, d.pend, d.slaVenc, agMed, (tot > 0 ? Math.round(d.exec / tot * 100) : 0) + '%'].join(';'))
  })

  // Por tipo
  const rowsTipo = [['tipo', 'exec', 'sem_exec', 'pendentes', 'sla_vencidas', 'taxa_pct'].join(';')]
  ;['Instalação', 'Manutenção', 'Serviço', 'Outros'].filter(t => stats.byTipo[t]).forEach(t => {
    const d = stats.byTipo[t]
    const tot = d.exec + d.semExec + d.pend
    rowsTipo.push([t, d.exec, d.semExec, d.pend, d.slaVenc, (tot > 0 ? Math.round(d.exec / tot * 100) : 0) + '%'].join(';'))
  })

  // Rede
  let csvRede = '(sem OS de Rede no período)'
  if (statsRede) {
    const lines = ['=== REDE — RESUMO ===', ['equipe', 'exec', 'sem_exec', 'pendentes', 'sla_vencidas', 'taxa_pct'].join(';')]
    Object.entries(statsRede.byEquipe).sort((a, b) => b[1].exec - a[1].exec).forEach(([eq, d]) => {
      const tot = d.exec + d.semExec + d.pend
      lines.push([eq, d.exec, d.semExec, d.pend, d.slaVenc, (tot > 0 ? Math.round(d.exec / tot * 100) : 0) + '%'].join(';'))
    })
    lines.push('', '=== REDE — CLIENTES ATENDIDOS ===', ['cidade', 'numos', 'nomecliente', 'servico', 'equipe'].join(';'))
    rede.filter(r => r.descsituacao === 'Concluída').forEach(r => {
      lines.push([csvCell(r.nomedacidade), csvCell(r.numos), csvCell(r.nomecliente), csvCell(r.servico), csvCell(shortEquipe(r.nomedaequipe))].join(';'))
    })
    csvRede = lines.join('\n')
  }

  const content = [
    `=== RELATÓRIO DE FECHAMENTO: ${periodoLabel} ===`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    '=== OS COMPLETAS (SEM REDE) ===\n' + rowsOS.join('\n'),
    '=== RESUMO POR EQUIPE ===\n' + rowsEq.join('\n'),
    '=== RESUMO POR CIDADE ===\n' + rowsCid.join('\n'),
    '=== RESUMO POR TIPO DE OS ===\n' + rowsTipo.join('\n'),
    '=== REDE ===\n' + csvRede,
  ].join(SEP)

  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = `relatorio-cabonnet-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}
