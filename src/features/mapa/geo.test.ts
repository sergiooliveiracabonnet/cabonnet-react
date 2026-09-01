import { describe, it, expect } from 'vitest'
import { aggregateByBairro, buildEquipeOptions, getBairroCoords } from './geo'
import type { OSRow } from '../../lib/types'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'INST F01',
    tiposervico:     'INSTALACAO',
    servico:         'INSTALACAO RESIDENCIAL',
    descsituacao:    'Pendente',
    datacadastro:    '01/01/2026',
    dataagendamento: '',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      'RUA TESTE',
    complemento:     '',
    numero:          '1',
    empresa:         '',
    obs:             '',
    periodo:         '',
    ...overrides,
  } as unknown as OSRow
}

describe('buildEquipeOptions', () => {
  it('retorna lista vazia quando não há OS', () => {
    expect(buildEquipeOptions([])).toEqual([])
  })

  it('extrai equipes únicas, formatadas com shortEquipe e ordenadas por label', () => {
    const rows = [
      makeOS({ numos: 'A', nomedaequipe: 'INST F05' }),
      makeOS({ numos: 'B', nomedaequipe: 'INST F01' }),
      makeOS({ numos: 'C', nomedaequipe: 'INST F01' }), // duplicata, deve aparecer uma vez
    ]
    expect(buildEquipeOptions(rows)).toEqual([
      { value: 'INST F01', label: 'INST F01 - FELIPE' },
      { value: 'INST F05', label: 'INST F05 - JADIEL' },
    ])
  })

  it('ignora OS sem equipe (nulo, vazio ou só espaços) e trima o valor', () => {
    const rows = [
      makeOS({ numos: 'A', nomedaequipe: null }),
      makeOS({ numos: 'B', nomedaequipe: '' }),
      makeOS({ numos: 'C', nomedaequipe: '   ' }),
      makeOS({ numos: 'D', nomedaequipe: '  INST F01  ' }),
    ]
    expect(buildEquipeOptions(rows)).toEqual([{ value: 'INST F01', label: 'INST F01 - FELIPE' }])
  })
})

describe('getBairroCoords', () => {
  it('retorna null quando a cidade não é conhecida', () => {
    expect(getBairroCoords('CIDADE INEXISTENTE', 'CENTRO')).toBeNull()
  })

  it('retorna coordenadas deslocadas do centro da cidade, deterministicamente', () => {
    const a = getBairroCoords('TAUBATE', 'CENTRO')
    const b = getBairroCoords('TAUBATE', 'CENTRO')
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
  })

  it('bairros diferentes na mesma cidade produzem coordenadas diferentes', () => {
    const a = getBairroCoords('TAUBATE', 'CENTRO')
    const b = getBairroCoords('TAUBATE', 'JARDIM AMERICA')
    expect(a).not.toEqual(b)
  })
})

describe('aggregateByBairro — coordenadas vêm de getBairroCoords', () => {
  it('as coordenadas do bairro batem com getBairroCoords', () => {
    const rows = [makeOS({ numos: 'A', nomedacidade: 'TAUBATE', bairro: 'CENTRO' })]
    const [agg] = aggregateByBairro(rows)
    expect(agg.coords).toEqual(getBairroCoords('TAUBATE', 'CENTRO'))
  })
})
