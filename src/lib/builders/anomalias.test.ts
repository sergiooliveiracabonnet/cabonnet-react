import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildAnomalias } from './anomalias'
import type { OSRow } from '../types'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'F01',
    tiposervico:     'Manutenção',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Pendente',
    datacadastro:    '01/06/2026',
    dataagendamento: '01/06/2026',
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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

describe('buildAnomalias — composição da anomalia de bairro', () => {
  it('decompõe o bairro anômalo por tipo de serviço, equipes distintas e cliente recorrente', () => {
    // SLA estourado: agendamento ~70 dias após a abertura, bem acima de qualquer limite configurado
    const problemBairro = [
      makeOS({ numos: '1', bairro: 'ESPLANADA', nomedaequipe: 'F01', tiposervico: 'Sinal Fraco', codigocliente: 'C1', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '2', bairro: 'ESPLANADA', nomedaequipe: 'F01', tiposervico: 'Sinal Fraco', codigocliente: 'C1', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '3', bairro: 'ESPLANADA', nomedaequipe: 'F02', tiposervico: 'Sinal Fraco', codigocliente: 'C2', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '4', bairro: 'ESPLANADA', nomedaequipe: 'F03', tiposervico: 'Sinal Fraco', codigocliente: 'C3', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '5', bairro: 'ESPLANADA', nomedaequipe: 'F03', tiposervico: 'Instalação',  codigocliente: 'C4', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
    ]
    // Bairros normais: agendado no mesmo dia da abertura -> SLA nunca excedido
    const normalBairros = [1, 2, 3].flatMap(n => Array.from({ length: 5 }, (_, i) =>
      makeOS({ numos: `n${n}-${i}`, bairro: `BAIRRO${n}`, nomedaequipe: 'F09' })
    ))

    const rows = enrichRows([...problemBairro, ...normalBairros])
    const { bairrosAnomalia } = buildAnomalias(rows)

    const esplanada = bairrosAnomalia.find(b => b.bairro === 'ESPLANADA')
    expect(esplanada).toBeDefined()
    expect(esplanada!.composicao.tiposervicoTop[0]).toEqual({ nome: 'Sinal Fraco', count: 4, pct: 80 })
    expect(esplanada!.composicao.outrasDimensoesLabel).toBe('equipe')
    expect(esplanada!.composicao.outrasDimensoes).toHaveLength(3)
    expect(esplanada!.composicao.clientesRecorrentes).toEqual([{ nome: 'C1', count: 2 }])
  })

  it('decompõe a equipe anômala por bairros atendidos', () => {
    const equipeAlta = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `e${i}`, nomedaequipe: 'F20', bairro: i < 4 ? 'QUIRIRIM' : 'CENTRO', datacadastro: daysAgo(40), dataagendamento: daysAgo(40) })
    )
    const equipesNormais = ['F21', 'F22', 'F23'].flatMap(eq =>
      Array.from({ length: 3 }, (_, i) => makeOS({ numos: `${eq}-${i}`, nomedaequipe: eq, datacadastro: daysAgo(1), dataagendamento: daysAgo(1) }))
    )

    const rows = enrichRows([...equipeAlta, ...equipesNormais])
    const { equipesAnomalia } = buildAnomalias(rows)

    const f20 = equipesAnomalia.find(e => e.nome === 'F20')
    expect(f20).toBeDefined()
    expect(f20!.composicao.outrasDimensoesLabel).toBe('bairro')
    expect(f20!.composicao.outrasDimensoes[0]).toEqual({ nome: 'QUIRIRIM', count: 4, pct: 67 })
  })
})
