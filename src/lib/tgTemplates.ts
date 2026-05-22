// @ts-nocheck
// Templates de mensagens Telegram — portados de C:\Cabonnet\js\navigation.js
import { shortEquipe } from './osFormat'
import { getSlaLimite } from './transform'

const DIV  = '─'.repeat(24)
const DIVS = '─'.repeat(20)
const EMP  = 'CABONNET'

const esc   = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const hoje  = () => new Date().toLocaleDateString('pt-BR')
const hora  = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const rod   = () => `<i>${EMP} · Gestão de OS · ${hoje()}</i>`

// data no formato dd/mm/aaaa para comparar com campos de data das OS
const toHojeStr = () => {
  const n = new Date()
  return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`
}
const isHoje = r => (r.dataexecucao ?? r.dataagendamento ?? '').startsWith(toHojeStr())

const isCampo = eq => {
  const u = (eq ?? '').toUpperCase()
  return !u.includes('COPE') && !u.includes('ATENDIMENTO') && !u.includes('REAGENDAMENTO') && !u.includes('MIGRADO') && !u.includes('REDE')
}

const semRede = rows => rows.filter(r => r._tipo !== 'REDE')

// ─── Template 1: OS Críticas ─────────────────────────────────────────────────
export function tgCriticas(rows) {
  rows = semRede(rows)
  const criticasAll = rows
    .filter(r => ['Atendimento','Pendente'].includes(r.descsituacao))
    .filter(r => r._slaCritico || r._slaExcedido)
    .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0))

  const criticas   = criticasAll.slice(0, 20)
  const nivelCrit  = criticasAll.filter(r => r._slaCritico).length
  const nivelExc   = criticasAll.filter(r => !r._slaCritico && r._slaExcedido).length
  const vtCrit     = criticasAll.filter(r => (r.servico ?? '').toUpperCase().includes('VT')).length
  const instCrit   = criticasAll.filter(r => (r.tiposervico ?? '').toUpperCase().includes('INSTALACAO')).length
  const manutCrit  = criticasAll.filter(r => (r.tiposervico ?? '').toUpperCase().includes('MANUTENCAO')).length

  // resumo por equipe (top 4 mais afetadas)
  const byEq = {}
  criticasAll.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe) ?? 'Sem equipe'
    byEq[eq] = (byEq[eq] ?? 0) + 1
  })
  const topEqs = Object.entries(byEq).sort((a, b) => b[1] - a[1]).slice(0, 4)

  let m = `🔴 <b>${EMP} — OS CRÍTICAS</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIV}\n\n`

  // bloco de resumo
  m += `🔴 <b>${nivelCrit}</b> nível crítico  ·  🟡 <b>${nivelExc}</b> excedidas`
  if (criticasAll.length > 20) m += `  <i>(top 20 de ${criticasAll.length})</i>`
  m += '\n'

  const tags = []
  if (vtCrit)    tags.push(`${vtCrit} VT`)
  if (instCrit)  tags.push(`${instCrit} Inst`)
  if (manutCrit) tags.push(`${manutCrit} Manut`)
  if (tags.length) m += `📊 ${tags.join(' · ')}\n`
  if (topEqs.length) m += `👥 ${topEqs.map(([eq, n]) => `${esc(eq)} ×${n}`).join('  ')}\n`
  m += '\n'

  if (!criticas.length) {
    m += '🟢 <i>Nenhuma OS com SLA excedido no momento.</i>\n'
  } else {
    // 2 linhas por OS, sem divisores internos — melhora escaneabilidade
    criticas.forEach(r => {
      const sla    = getSlaLimite(r.tiposervico, r.servico)
      const aging  = r._agingAbertura ?? 0
      const excede = Math.max(0, aging - sla.limite)
      const cli    = esc((r.nomecliente ?? '').split(' ').slice(0, 3).join(' '))
      const cidade = esc(r.nomedacidade ?? '')
      const equipe = esc(shortEquipe(r.nomedaequipe) ?? 'Sem equipe')
      const ico    = r._slaCritico ? '🔴' : '🟡'
      m += `${ico} <b>OS ${r.numos}</b>  +${excede}d  <i>${equipe}</i>\n`
      m += `   ${cli}${cidade ? ' · ' + cidade : ''}  ·  ${aging}d / lim. ${sla.limite}d\n`
    })
  }
  m += `\n${DIV}\n${rod()}`
  return m
}

// ─── Template 2: Carga por Equipe ────────────────────────────────────────────
export function tgEquipes(rows) {
  rows = semRede(rows)
  const ativas = rows.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao) && r.nomedaequipe && isCampo(r.nomedaequipe))

  // execuções de hoje por equipe (para marcar paradas)
  const execByEq = {}
  rows.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe)
    if (!eq || !isCampo(r.nomedaequipe)) return
    if (!execByEq[eq]) execByEq[eq] = 0
    if (r.descsituacao === 'Concluída' && isHoje(r)) execByEq[eq]++
  })

  const byEq = {}
  ativas.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe)
    if (!byEq[eq]) byEq[eq] = { inst: 0, manut: 0, serv: 0, crit: 0, total: 0 }
    const t = (r.tiposervico ?? '').toUpperCase()
    if (t.includes('INSTALACAO'))      byEq[eq].inst++
    else if (t.includes('MANUTENCAO')) byEq[eq].manut++
    else                               byEq[eq].serv++
    if (r._slaCritico || r._slaExcedido) byEq[eq].crit++
    byEq[eq].total++
  })

  const sorted     = Object.entries(byEq).sort((a, b) => b[1].total - a[1].total)
  const totalGeral = ativas.length
  const totalCrit  = ativas.filter(r => r._slaCritico || r._slaExcedido).length
  const semEq      = rows.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao) && !r.nomedaequipe).length
  const nParadas   = sorted.filter(([eq]) => (execByEq[eq] ?? 0) === 0).length

  let m = `📋 <b>${EMP} — CARGA POR EQUIPE</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIV}\n\n`

  // sumário executivo
  m += `📦 <b>${totalGeral} OS em campo</b>`
  if (semEq)     m += `  ·  ⚠️ <b>${semEq} sem equipe</b>`
  if (totalCrit) m += `  ·  🔴 <b>${totalCrit} crítica${totalCrit > 1 ? 's' : ''}</b>`
  if (nParadas)  m += `  ·  ⛔ <b>${nParadas} parada${nParadas > 1 ? 's' : ''}</b>`
  m += '\n\n'

  if (!sorted.length) {
    m += '<i>Nenhuma OS ativa no período.</i>\n'
  } else {
    sorted.forEach(([eq, d]) => {
      const parts = []
      if (d.inst)  parts.push(`${d.inst} Inst`)
      if (d.manut) parts.push(`${d.manut} Manut`)
      if (d.serv)  parts.push(`${d.serv} Serv`)
      const critTag  = d.crit > 0 ? `  🔴 ${d.crit}` : ''
      const paradaTag = (execByEq[eq] ?? 0) === 0 ? ' ⛔' : ''
      const bar      = Math.round(d.total / Math.max(totalGeral, 1) * 10)
      const barStr   = '▓'.repeat(bar) + '░'.repeat(10 - bar)
      const pct      = Math.round(d.total / Math.max(totalGeral, 1) * 100)
      m += `<b>${esc(eq)}</b>${paradaTag}  ${parts.join(' · ')}${critTag}\n`
      m += `<code>${barStr}</code> ${d.total} OS (${pct}%)\n`
    })
  }
  m += `\n${DIV}\n${rod()}`
  return m
}

// ─── Template 3: Semáforo SLA ─────────────────────────────────────────────────
export function tgSLA(rows) {
  rows = semRede(rows)
  const ativas = rows.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao) && r.nomedaequipe && isCampo(r.nomedaequipe))

  const byEq = {}
  ativas.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe)
    if (!byEq[eq]) byEq[eq] = { total: 0, criticas: 0, excedidas: 0, ok: 0 }
    byEq[eq].total++
    if (r._slaCritico)       byEq[eq].criticas++
    else if (r._slaExcedido) byEq[eq].excedidas++
    else                     byEq[eq].ok++
  })
  const sorted = Object.entries(byEq)
    .filter(e => e[1].total >= 1)
    .sort((a, b) => b[1].criticas - a[1].criticas || b[1].excedidas - a[1].excedidas || b[1].total - a[1].total)

  const tC    = sorted.reduce((s, e) => s + e[1].criticas, 0)
  const tE    = sorted.reduce((s, e) => s + e[1].excedidas, 0)
  const tO    = sorted.reduce((s, e) => s + e[1].ok, 0)
  const total = tC + tE + tO
  const pctOk = total > 0 ? Math.round(tO / total * 100) : 100
  const confIco = pctOk >= 80 ? '🟢' : pctOk >= 60 ? '🟡' : '🔴'

  let m = `🚦 <b>${EMP} — SEMÁFORO SLA</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIV}\n\n`

  // painel de totais
  m += `🔴 <b>${tC}</b> crítica${tC !== 1 ? 's' : ''}  ·  🟡 <b>${tE}</b> excedida${tE !== 1 ? 's' : ''}  ·  🟢 <b>${tO}</b> no prazo\n`
  m += `${confIco} Conformidade: <b>${pctOk}%</b>  ·  ${total} OS ativas\n\n`

  sorted.forEach(([eq, d]) => {
    const ico = d.criticas > 0 ? '🔴' : d.excedidas > 0 ? '🟡' : '🟢'
    m += `${ico} <b>${esc(eq)}</b>  ${d.total} OS`
    if (d.criticas)  m += `  · 🔴 <b>${d.criticas}</b>`
    if (d.excedidas) m += `  · 🟡 ${d.excedidas}`
    if (d.ok)        m += `  · 🟢 ${d.ok}`
    m += '\n'
  })
  m += `\n${DIV}\n${rod()}`
  return m
}

// ─── Template 4: Pulso Operacional ───────────────────────────────────────────
export function tgPulso(rows) {
  rows = semRede(rows)
  const ativas   = rows.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao))
  const execHoje = rows.filter(r => r.descsituacao === 'Concluída' && isHoje(r))
  const criticas = ativas.filter(r => r._slaCritico || r._slaExcedido)
  const semEq    = ativas.filter(r => !r.nomedaequipe?.trim())

  const byEq = {}
  rows.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe)
    if (!eq || !isCampo(r.nomedaequipe)) return
    if (!byEq[eq]) byEq[eq] = { exec: 0, fila: 0 }
    if (r.descsituacao === 'Concluída' && isHoje(r)) byEq[eq].exec++
    if (['Atendimento','Pendente'].includes(r.descsituacao)) byEq[eq].fila++
  })
  const paradas = Object.entries(byEq).filter(([, d]) => d.exec === 0 && d.fila >= 3)

  const totalOp  = execHoje.length + ativas.length
  const taxa     = totalOp > 0 ? Math.round(execHoje.length / totalOp * 100) : 0
  const taxaIco  = taxa >= 80 ? '🟢' : taxa >= 60 ? '🟡' : '🔴'

  // status geral calculado a partir dos alertas ativos
  const statusGeral = criticas.length === 0 && paradas.length === 0
    ? '🟢 Normal'
    : criticas.length > 5 || paradas.length > 2
      ? '🔴 Crítico'
      : '🟡 Atenção'

  let m = `⚡ <b>${EMP} — PULSO OPERACIONAL</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIVS}\n\n`

  m += `Status: <b>${statusGeral}</b>\n\n`

  // alinhamento fixo para facilitar leitura em monospace
  m += `✅ Executadas hoje:     <b>${execHoje.length}</b>\n`
  m += `⏳ Fila ativa:         <b>${ativas.length}</b>\n`
  m += `${taxaIco} Taxa conclusão:    <b>${taxa}%</b>\n`
  if (criticas.length) m += `🔴 SLA crítico/excedido: <b>${criticas.length}</b>\n`
  if (semEq.length)    m += `⚠️ Sem equipe:           <b>${semEq.length}</b>\n`
  if (paradas.length)  m += `⛔ Equipes paradas:      <b>${paradas.length}</b>\n`

  m += `\n${DIVS}\n${rod()}`
  return m
}

// ─── Template 5: Executadas Hoje por Cidade ──────────────────────────────────
export function tgExecutadas(rows) {
  rows = semRede(rows)
  const execHoje = rows.filter(r => r.descsituacao === 'Concluída' && isHoje(r))

  const byCidade = {}
  execHoje.forEach(r => {
    const c = (r.nomedacidade ?? '').trim() || 'Não informada'
    if (!byCidade[c]) byCidade[c] = { inst: 0, manut: 0, serv: 0, total: 0 }
    const t = (r.tiposervico ?? '').toUpperCase()
    if (t.includes('INSTALACAO'))      byCidade[c].inst++
    else if (t.includes('MANUTENCAO')) byCidade[c].manut++
    else                               byCidade[c].serv++
    byCidade[c].total++
  })
  const sorted     = Object.entries(byCidade).sort((a, b) => b[1].total - a[1].total)
  const totalInst  = execHoje.filter(r => (r.tiposervico ?? '').toUpperCase().includes('INSTALACAO')).length
  const totalManut = execHoje.filter(r => (r.tiposervico ?? '').toUpperCase().includes('MANUTENCAO')).length
  const totalServ  = execHoje.length - totalInst - totalManut

  let m = `✅ <b>${EMP} — EXECUTADAS HOJE</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIV}\n\n`

  m += `<b>${execHoje.length} OS concluídas</b>`
  const tags = []
  if (totalInst)  tags.push(`${totalInst} Inst`)
  if (totalManut) tags.push(`${totalManut} Manut`)
  if (totalServ)  tags.push(`${totalServ} Serv`)
  if (tags.length) m += `  ·  ${tags.join(' · ')}`
  m += '\n\n'

  if (!sorted.length) {
    m += '<i>Nenhuma OS concluída ainda hoje.</i>\n'
  } else {
    sorted.forEach(([cidade, d]) => {
      const parts = []
      if (d.inst)  parts.push(`${d.inst} Inst`)
      if (d.manut) parts.push(`${d.manut} Manut`)
      if (d.serv)  parts.push(`${d.serv} Serv`)
      m += `📍 <b>${esc(cidade)}</b>  ${d.total}  ·  ${parts.join(' · ')}\n`
    })
  }
  m += `\n${DIV}\n${rod()}`
  return m
}

// ─── Template 6: Equipes Inativas ────────────────────────────────────────────
export function tgEquipeInativa(rows) {
  rows = semRede(rows)
  const byEq = {}
  rows.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe)
    if (!eq || !isCampo(r.nomedaequipe ?? '')) return
    if (!byEq[eq]) byEq[eq] = { exec: 0, fila: 0 }
    if (r.descsituacao === 'Concluída' && isHoje(r)) byEq[eq].exec++
    if (['Atendimento','Pendente'].includes(r.descsituacao)) byEq[eq].fila++
  })
  const paradas = Object.entries(byEq)
    .filter(([, d]) => d.exec === 0 && d.fila >= 3)
    .sort((a, b) => b[1].fila - a[1].fila)
  const totalRepresado = paradas.reduce((s, [, d]) => s + d.fila, 0)

  let m = `⛔ <b>${EMP} — EQUIPES SEM EXECUÇÃO</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIV}\n\n`

  if (!paradas.length) {
    m += '🟢 <i>Todas as equipes com produção registrada.</i>\n'
  } else {
    m += `<b>${paradas.length} equipe${paradas.length > 1 ? 's' : ''} sem OS concluída</b>  ·  ${totalRepresado} OS represadas\n\n`
    paradas.forEach(([eq, d]) => {
      // urgência graduada: crítico ≥6, atenção ≥4, observação <4
      const ico = d.fila >= 6 ? '🔴' : d.fila >= 4 ? '🟡' : '🟠'
      m += `${ico} <b>${esc(eq)}</b>  —  ${d.fila} na fila\n`
    })
  }
  m += `\n${DIV}\n${rod()}`
  return m
}

// ─── Template 7: Fila Residual ────────────────────────────────────────────────
export function tgFilaResidual(rows) {
  rows = semRede(rows)
  const ativas = rows.filter(r => ['Atendimento','Pendente'].includes(r.descsituacao) && r.nomedaequipe && isCampo(r.nomedaequipe))
  const execHoje = rows.filter(r => r.descsituacao === 'Concluída' && isHoje(r)).length

  const byEq = {}
  ativas.forEach(r => {
    const eq = shortEquipe(r.nomedaequipe)
    byEq[eq] = (byEq[eq] ?? 0) + 1
  })
  const sorted = Object.entries(byEq).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])

  let m = `⏰ <b>${EMP} — FILA RESIDUAL 16:30</b>\n`
  m += `📅 <i>${hoje()} às ${hora()}</i>\n${DIV}\n\n`

  // contexto do dia junto com o pendente
  m += `📦 <b>${ativas.length} OS em aberto</b>  ·  ✅ ${execHoje} concluídas no dia\n\n`

  if (!sorted.length) {
    m += '🟢 <i>Nenhuma equipe com fila residual significativa.</i>\n'
  } else {
    sorted.forEach(([eq, n]) => {
      const ico = n >= 5 ? '🔴' : n >= 3 ? '🟡' : '🟠'
      m += `${ico} <b>${esc(eq)}</b>  —  ${n} OS restante${n > 1 ? 's' : ''}\n`
    })
  }
  m += `\n${DIV}\n${rod()}`
  return m
}
