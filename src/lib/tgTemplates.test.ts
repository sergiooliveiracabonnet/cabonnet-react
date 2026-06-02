import { describe, it, expect } from 'vitest'
import type { OSRow } from './types'
import { enrichRows } from './transform'
import {
  tgCriticas, tgEquipes, tgSLA, tgPulso,
  tgExecutadas, tgEquipeInativa, tgFilaResidual,
} from './tgTemplates'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '1234567',
    nomecliente:     'Cliente Teste',
    nomedacidade:    'SAO JOSE DOS CAMPOS',
    nomedaequipe:    'INST F01 - JOAO',
    tiposervico:     'Manutenção',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Pendente',
    datacadastro:    daysAgo(2),
    dataagendamento: null,
    dataexecucao:    null,
    databaixa:       null,
    bairro:          '',
    logradouro:      '',
    complemento:     '',
    numero:          '',
    empresa:         '',
    obs:             '',
    periodo:         '',
    ...overrides,
  } as unknown as OSRow
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function todayStr(): string { return daysAgo(0) }

function makeEnrichedOS(overrides: Record<string, unknown> = {}): OSRow {
  const [enriched] = enrichRows([makeOS(overrides)])
  return enriched
}

// ─── tgCriticas ───────────────────────────────────────────────────────────────

describe('tgCriticas', () => {
  it('retorna string com cabeçalho correto', () => {
    const result = tgCriticas([])
    expect(result).toContain('OS CRÍTICAS')
    expect(result).toContain('CABONNET')
  })

  it('indica "Nenhuma OS" quando lista vazia', () => {
    const result = tgCriticas([])
    expect(result).toContain('Nenhuma OS com SLA excedido')
  })

  it('lista OS críticas quando existem', () => {
    const os = makeEnrichedOS({ datacadastro: daysAgo(10), descsituacao: 'Pendente' })
    const critica = { ...os, _slaCritico: true, _slaExcedido: true, numos: '9999999', nomecliente: 'Cliente Critico' }
    const result = tgCriticas([critica])
    expect(result).toContain('OS 9999999')
  })

  it('exclui OS de tipo REDE', () => {
    const os = makeEnrichedOS({ datacadastro: daysAgo(10), descsituacao: 'Pendente' })
    const rede = { ...os, _tipo: 'REDE' as const, _slaCritico: true, numos: '8888888' }
    const result = tgCriticas([rede])
    expect(result).toContain('Nenhuma OS com SLA excedido')
  })
})

// ─── tgEquipes ────────────────────────────────────────────────────────────────

describe('tgEquipes', () => {
  it('retorna cabeçalho de carga por equipe', () => {
    const result = tgEquipes([])
    expect(result).toContain('CARGA POR EQUIPE')
  })

  it('mostra "Nenhuma OS ativa" quando lista vazia', () => {
    const result = tgEquipes([])
    expect(result).toContain('Nenhuma OS ativa')
  })

  it('agrupa OS por equipe com contagens', () => {
    const rows = [
      makeEnrichedOS({ numos: '0000001', descsituacao: 'Pendente', nomedaequipe: 'INST F01 - JOAO', datacadastro: daysAgo(1) }),
      makeEnrichedOS({ numos: '0000002', descsituacao: 'Atendimento', nomedaequipe: 'INST F01 - JOAO', datacadastro: daysAgo(1) }),
    ]
    const result = tgEquipes(rows)
    expect(result).toContain('F01')
  })
})

// ─── tgSLA ────────────────────────────────────────────────────────────────────

describe('tgSLA', () => {
  it('retorna cabeçalho do semáforo', () => {
    const result = tgSLA([])
    expect(result).toContain('SEMÁFORO SLA')
  })

  it('exibe conformidade em porcentagem', () => {
    const result = tgSLA([])
    expect(result).toMatch(/Conformidade:.*%/)
  })

  it('mostra totais de críticas e excedidas', () => {
    const result = tgSLA([])
    expect(result).toContain('crítica')
    expect(result).toContain('excedida')
  })
})

