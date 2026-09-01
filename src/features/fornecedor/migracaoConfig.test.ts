import { describe, expect, it } from 'vitest'
import { planejarMigracao, planoVazio } from './migracaoConfig'

const VAZIO = { custo: {}, meta: {} }

describe('planejarMigracao', () => {
  it('sobe o custo local quando o servidor não tem nada', () => {
    const plano = planejarMigracao({ WES: 30000 }, {}, VAZIO)
    expect(plano.custo).toEqual([{ fornKey: 'WES', valor: 30000 }])
  })

  // A regra central: o servidor é a fonte da verdade a partir desta entrega.
  it('NUNCA sobrescreve valor já gravado no servidor', () => {
    const plano = planejarMigracao({ WES: 30000 }, {}, { custo: { WES: 45000 }, meta: {} })
    expect(plano.custo).toEqual([])
  })

  // Zero é o default semeado em erpStore, não algo que alguém digitou.
  it('ignora custo zero — é default do store, não valor digitado', () => {
    const plano = planejarMigracao({ WES: 0, THM: 12000 }, {}, VAZIO)
    expect(plano.custo).toEqual([{ fornKey: 'THM', valor: 12000 }])
  })

  it('migra meta pelo mesmo critério', () => {
    const plano = planejarMigracao({}, { WES: 85 }, VAZIO)
    expect(plano.meta).toEqual([{ fornKey: 'WES', valor: 85 }])
  })

  it('meta zero é meta legítima de 0%, diferente de ausência', () => {
    const plano = planejarMigracao({}, { WES: 0 }, VAZIO)
    expect(plano.meta).toEqual([{ fornKey: 'WES', valor: 0 }])
  })

  it('meta já no servidor não é tocada', () => {
    const plano = planejarMigracao({}, { WES: 85 }, { custo: {}, meta: { WES: 90 } })
    expect(plano.meta).toEqual([])
  })

  it('custo e meta são decididos de forma independente', () => {
    const plano = planejarMigracao(
      { WES: 30000 },
      { WES: 85 },
      { custo: { WES: 45000 }, meta: {} },
    )
    expect(plano.custo).toEqual([])
    expect(plano.meta).toEqual([{ fornKey: 'WES', valor: 85 }])
  })

  it('store vazio ou indefinido não quebra', () => {
    expect(planoVazio(planejarMigracao({}, {}, VAZIO))).toBe(true)
    expect(planoVazio(planejarMigracao(
      undefined as unknown as Record<string, number>,
      undefined as unknown as Record<string, number>,
      VAZIO,
    ))).toBe(true)
  })
})

describe('planoVazio', () => {
  it('detecta plano sem nada a fazer', () => {
    expect(planoVazio({ custo: [], meta: [] })).toBe(true)
    expect(planoVazio({ custo: [{ fornKey: 'WES', valor: 1 }], meta: [] })).toBe(false)
    expect(planoVazio({ custo: [], meta: [{ fornKey: 'WES', valor: 1 }] })).toBe(false)
  })
})
