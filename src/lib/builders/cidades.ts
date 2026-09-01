import { isCOPE, isReagend, isExecucaoReal, parseDate } from '../transform'
import type { OSRow, KPI, CidadeSaude } from '../types'
import { avg, estourouSLA } from './_helpers'

// ─── Saúde por Cidade ─────────────────────────────────────────────────────────
// Recebe allRows (ao vivo, ignora filtro de data): a fila é um conceito de
// estoque atual e a capacidade vem das execuções dos últimos 14 dias.
// Exclui COPE/Reagendamento (não são fila de campo) e REDE (infra, não cidade).

const JANELA_CAPACIDADE_DIAS = 14

export function buildCidades(allRows: OSRow[]) {
  const hoje    = new Date()
  const hojeStr = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`

  interface Acc {
    fila: number; atend: number; pend: number
    criticas: number; breach: number; semEq: number
    agingArr: number[]; exec14: number
  }
  const porCidade = new Map<string, Acc>()
  const acc = (c: string): Acc => {
    let e = porCidade.get(c)
    if (!e) { e = { fila: 0, atend: 0, pend: 0, criticas: 0, breach: 0, semEq: 0, agingArr: [], exec14: 0 }; porCidade.set(c, e) }
    return e
  }

  // Dias úteis com execução na janela (denominador único p/ todas as cidades —
  // dividir cada cidade pelos próprios dias inflaria a taxa das pequenas).
  const diasComExec = new Set<string>()

  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || r._tipo === 'REDE') continue
    const cidade = (r.nomedacidade || 'Sem cidade').trim()

    if (['Pendente', 'Atendimento'].includes(r.descsituacao)) {
      const e = acc(cidade)
      e.fila++
      if (r.descsituacao === 'Atendimento') e.atend++
      else e.pend++
      if (r._slaCritico) e.criticas++
      if (estourouSLA(r)) e.breach++
      if (!r.nomedaequipe?.trim()) e.semEq++
      if (r._aging != null) e.agingArr.push(r._aging)
      continue
    }

    if (!isExecucaoReal(r.descsituacao)) continue
    const day = (r.dataexecucao || r.databaixa || '').split(' ')[0]
    if (!day || day === hojeStr) continue
    const dt = parseDate(day)
    // Domingo é plantão (2–4 técnicos) — não representa a capacidade real
    if (!dt || dt.getDay() === 0 || (hoje.getTime() - dt.getTime()) > JANELA_CAPACIDADE_DIAS * 86400000) continue
    acc(cidade).exec14++
    diasComExec.add(day)
  }

  const nDias     = diasComExec.size
  const filaTotal = [...porCidade.values()].reduce((s, e) => s + e.fila, 0)
  const execTotal = [...porCidade.values()].reduce((s, e) => s + e.exec14, 0)

  const saude: CidadeSaude[] = [...porCidade.entries()]
    .filter(([, e]) => e.fila > 0 || e.exec14 > 0)
    .map(([cidade, e]) => {
      const saidasDia   = nDias > 0 ? Math.round(e.exec14 / nDias * 10) / 10 : 0
      const backlogDias = saidasDia > 0 ? Math.round(e.fila / saidasDia * 10) / 10 : null
      const shareFila   = filaTotal > 0 ? Math.round(e.fila   / filaTotal * 100) : 0
      const shareExec   = execTotal > 0 ? Math.round(e.exec14 / execTotal * 100) : 0
      return {
        cidade,
        fila: e.fila, atend: e.atend, pend: e.pend,
        criticas: e.criticas,
        slaPct:   e.fila > 0 ? Math.round((e.fila - e.breach) / e.fila * 100) : 100,
        agingMed: avg(e.agingArr),
        semEq:    e.semEq,
        saidasDia, backlogDias, shareFila, shareExec,
        deltaShare: shareFila - shareExec,
      }
    })
    .sort((a, b) => (b.backlogDias ?? -1) - (a.backlogDias ?? -1) || b.fila - a.fila)

  const comFila       = saude.filter(c => c.fila > 0)
  const criticasCount = comFila.filter(c => c.criticas > 0).length
  const acumulando    = comFila.filter(c => c.deltaShare >= 5).length
  const agingMedGeral = comFila.length > 0 ? Math.round(comFila.reduce((s, c) => s + c.agingMed, 0) / comFila.length) : 0
  const kpis: KPI[] = [
    { id: 'total',      title: 'Cidades c/ Fila',   value: comFila.length, sub: 'com OS em aberto',              accent: 'primary' },
    { id: 'criticas',   title: 'Com OS Crítica',    value: criticasCount,  sub: 'SLA 2× excedido',               accent: criticasCount > 0 ? 'red' : 'green' },
    { id: 'acumulando', title: 'Acumulando Fila',   value: acumulando,     sub: 'fila cresce acima da execução', accent: acumulando > 0 ? 'orange' : 'green' },
    { id: 'aging',      title: 'Aging Médio',       value: `${agingMedGeral}d`, sub: 'média geral das filas',    accent: agingMedGeral > 5 ? 'red' : agingMedGeral > 2 ? 'yellow' : 'green' },
  ]

  return { saude, kpis }
}