// ─── tgPulso ──────────────────────────────────────────────────────────────────

describe('tgPulso', () => {
  it('retorna cabeçalho de pulso operacional', () => {
    const result = tgPulso([])
    expect(result).toContain('PULSO OPERACIONAL')
  })

  it('exibe status geral', () => {
    const result = tgPulso([])
    expect(result).toContain('Status:')
  })

  it('mostra taxa de conclusão', () => {
    const result = tgPulso([])
    expect(result).toContain('Taxa conclusão')
  })

  it('classifica status como Normal quando sem alertas', () => {
    const result = tgPulso([])
    expect(result).toContain('Normal')
  })

  it('classifica status como Crítico com muitas críticas', () => {
    const criticas = Array.from({ length: 8 }, (_, i) =>
      ({ ...makeEnrichedOS({ numos: `000000${i}`, descsituacao: 'Pendente', datacadastro: daysAgo(10) }), _slaCritico: true, _slaExcedido: true })
    )
    const result = tgPulso(criticas)
    expect(result).toContain('Crítico')
  })
})

// ─── tgExecutadas ─────────────────────────────────────────────────────────────

describe('tgExecutadas', () => {
  it('retorna cabeçalho de executadas hoje', () => {
    const result = tgExecutadas([])
    expect(result).toContain('EXECUTADAS HOJE')
  })

  it('indica "Nenhuma OS concluída" quando lista vazia', () => {
    const result = tgExecutadas([])
    expect(result).toContain('Nenhuma OS concluída ainda hoje')
  })

  it('conta OS concluídas hoje por cidade', () => {
    const os = makeEnrichedOS({
      numos: '5555555',
      descsituacao: 'Concluída',
      dataexecucao: todayStr(),
      nomedacidade: 'TAUBATE',
    })
    const result = tgExecutadas([os])
    expect(result).toContain('TAUBATE')
    expect(result).toContain('1')
  })

  it('ignora OS concluídas em outros dias', () => {
    const os = makeEnrichedOS({
      numos: '4444444',
      descsituacao: 'Concluída',
      dataexecucao: daysAgo(1),
    })
    const result = tgExecutadas([os])
    expect(result).toContain('Nenhuma OS concluída ainda hoje')
  })
})

// ─── tgEquipeInativa ──────────────────────────────────────────────────────────

describe('tgEquipeInativa', () => {
  it('retorna cabeçalho de equipes sem execução', () => {
    const result = tgEquipeInativa([])
    expect(result).toContain('EQUIPES SEM EXECUÇÃO')
  })

  it('indica que todas equipes estão produzindo quando sem paradas', () => {
    const result = tgEquipeInativa([])
    expect(result).toContain('Todas as equipes com produção registrada')
  })

  it('detecta equipe com fila ≥ 3 e sem execução hoje', () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeEnrichedOS({ numos: `666000${i}`, descsituacao: 'Pendente', nomedaequipe: 'INST F05 - PEDRO', datacadastro: daysAgo(1) })
    )
    const result = tgEquipeInativa(rows)
    expect(result).toContain('F05')
    expect(result).toContain('na fila')
  })
})

// ─── tgFilaResidual ───────────────────────────────────────────────────────────

describe('tgFilaResidual', () => {
  it('retorna cabeçalho de fila residual', () => {
    const result = tgFilaResidual([])
    expect(result).toContain('FILA RESIDUAL')
  })

  it('indica sem fila significativa quando lista vazia', () => {
    const result = tgFilaResidual([])
    expect(result).toContain('Nenhuma equipe com fila residual significativa')
  })

  it('lista equipes com fila ≥ 2', () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeEnrichedOS({ numos: `777000${i}`, descsituacao: 'Atendimento', nomedaequipe: 'INST F07 - LUCAS', datacadastro: daysAgo(1) })
    )
    const result = tgFilaResidual(rows)
    expect(result).toContain('F07')
    expect(result).toContain('OS restante')
  })
})
