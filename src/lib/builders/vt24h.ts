import { parseDate } from '../transform'
import { FILTROS_VAZIOS, type BiTecnicaFiltros } from './biTecnicaFiltros'
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

// filtros usa os mesmos 3 campos (cidade/fornecedor/equipe) de FiltrosBiTecnica
// — o card VT24H precisa respeitar o mesmo filtro que o resto da aba Painel,
// senão fica mostrando o agregado total enquanto os outros cards já filtraram.
// OSRow já tem _fornecedor pré-computado (mesma getFornecedor(nomedaequipe)
// usada em BacklogRow), então não precisa recalcular aqui.
export function buildVt24hStats(
  allRows: OSRow[],
  inicio: string,
  fim: string,
  filtros: BiTecnicaFiltros = FILTROS_VAZIOS,
): Vt24hStats {
  const iniDate = parseIsoLocal(inicio)
  const fimDate = parseIsoLocal(fim)

  let executouPrazo = 0
  let executouForaPrazo = 0

  for (const r of allRows) {
    if (r._vtPrazoHoras !== 24 || r._vtCumpridaNoPrazo == null) continue
    if (filtros.cidade     && r.nomedacidade !== filtros.cidade)     continue
    if (filtros.fornecedor && r._fornecedor  !== filtros.fornecedor) continue
    if (filtros.equipe     && r.nomedaequipe !== filtros.equipe)     continue
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
