import { isCOPE, isReagend, parseDate } from '../transform'
import type { OSRow } from '../types'

// ─── Revisitas — helpers internos ───────────────────────────────────────────

// Estimativas não calibradas — nenhum destes valores foi medido para esta operação.
// Servem só para dar uma ordem de grandeza até existir custo real por visita técnica
// e uma classificação real de causa (ver ai.revisitasCausa) medindo evitabilidade de fato.
const CUSTO_REVISITA_ESTIMADO  = 180
const EVIT_INST_RATE_ESTIMADO  = 0.70
const EVIT_MANUT_RATE_ESTIMADO = 0.50
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
  const evitaveisCount = Math.round(revInst * EVIT_INST_RATE_ESTIMADO + revManut * EVIT_MANUT_RATE_ESTIMADO)
  const evitaveisPct   = totalRevisitas > 0 ? Math.round(evitaveisCount / totalRevisitas * 100) : 0
  const custoEstimado  = totalRevisitas * CUSTO_REVISITA_ESTIMADO

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

  // Causa raiz real (não estimada) é calculada sob demanda pela IA a partir das observações
  // de cada par OS-origem/OS-revisita — ver ai.revisitasCausa() e CausaRaizSection.tsx.
  // Removido daqui um breakdown de causas com percentuais fixos que nunca foram medidos.

  const cronicos = cronicosRaw.sort((a, b) => b.count - a.count).slice(0, 10)
  const chart    = { labels: ['Instalação', 'Manutenção', 'Serviço'], values: [revInst, revManut, revServ] }

  return {
    taxa, narrativa, hipoteses, cronicos, chart,
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
