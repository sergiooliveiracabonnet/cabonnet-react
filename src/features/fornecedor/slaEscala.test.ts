import { describe, expect, it } from 'vitest'
import { slaEscala, SLA_EXCELENTE, SLA_BOM, SLA_REGULAR } from './slaEscala'

describe('slaEscala — régua única de SLA', () => {
  it('classifica as quatro faixas pelos limites declarados', () => {
    expect(slaEscala(SLA_EXCELENTE).label).toBe('Excelente')
    expect(slaEscala(SLA_BOM).label).toBe('Bom')
    expect(slaEscala(SLA_REGULAR).label).toBe('Regular')
    expect(slaEscala(SLA_REGULAR - 1).label).toBe('Crítico')
  })

  it('100% é Excelente e 0% é Crítico', () => {
    expect(slaEscala(100).label).toBe('Excelente')
    expect(slaEscala(0).label).toBe('Crítico')
  })

  // O defeito que motivou o módulo: 72% era "Regular" (amarelo) no cabeçalho e
  // vermelho no Badge ao lado, porque cada um tinha sua própria régua.
  it('72% tem uma classificação só, coerente entre texto e badge', () => {
    const e = slaEscala(72)
    expect(e.label).toBe('Regular')
    expect(e.accent).toBe('yellow')
    expect(e.badge).toBe('yellow')
    expect(e.text).toContain('yellow')
  })

  it('cor do texto e variante do badge nunca divergem', () => {
    for (const v of [0, 30, 64, 65, 79, 80, 89, 90, 100]) {
      const e = slaEscala(v)
      const esperado = { green: 'green', primary: 'cyan', yellow: 'yellow', red: 'red' }[e.accent]
      expect(e.badge).toBe(esperado)
    }
  })

  // O Badge resolve variante desconhecida com `?? ''` e sai sem cor nenhuma,
  // sem erro de build. Travar a lista evita reintroduzir isso.
  it('só devolve variantes que o Badge conhece', () => {
    const conhecidas = ['green', 'red', 'yellow', 'orange', 'purple', 'cyan', 'teal']
    for (const v of [0, 65, 80, 90, 100]) {
      expect(conhecidas).toContain(slaEscala(v).badge)
    }
  })
})
