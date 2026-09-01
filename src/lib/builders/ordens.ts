import { isCOPE, isReagend, isCidadeValida } from '../transform'
import type { OSRow } from '../types'

export function buildOrdens(rows: OSRow[]) {
  const tipos    = [...new Set(rows.map(r => r.tiposervico).filter(Boolean))].sort()
  const cidades  = [...new Set(rows.map(r => (r.nomedacidade || '').trim()).filter(isCidadeValida))].sort()
  const equipes  = [...new Set(rows.map(r => r.nomedaequipe).filter(Boolean))].sort()
  const bairros  = [...new Set(rows.map(r => (r.bairro || '').trim()).filter(Boolean))].sort()
  const periodos = [...new Set(rows.map(r => (r.periodo || '').trim()).filter(Boolean))].sort()
  const base = rows.filter(r => !isCOPE(r) && !isReagend(r))
  return { ordens: base, options: { tipos, cidades, equipes, bairros, periodos } }
}
