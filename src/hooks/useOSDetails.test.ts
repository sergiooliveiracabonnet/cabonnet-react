import { describe, expect, it } from 'vitest'
import { parseOSDetails } from './useOSDetails'

describe('parseOSDetails — textos carregados sob demanda', () => {
  it('preserva observação geral e crítica do endpoint de detalhes', () => {
    const details = parseOSDetails({
      os: {
        observacoes: 'Histórico completo da execução',
        observacaocritica: 'Cliente precisa de prioridade',
      },
    })

    expect(details?.observacoes).toBe('Histórico completo da execução')
    expect(details?.observacaoCritica).toBe('Cliente precisa de prioridade')
  })
})
