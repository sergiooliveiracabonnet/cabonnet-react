import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildCoorte, inicioSemana, COORTE_BUCKETS } from './coorte'
import type { OSRow } from '../types'

// Quarta-feira, para exercitar o cálculo de início de semana (segunda = 27/07)
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

describe('inicioSemana', () => {
  it('leva qualquer dia para a segunda-feira daquela semana', () => {
    expect(inicioSemana(new Date(2026, 6, 29)).getDate()).toBe(27) // quarta → segunda
    expect(inicioSemana(new Date(2026, 6, 27)).getDate()).toBe(27) // segunda → ela mesma
  })

  it('domingo pertence à semana que começou na segunda anterior', () => {
    const dom = new Date(2026, 7, 2) // domingo
    expect(inicioSemana(dom).getDate()).toBe(27)
    expect(inicioSemana(dom).getMonth()).toBe(6)
  })
})

describe('buildCoorte', () => {
  it('mede o percentual resolvido dentro de cada janela da safra', () => {
    // Safra de 20 dias atrás: madura para todos os buckets
    const abertura = diasAtras(20)
    const rows = enrichRows([
      // resolvida no mesmo dia → entra em D+1, D+2, D+3, D+7
      makeOS({ numos: 'C1', descsituacao: 'Concluída', datacadastro: abertura, databaixa: abertura }),
      // resolvida em 3 dias → entra só em D+3 e D+7
      makeOS({ numos: 'C2', descsituacao: 'Concluída', datacadastro: abertura, databaixa: diasAtras(17) }),
      // nunca resolvida → não entra em nenhum
      makeOS({ numos: 'C3', descsituacao: 'Pendente',  datacadastro: abertura }),
      // resolvida em 10 dias → entra em nenhum dos buckets (max é 7)
      makeOS({ numos: 'C4', descsituacao: 'Concluída', datacadastro: abertura, databaixa: diasAtras(10) }),
    ])
    const { linhas, buckets } = buildCoorte(rows, 8, HOJE)
    expect(buckets).toEqual([...COORTE_BUCKETS])

    const safra = linhas.find(l => l.total === 4)
    expect(safra).toBeDefined()
    expect(safra!.resolvidas).toBe(3)
    // D+1: só C1 → 25%; D+3: C1+C2 → 50%; D+7: idem 50%
    expect(safra!.pct[0]).toBe(25)   // D+1
    expect(safra!.pct[2]).toBe(50)   // D+3
    expect(safra!.pct[3]).toBe(50)   // D+7
  })

  // D+n é a leitura do cliente; "no prazo" é a contratual. Manutenção vence em
  // 1 dia e instalação em 2, então a mesma coluna D+2 significa coisas opostas.
  it('mede "no prazo" contra o SLA da própria OS, não contra dias absolutos', () => {
    const abertura = diasAtras(20)
    const rows = enrichRows([
      // manutenção (limite 1d) resolvida em 2 dias → FORA do prazo dela
      makeOS({ numos: 'M1', descsituacao: 'Concluída', tiposervico: 'MANUTENCAO',
               nomedaequipe: 'MANUTENCAO M01', datacadastro: abertura, databaixa: diasAtras(18) }),
      // instalação (limite 2d) resolvida em 2 dias → DENTRO do prazo dela
      makeOS({ numos: 'I1', descsituacao: 'Concluída', tiposervico: 'INSTALACAO',
               nomedaequipe: 'INSTALACAO F01', datacadastro: abertura, databaixa: diasAtras(18) }),
    ])
    const safra = buildCoorte(rows, 8, HOJE).linhas.find(l => l.total === 2)!
    // Ambas caem no mesmo bucket D+2 (dias absolutos)…
    expect(safra.pct[1]).toBe(100)
    // …mas só uma cumpriu o próprio SLA
    expect(safra.pctNoPrazo).toBe(50)
  })

  it('não fecha "no prazo" antes da safra vencer o maior SLA dela', () => {
    const rows = enrichRows([
      makeOS({ numos: 'P1', descsituacao: 'Concluída', tiposervico: 'INSTALACAO',
               nomedaequipe: 'INSTALACAO F01', datacadastro: diasAtras(1), databaixa: diasAtras(1) }),
    ])
    expect(buildCoorte(rows, 8, HOJE).linhas[0].pctNoPrazo).toBeNull()
  })

  it('devolve null no bucket que a safra ainda não tem idade para responder', () => {
    // Safra desta semana: o último dia dela ainda nem chegou, nenhum bucket fecha
    const rows = enrichRows([
      makeOS({ numos: 'N1', descsituacao: 'Concluída', datacadastro: diasAtras(1), databaixa: diasAtras(1) }),
    ])
    const { linhas } = buildCoorte(rows, 8, HOJE)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].pct.every(p => p === null)).toBe(true)
  })

  it('ordena da safra mais recente para a mais antiga', () => {
    const rows = enrichRows([
      makeOS({ numos: 'S1', datacadastro: diasAtras(3)  }),
      makeOS({ numos: 'S2', datacadastro: diasAtras(30) }),
      makeOS({ numos: 'S3', datacadastro: diasAtras(17) }),
    ])
    const { linhas } = buildCoorte(rows, 8, HOJE)
    const chaves = linhas.map(l => l.chave)
    expect(chaves).toEqual([...chaves].sort((a, b) => b - a))
  })

  it('ignora COPE, reagendamento e REDE', () => {
    const rows = enrichRows([
      makeOS({ numos: 'V1', datacadastro: diasAtras(20) }),
      makeOS({ numos: 'V2', datacadastro: diasAtras(20), nomedaequipe: 'COPE VALE' }),
      makeOS({ numos: 'V3', datacadastro: diasAtras(20), nomedaequipe: 'REAGENDAMENTO F01' }),
      makeOS({ numos: 'V4', datacadastro: diasAtras(20), nomedaequipe: '03-VAL - REDE FIBRA' }),
    ])
    const { linhas } = buildCoorte(rows, 8, HOJE)
    expect(linhas.reduce((s, l) => s + l.total, 0)).toBe(1)
  })

  it('descarta resolução negativa ou acima de 90 dias (data suja)', () => {
    const abertura = diasAtras(20)
    const rows = enrichRows([
      makeOS({ numos: 'D1', descsituacao: 'Concluída', datacadastro: abertura, databaixa: diasAtras(25) }), // baixa antes da abertura
      makeOS({ numos: 'D2', descsituacao: 'Concluída', datacadastro: abertura, databaixa: abertura }),
    ])
    const { linhas } = buildCoorte(rows, 8, HOJE)
    const safra = linhas.find(l => l.total === 2)!
    expect(safra.resolvidas).toBe(1)
    expect(safra.pct[0]).toBe(50)
  })

  it('respeita a janela de semanas pedida', () => {
    const rows = enrichRows([
      makeOS({ numos: 'J1', datacadastro: diasAtras(3)   }),
      makeOS({ numos: 'J2', datacadastro: diasAtras(120) }),
    ])
    const { linhas } = buildCoorte(rows, 8, HOJE)
    expect(linhas.reduce((s, l) => s + l.total, 0)).toBe(1)
  })
})
