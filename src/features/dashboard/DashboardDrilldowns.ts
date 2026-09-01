import { FORN_LABEL, shortEquipe } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'

const normalizeFacet = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR')

export function filterRowsByEquipe(rows: OSRow[], equipe: string): OSRow[] {
  const target = normalizeFacet(equipe)
  return rows.filter(row => normalizeFacet(shortEquipe(row.nomedaequipe)) === target)
}

export function filterRowsByFornecedor(rows: OSRow[], fornecedor: string): OSRow[] {
  const target = normalizeFacet(fornecedor)
  return rows.filter(row => normalizeFacet(FORN_LABEL[row._fornecedor]) === target)
}
