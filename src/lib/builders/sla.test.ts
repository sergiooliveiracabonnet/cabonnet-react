import { describe, it, expect } from 'vitest'
import { buildSla } from './sla'
import type { OSRow } from '../types'

function makeRow(overrides: Partial<OSRow>): OSRow {
  return {
    numos: '1234567', nomedaequipe: 'F01 - JOAO', descsituacao: 'Pendente',
    nomecliente: 'Cliente', nomedacidade: 'SJC', tiposervico: 'Instalação',
    _tipo: 'INSTALACAO', _slaExcedido: false, _slaCritico: false, _aging: 0,
    ...overrides,
  } as OSRow
}

describe('buildSla — semaforo', () => {
  it('expõe agingMed por equipe no semaforo', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F01 - JOAO', _aging: 4 }),
      makeRow({ nomedaequipe: 'F01 - JOAO', _aging: 6 }),
    ]
    const { semaforo } = buildSla(rows)
    const entry = semaforo.find(e => e.nome === 'F01 - JOAO')
    expect(entry?.agingMed).toBe(5)
  })
})
