import { describe, it, expect } from 'vitest'
import { buildRankingTecnicos } from './RankingTecnicosPage'
import type { OSRow } from '../../../lib/types'

function makeRow(overrides: Partial<OSRow>): OSRow {
  return {
    numos: '1234567', nomedaequipe: 'F01 - JOAO', descsituacao: 'Pendente',
    nomecliente: 'Cliente', nomedacidade: 'SJC', tiposervico: 'Instalação',
    _tipo: 'INSTALACAO', _slaExcedido: false, _slaSemAgend: false, _aging: 0,
    ...overrides,
  } as OSRow
}

describe('buildRankingTecnicos', () => {
  it('conta execucoes por tipo, fila e sla vencido por equipe', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Concluída', _tipo: 'INSTALACAO' }),
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Concluída', _tipo: 'MANUTENCAO' }),
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Pendente',  _slaExcedido: true }),
      makeRow({ nomedaequipe: 'F01 - JOAO', descsituacao: 'Atendimento' }),
    ]
    const [row] = buildRankingTecnicos(rows, [], [])
    expect(row.nome).toBe('F01 - JOAO')
    expect(row.execInst).toBe(1)
    expect(row.execManut).toBe(1)
    expect(row.execServico).toBe(0)
    expect(row.queue).toBe(2)
    expect(row.slaVenc).toBe(1)
  })

  it('cruza sla e aging medio vindos do semaforo, mesmo sem OS ativas', () => {
    const semaforo = [{ nome: 'F04 - MARIA', tipo: 'INSTALACAO', sla: 82, total: 5, criticas: 1, agingMed: 3.5 }]
    const [row] = buildRankingTecnicos([], semaforo, [])
    expect(row.nome).toBe('F04 - MARIA')
    expect(row.sla).toBe(82)
    expect(row.criticas).toBe(1)
    expect(row.avgAging).toBe(3.5)
    expect(row.volume).toBe(0)
  })

  it('cruza taxa de retrabalho vinda de revisitas', () => {
    const revisitas = [{ equipe: 'F07 - PEDRO', taxa: 12 }]
    const [row] = buildRankingTecnicos([], [], revisitas)
    expect(row.nome).toBe('F07 - PEDRO')
    expect(row.taxaRevisita).toBe(12)
  })

  it('ignora linhas sem equipe atribuida', () => {
    const rows = [makeRow({ nomedaequipe: '' })]
    expect(buildRankingTecnicos(rows, [], [])).toHaveLength(0)
  })

  it('nao cria linha fantasma "Sem equipe" a partir do semaforo ou de revisitas', () => {
    const semaforo = [{ nome: 'Sem equipe', tipo: 'INSTALACAO', sla: 60, total: 3, criticas: 0, agingMed: 2 }]
    const revisitas = [{ equipe: 'Sem equipe', taxa: 8 }]
    const result = buildRankingTecnicos([], semaforo, revisitas)
    expect(result.find(r => r.nome === 'Sem equipe')).toBeUndefined()
  })
})
