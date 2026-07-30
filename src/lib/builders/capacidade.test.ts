import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildCapacidade } from './capacidade'
import type { OSRow } from '../types'

const HOJE = new Date(2026, 6, 29, 12, 0, 0)

function fmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function diasAtras(n: number): string {
  const d = new Date(HOJE)
  d.setDate(d.getDate() - n)
  return fmt(d)
}

function makeOS(o: Record<string, unknown> = {}): OSRow {
  return {
    numos: '1234567', nomecliente: 'Cliente', nomedacidade: 'TAUBATE',
    nomedaequipe: 'MANUTENCAO M01', tiposervico: 'MANUTENCAO', servico: 'ASSISTENCIA TECNICA',
    descsituacao: 'Pendente', datacadastro: null, dataagendamento: null,
    ...o,
  } as unknown as OSRow
}

/**
 * n OS concluídas na cidade, distribuídas entre as equipes informadas.
 * Abertas ANTES da janela de 28 dias de propósito: assim elas contam como saída
 * sem contar como entrada, isolando a capacidade da demanda no teste. (No mundo
 * real a maioria abre e fecha dentro da janela e conta nos dois lados — que é o
 * comportamento correto do builder, exercitado nos testes de saldo.)
 */
function execucoes(cidade: string, equipes: string[], n: number, diaOffset = 3): OSRow[] {
  const dia = diasAtras(diaOffset)
  return Array.from({ length: n }, (_, i) =>
    makeOS({
      numos: `E${cidade}${i}`, nomedacidade: cidade, descsituacao: 'Concluída',
      nomedaequipe: equipes[i % equipes.length],
      datacadastro: diasAtras(40), dataexecucao: dia, databaixa: dia,
    })
  )
}

function fila(cidade: string, n: number): OSRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeOS({ numos: `F${cidade}${i}`, nomedacidade: cidade, descsituacao: 'Pendente', datacadastro: diasAtras(2) })
  )
}

describe('buildCapacidade', () => {
  it('conta frentes distintas que executaram na cidade', () => {
    const rows = enrichRows(execucoes('TAUBATE', ['MANUTENCAO F01', 'MANUTENCAO F02', 'MANUTENCAO F03'], 9))
    const { cidades } = buildCapacidade(rows, 7, HOJE)
    expect(cidades.find(c => c.cidade === 'TAUBATE')!.frentes).toBe(3)
  })

  it('marca nao_zera quando entra mais do que sai', () => {
    // 28 aberturas na janela, 4 execuções → entra 1/dia, sai ~0,14/dia
    const entradas = Array.from({ length: 28 }, (_, i) =>
      makeOS({ numos: `A${i}`, nomedacidade: 'CACAPAVA', descsituacao: 'Pendente', datacadastro: diasAtras(i) })
    )
    const rows = enrichRows([...entradas, ...execucoes('CACAPAVA', ['F01'], 4)])
    const cc = buildCapacidade(rows, 7, HOJE).cidades.find(c => c.cidade === 'CACAPAVA')!
    expect(cc.saldoDia).toBeGreaterThan(0)
    expect(cc.status).toBe('nao_zera')
    expect(cc.diasParaZerar).toBeNull()
    expect(cc.frentesEstabilizar).toBeGreaterThan(0)
  })

  it('calcula dias para zerar quando sai mais do que entra', () => {
    // 1 entrada só; 28 execuções por 1 frente → sai 1/dia, entra ~0,04/dia
    const rows = enrichRows([
      makeOS({ numos: 'U1', nomedacidade: 'TREMEMBE', descsituacao: 'Pendente', datacadastro: diasAtras(2) }),
      ...fila('TREMEMBE', 5),
      ...execucoes('TREMEMBE', ['F09'], 28),
    ])
    const cc = buildCapacidade(rows, 7, HOJE).cidades.find(c => c.cidade === 'TREMEMBE')!
    expect(cc.saldoDia).toBeLessThan(0)
    expect(cc.diasParaZerar).not.toBeNull()
    expect(cc.frentesEstabilizar).toBe(0)
  })

  it('devolve frentesZerar null quando não há produtividade medida', () => {
    // Fila sem nenhuma execução → não dá para dimensionar frente
    const rows = enrichRows(fila('PINDAMONHANGABA', 10))
    const cc = buildCapacidade(rows, 7, HOJE).cidades.find(c => c.cidade === 'PINDAMONHANGABA')!
    expect(cc.frentes).toBe(0)
    expect(cc.prodFrenteDia).toBe(0)
    expect(cc.frentesZerar).toBeNull()
  })

  it('não pede frente adicional quando a capacidade já zera dentro do horizonte', () => {
    const rows = enrichRows([...fila('TAUBATE', 2), ...execucoes('TAUBATE', ['F01', 'F02'], 56)])
    const cc = buildCapacidade(rows, 7, HOJE).cidades.find(c => c.cidade === 'TAUBATE')!
    expect(cc.frentesZerar).toBe(0)
    expect(cc.status).toBe('ok')
  })

  it('ignora COPE, reagendamento e REDE', () => {
    const rows = enrichRows([
      ...fila('TAUBATE', 3),
      makeOS({ numos: 'X1', nomedacidade: 'TAUBATE', descsituacao: 'Pendente', nomedaequipe: 'COPE VALE', datacadastro: diasAtras(2) }),
      makeOS({ numos: 'X2', nomedacidade: 'TAUBATE', descsituacao: 'Pendente', nomedaequipe: 'REAGENDAMENTO F01', datacadastro: diasAtras(2) }),
      makeOS({ numos: 'X3', nomedacidade: 'TAUBATE', descsituacao: 'Pendente', nomedaequipe: '03-VAL - REDE FIBRA', datacadastro: diasAtras(2) }),
    ])
    expect(buildCapacidade(rows, 7, HOJE).cidades.find(c => c.cidade === 'TAUBATE')!.fila).toBe(3)
  })

  // A OS que abre e fecha dentro da janela conta nos dois lados — é assim que o
  // fluxo real funciona e o saldo precisa refletir isso.
  it('conta a mesma OS como entrada e como saída quando abre e fecha na janela', () => {
    const dia = diasAtras(3)
    const rows = enrichRows([
      makeOS({
        numos: 'AB1', nomedacidade: 'TAUBATE', descsituacao: 'Concluída', nomedaequipe: 'F01',
        datacadastro: diasAtras(5), dataexecucao: dia, databaixa: dia,
      }),
    ])
    const cc = buildCapacidade(rows, 7, HOJE).cidades.find(c => c.cidade === 'TAUBATE')!
    expect(cc.entradasDia).toBeGreaterThan(0)
    expect(cc.saidasDia).toBeGreaterThan(0)
    expect(cc.saldoDia).toBe(0)
  })

  it('ordena colocando quem não zera no topo', () => {
    const acumula = Array.from({ length: 28 }, (_, i) =>
      makeOS({ numos: `AC${i}`, nomedacidade: 'CACAPAVA', descsituacao: 'Pendente', datacadastro: diasAtras(i) })
    )
    const rows = enrichRows([
      ...acumula, ...execucoes('CACAPAVA', ['F01'], 2),
      ...fila('TREMEMBE', 2), ...execucoes('TREMEMBE', ['F09'], 28),
    ])
    const { cidades } = buildCapacidade(rows, 7, HOJE)
    expect(cidades[0].cidade).toBe('CACAPAVA')
    expect(cidades[0].status).toBe('nao_zera')
  })
})
