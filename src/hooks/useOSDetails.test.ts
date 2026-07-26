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

  it('inclui ocorrencias do tecnico no historico e identifica reagendamentos', () => {
    const details = parseOSDetails({
      os: {},
      ocorrencias: [
        { descricao: 'REAGENDADO - cliente ausente', data: '25/07/2026 14:32', usuario: 'TECNICO F08' },
        { ocorrencia: 'Motivo meteorologico - nova data', dataocorrencia: '26/07/2026 09:10' },
      ],
    })

    expect(details?.historico).toEqual([
      {
        texto: 'REAGENDADO - cliente ausente', autor: 'TECNICO F08',
        data: '25/07/2026', hora: '14:32', isReagend: true,
      },
      {
        texto: 'Motivo meteorologico - nova data', autor: null,
        data: '26/07/2026', hora: '09:10', isReagend: true,
      },
    ])
  })
})
