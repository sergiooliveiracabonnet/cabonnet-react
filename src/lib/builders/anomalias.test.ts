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
    // tiposervico precisa conter "MANUTENC" (sem acento) pra classificar como _tipo
    // MANUTENCAO em getEquipeTipo — do contrário cai em OUTRO (Serviço) e é excluído do
    // detector de anomalia de bairro pela regra de negócio corrigida nesta task.
    const problemBairro = [
      makeOS({ numos: '1', bairro: 'ESPLANADA', nomedaequipe: 'F01', tiposervico: 'Manutencao Sinal Fraco', codigocliente: 'C1', nomecliente: 'JOAO SILVA', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '2', bairro: 'ESPLANADA', nomedaequipe: 'F01', tiposervico: 'Manutencao Sinal Fraco', codigocliente: 'C1', nomecliente: 'JOAO SILVA', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '3', bairro: 'ESPLANADA', nomedaequipe: 'F02', tiposervico: 'Manutencao Sinal Fraco', codigocliente: 'C2', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '4', bairro: 'ESPLANADA', nomedaequipe: 'F03', tiposervico: 'Manutencao Sinal Fraco', codigocliente: 'C3', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
      makeOS({ numos: '5', bairro: 'ESPLANADA', nomedaequipe: 'F03', tiposervico: 'Manutencao Sem Sinal',   codigocliente: 'C4', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' }),
    ]
    // Bairros normais: agendado no mesmo dia da abertura -> SLA nunca excedido
    // tiposervico: 'MANUTENCAO' (sem acento) pra não cair em OUTRO e sumir do bairroMap,
    // o que zeraria a variância (bStd) usada pelo filtro estatístico da anomalia.
    const normalBairros = [1, 2, 3].flatMap(n => Array.from({ length: 5 }, (_, i) =>
      makeOS({ numos: `n${n}-${i}`, bairro: `BAIRRO${n}`, nomedaequipe: 'F09', tiposervico: 'MANUTENCAO' })
    ))

    const rows = enrichRows([...problemBairro, ...normalBairros])
    const { bairrosAnomalia } = buildAnomalias(rows)

    const esplanada = bairrosAnomalia.find(b => b.bairro === 'ESPLANADA')
    expect(esplanada).toBeDefined()
    expect(esplanada!.composicao.tiposervicoTop[0]).toEqual({ nome: 'Manutencao Sinal Fraco', count: 4, pct: 80 })
    expect(esplanada!.composicao.outrasDimensoesLabel).toBe('equipe')
    expect(esplanada!.composicao.outrasDimensoes).toHaveLength(3)
    expect(esplanada!.composicao.clientesRecorrentes).toEqual([
      { codigocliente: 'C1', nomecliente: 'JOAO SILVA', count: 2, numos: ['1', '2'] },
    ])
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

  it('não sinaliza bairro com SLA estourado só por causa de arrastão de Instalação do PAP', () => {
    // Mesmo padrão de "problemBairro" acima (agendamento ~70 dias após a abertura),
    // mas todas as OS são Instalação — não deve virar anomalia de bairro.
    const arrastao = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `arr${i}`, bairro: 'ARRASTAO', nomedaequipe: 'F20', tiposervico: 'INSTALACAO', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' })
    )
    const normalBairros = [1, 2, 3].flatMap(n => Array.from({ length: 5 }, (_, i) =>
      makeOS({ numos: `n${n}-${i}`, bairro: `BAIRRO${n}`, nomedaequipe: 'F09' })
    ))

    const rows = enrichRows([...arrastao, ...normalBairros])
    const { bairrosAnomalia } = buildAnomalias(rows)

    expect(bairrosAnomalia.find(b => b.bairro === 'ARRASTAO')).toBeUndefined()
  })

  it('não sinaliza bairro com SLA estourado só por causa de concentração de Serviço', () => {
    const servicoConcentrado = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `srv${i}`, bairro: 'SERVICOZAO', nomedaequipe: 'F20', tiposervico: 'SERVICO', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' })
    )
    const normalBairros = [1, 2, 3].flatMap(n => Array.from({ length: 5 }, (_, i) =>
      makeOS({ numos: `n${n}-${i}`, bairro: `BAIRRO${n}`, nomedaequipe: 'F09', tiposervico: 'MANUTENCAO' })
    ))

    const rows = enrichRows([...servicoConcentrado, ...normalBairros])
    const { bairrosAnomalia } = buildAnomalias(rows)

    expect(bairrosAnomalia.find(b => b.bairro === 'SERVICOZAO')).toBeUndefined()
  })

  it('picosDia: pico de Instalação/Serviço não conta, pico de Manutenção conta', () => {
    const picoInstalacao = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `pi${i}`, tiposervico: 'INSTALACAO', datacadastro: daysAgo(0), dataagendamento: daysAgo(0) })
    )
    const picoManutencao = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `pm${i}`, tiposervico: 'MANUTENCAO', datacadastro: daysAgo(1), dataagendamento: daysAgo(1) })
    )
    const baseline = Array.from({ length: 8 }, (_, i) =>
      makeOS({ numos: `bl${i}`, tiposervico: 'MANUTENCAO', datacadastro: daysAgo(i + 2), dataagendamento: daysAgo(i + 2) })
    )

    const rows = enrichRows([...picoInstalacao, ...picoManutencao, ...baseline])
    const { picosDia } = buildAnomalias(rows)

    expect(picosDia.find(p => p.date === daysAgo(0))).toBeUndefined()
    expect(picosDia.find(p => p.date === daysAgo(1))).toBeDefined()
  })
})
