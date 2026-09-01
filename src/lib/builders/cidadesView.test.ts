import { describe, expect, it } from 'vitest'
import { buildCidadesExecutiveSummary, filterCidadesRows } from './cidadesView'
import type { CidadeSaude, OSRow } from '../types'

const row = (cidade: string, tipo: OSRow['_tipo']): OSRow => ({
  numos: `${cidade}-${tipo}`, nomedacidade: cidade, _tipo: tipo,
} as OSRow)

const cidade = (overrides: Partial<CidadeSaude>): CidadeSaude => ({
  cidade: 'Taubaté', fila: 0, atend: 0, pend: 0, criticas: 0, slaPct: 100,
  agingMed: 0, semEq: 0, saidasDia: 0, backlogDias: null,
  shareFila: 0, shareExec: 0, deltaShare: 0, ...overrides,
})

describe('filterCidadesRows', () => {
  it('combina cidade e categoria sem incluir REDE em serviço', () => {
    const rows = [row('Taubaté', 'INSTALACAO'), row('Taubaté', 'MANUTENCAO'), row('Caçapava', 'INSTALACAO'), row('Taubaté', 'REDE')]
    expect(filterCidadesRows(rows, 'Taubaté', 'INSTALACAO')).toHaveLength(1)
    expect(filterCidadesRows(rows, '', 'OUTRO')).toHaveLength(0)
  })
})

describe('buildCidadesExecutiveSummary', () => {
  it('prioriza cidade sem capacidade e soma alertas acionáveis', () => {
    const result = buildCidadesExecutiveSummary([
      cidade({ cidade: 'Taubaté', fila: 10, backlogDias: 5, criticas: 2, semEq: 1, deltaShare: 6 }),
      cidade({ cidade: 'Caçapava', fila: 3, backlogDias: null, criticas: 1, semEq: 2, deltaShare: 2 }),
    ])
    expect(result.prioritaria?.cidade).toBe('Caçapava')
    expect(result.criticas).toBe(3)
    expect(result.semEquipe).toBe(3)
    expect(result.acumulando).toBe(1)
  })
})
