interface CapacidadeOpts {
  metaInst?:   number
  metaManut?:  number
  metaServ?:   number
  dateFilter?: { from?: Date | null; to?: Date | null } | null
}

import { isExecucaoReal, isCOPE, isReagend } from '../transform'
import type { OSRow } from '../types'
import { shortName } from './_helpers'

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


