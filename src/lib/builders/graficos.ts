import { isConcluida, isExecucaoReal, parseDate } from '../transform'
import type { OSRow } from '../types'
import { avg, topN, shortName } from './_helpers'

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

// buildAnomalias → migrada para ./builders/anomalias.ts
// buildAuditoria → migrada para ./builders/auditoria.ts
// ─── Cidades ──────────────────────────────────────────────────────────────────


