import { isExecucaoReal } from '../transform'
import type { OSRow, Fornecedor } from '../types'
import { avg, calcMTTR, scoreComposto, shortName } from './_helpers'

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


