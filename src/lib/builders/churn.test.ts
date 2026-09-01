import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildChurn } from './churn'
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

/** Manutenção concluída para um cliente, executada há `quando` dias. */
function manut(codigo: string, quando: number, extra: Record<string, unknown> = {}): OSRow {
  const dia = diasAtras(quando)
  return {
    numos: `${codigo}${quando}`.padStart(7, '9'),
    nomecliente: `Cliente ${codigo}`, codigocliente: codigo,
    nomedacidade: 'TAUBATE', bairro: 'CENTRO',
    nomedaequipe: 'MANUTENCAO M01', tiposervico: 'MANUTENCAO', servico: 'ASSISTENCIA TECNICA',
    descsituacao: 'Concluída',
    datacadastro: diasAtras(quando + 1), dataagendamento: null,
    dataexecucao: dia, databaixa: dia,
    ...extra,
  } as unknown as OSRow
}

describe('buildChurn', () => {
  it('lista só quem teve 2+ manutenções na janela', () => {
    const rows = enrichRows([
      manut('A', 10), manut('A', 30),   // 2 visitas → reincidente
      manut('B', 15),                    // 1 visita  → fora
    ])
    const { clientes, totalReincidentes, totalBase } = buildChurn(rows, 12, HOJE)
    expect(totalBase).toBe(2)
    expect(totalReincidentes).toBe(1)
    expect(clientes.map(c => c.chave)).toEqual(['A'])
    expect(clientes[0].visitas).toBe(2)
  })

  it('calcula intervalo médio entre visitas consecutivas', () => {
    // visitas há 40, 30 e 10 dias → gaps de 10 e 20 → média 15
    const rows = enrichRows([manut('C', 40), manut('C', 30), manut('C', 10)])
    const c = buildChurn(rows, 12, HOJE).clientes[0]
    expect(c.visitas).toBe(3)
    expect(c.intervaloMedio).toBe(15)
    expect(c.diasDesdeUltima).toBe(10)
  })

  it('ordena por visitas e desempata por menor intervalo', () => {
    const rows = enrichRows([
      manut('X', 50), manut('X', 25),              // 2 visitas, gap 25
      manut('Y', 20), manut('Y', 18),              // 2 visitas, gap 2 → mais grave
      manut('Z', 40), manut('Z', 30), manut('Z', 5), // 3 visitas → primeiro
    ])
    expect(buildChurn(rows, 12, HOJE).clientes.map(c => c.chave)).toEqual(['Z', 'Y', 'X'])
  })

  it('ignora instalação — repetir instalação é crescimento, não retrabalho', () => {
    const rows = enrichRows([
      manut('I', 10, { tiposervico: 'INSTALACAO', nomedaequipe: 'INSTALACAO F01' }),
      manut('I', 30, { tiposervico: 'INSTALACAO', nomedaequipe: 'INSTALACAO F01' }),
    ])
    expect(buildChurn(rows, 12, HOJE).totalReincidentes).toBe(0)
  })

  it('ignora OS fora da janela de 60 dias', () => {
    const rows = enrichRows([manut('F', 10), manut('F', 90)])
    const { totalReincidentes, totalBase } = buildChurn(rows, 12, HOJE)
    expect(totalBase).toBe(1)          // o cliente aparece na base
    expect(totalReincidentes).toBe(0)  // mas só com 1 visita dentro da janela
  })

  it('ignora COPE e reagendamento', () => {
    const rows = enrichRows([
      manut('K', 10, { nomedaequipe: 'COPE VALE' }),
      manut('K', 20, { nomedaequipe: 'REAGENDAMENTO F01' }),
    ])
    expect(buildChurn(rows, 12, HOJE).totalBase).toBe(0)
  })

  it('ignora OS ainda não concluída', () => {
    const rows = enrichRows([
      manut('P', 10), manut('P', 20, { descsituacao: 'Pendente', dataexecucao: '', databaixa: '' }),
    ])
    expect(buildChurn(rows, 12, HOJE).totalReincidentes).toBe(0)
  })

  it('calcula o percentual de reincidência sobre a base de clientes atendidos', () => {
    const rows = enrichRows([
      manut('R1', 10), manut('R1', 20),
      manut('R2', 10), manut('R2', 20),
      manut('S1', 10), manut('S2', 12), manut('S3', 14), manut('S4', 16),
    ])
    const { pctReincidencia, totalBase, totalReincidentes } = buildChurn(rows, 12, HOJE)
    expect(totalBase).toBe(6)
    expect(totalReincidentes).toBe(2)
    expect(pctReincidencia).toBe(33)
  })

  it('respeita o limite de itens no topo sem perder o total', () => {
    const rows = enrichRows(
      Array.from({ length: 5 }, (_, i) => [manut(`T${i}`, 10), manut(`T${i}`, 20)]).flat()
    )
    const { clientes, totalReincidentes } = buildChurn(rows, 2, HOJE)
    expect(clientes).toHaveLength(2)
    expect(totalReincidentes).toBe(5)
  })

  it('anexa as OS do cliente para drill-down', () => {
    const rows = enrichRows([manut('D', 10), manut('D', 30)])
    expect(buildChurn(rows, 12, HOJE).clientes[0].rows).toHaveLength(2)
  })
})
