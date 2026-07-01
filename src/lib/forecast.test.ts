import { describe, it, expect } from 'vitest'
import { forecastDemand } from './forecast'

function serieCrescente(dias: number, base = 10, incremento = 1): { data: string; abertas: number }[] {
  const start = new Date(2025, 0, 1)
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return {
      data:    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      abertas: base + i * incremento,
    }
  })
}

describe('forecastDemand', () => {
  it('retorna null com menos de 7 pontos', () => {
    expect(forecastDemand(serieCrescente(5))).toBeNull()
  })

  it('projeta 7 dias a partir de uma série válida', () => {
    const r = forecastDemand(serieCrescente(21))
    expect(r).not.toBeNull()
    expect(r?.previsao).toHaveLength(7)
    expect(r?.previsao.every(d => d.volume >= 0)).toBe(true)
  })

  it('identifica tendência crescente numa série em alta constante', () => {
    const r = forecastDemand(serieCrescente(21, 10, 2))
    expect(r?.tendencia).toBe('crescente')
  })

  it('identifica tendência decrescente numa série em queda constante', () => {
    const r = forecastDemand(serieCrescente(21, 50, -2))
    expect(r?.tendencia).toBe('decrescente')
  })

  it('identifica tendência estável numa série constante', () => {
    const r = forecastDemand(serieCrescente(21, 20, 0))
    expect(r?.tendencia).toBe('estável')
  })

  it('atribui confiança baixa com poucos pontos (< 14 dias)', () => {
    const r = forecastDemand(serieCrescente(10))
    expect(r?.previsao[0].confianca).toBe('baixa')
  })

  it('atribui confiança alta com série longa e tendência bem definida', () => {
    const r = forecastDemand(serieCrescente(30, 10, 3))
    expect(r?.previsao[0].confianca).toBe('alta')
  })

  it('pico_previsto aponta o dia de maior volume projetado', () => {
    const r = forecastDemand(serieCrescente(21, 10, 2))
    expect(r?.pico_previsto).not.toBeNull()
    const maxVolume = Math.max(...(r?.previsao.map(d => d.volume) ?? []))
    expect(r?.pico_previsto?.volume).toBe(maxVolume)
  })

  it('ignora pontos com data inválida', () => {
    const serie = [...serieCrescente(10), { data: 'invalido', abertas: 999 }]
    const r = forecastDemand(serie)
    expect(r).not.toBeNull()
  })
})
