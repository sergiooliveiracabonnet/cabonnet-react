import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildOrdens } from './ordens'
import type { OSRow } from '../types'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'EQUIPE F01',
    tiposervico:     'Manutenção',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Pendente',
    datacadastro:    '01/06/2026',
    dataagendamento: '02/06/2026',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      'RUA TESTE',
    complemento:     '',
    numero:          '1',
    empresa:         '',
    obs:             '',
    periodo:         '2026-06',
    ...overrides,
  } as unknown as OSRow
}

describe('buildOrdens', () => {
  it('retorna ordens vazio e options vazias para array vazio', () => {
    const result = buildOrdens([])
    expect(result.ordens).toEqual([])
    expect(result.options.tipos).toEqual([])
    expect(result.options.cidades).toEqual([])
    expect(result.options.equipes).toEqual([])
    expect(result.options.bairros).toEqual([])
    expect(result.options.periodos).toEqual([])
  })

  it('exclui OS da COPE do resultado', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'COPE VALE' }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01' }),
    ])
    const { ordens } = buildOrdens(rows)
    expect(ordens).toHaveLength(1)
    expect(ordens[0].nomedaequipe).toBe('EQUIPE F01')
  })

  it('exclui OS de Reagendamento do resultado', () => {
    // isReagend detecta pelo nomedaequipe contendo "REAGEND", não pelo descsituacao
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01'        }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE REAGEND-01' }),
    ])
    const { ordens } = buildOrdens(rows)
    const numos = ordens.map(r => r.numos)
    expect(numos).not.toContain('0000002')
  })

  it('deduplica tipos em options.tipos', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', tiposervico: 'Manutenção' }),
      makeOS({ numos: '0000002', tiposervico: 'Manutenção' }),
      makeOS({ numos: '0000003', tiposervico: 'Instalação' }),
    ])
    const { options } = buildOrdens(rows)
    expect(options.tipos).toEqual(['Instalação', 'Manutenção'])
  })

  it('deduplica equipes em options.equipes', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01' }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01' }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F08' }),
    ])
    const { options } = buildOrdens(rows)
    expect(options.equipes).toEqual(['EQUIPE F01', 'EQUIPE F08'])
  })

  it('só inclui cidades válidas (as 5 do Vale do Paraíba) em options.cidades', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedacidade: 'TAUBATE' }),
      makeOS({ numos: '0000002', nomedacidade: 'SAO PAULO' }),
      makeOS({ numos: '0000003', nomedacidade: 'SJCAMPOS' }),
    ])
    const { options } = buildOrdens(rows)
    expect(options.cidades).not.toContain('SAO PAULO')
    expect(options.cidades).toContain('TAUBATE')
  })

  it('ordena todos os arrays de options alfabeticamente', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', tiposervico: 'Serviço',    bairro: 'VILA',   periodo: '2026-07' }),
      makeOS({ numos: '0000002', tiposervico: 'Instalação', bairro: 'CENTRO', periodo: '2026-06' }),
    ])
    const { options } = buildOrdens(rows)
    expect(options.tipos).toEqual([...options.tipos].sort())
    expect(options.bairros).toEqual([...options.bairros].sort())
    expect(options.periodos).toEqual([...options.periodos].sort())
  })

  it('inclui todas as OS não-COPE não-Reagend como ordens', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', descsituacao: 'Pendente'    }),
      makeOS({ numos: '0000002', descsituacao: 'Atendimento' }),
      makeOS({ numos: '0000003', descsituacao: 'Concluída'   }),
    ])
    const { ordens } = buildOrdens(rows)
    expect(ordens).toHaveLength(3)
  })
})
