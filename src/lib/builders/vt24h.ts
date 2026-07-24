import { parseDate } from '../transform'
import type { OSRow } from '../types'

export interface Vt24hStats {
  executouPrazo:     number
  executouForaPrazo: number
  total:             number
  pctPrazo:          number
}

// inicio/fim vêm como strings ISO 'YYYY-MM-DD' (mesmo formato do estado de
// período de BiGestaoTecnicaPage). new Date('YYYY-MM-DD') parseia como UTC
// meia-noite — comparar direto contra parseDate() (que retorna Date local)
// causaria erro de fuso. Por isso parseamos inicio/fim como Date local aqui.
function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function buildVt24hStats(allRows: OSRow[], inicio: string, fim: string): Vt24hStats {
  const iniDate = parseIsoLocal(inicio)
  const fimDate = parseIsoLocal(fim)

  let executouPrazo = 0
  let executouForaPrazo = 0

  for (const r of allRows) {
    if (r._vtPrazoHoras !== 24 || r._vtCumpridaNoPrazo == null) continue
    const dtExec = parseDate(r.dataexecucao)
    if (!dtExec || dtExec < iniDate || dtExec >= fimDate) continue
    if (r._vtCumpridaNoPrazo) executouPrazo++
    else executouForaPrazo++
  }

  const total = executouPrazo + executouForaPrazo
  return {
    executouPrazo,
    executouForaPrazo,
    total,
    pctPrazo: total > 0 ? Math.round((executouPrazo / total) * 100) : 0,
  }
}
