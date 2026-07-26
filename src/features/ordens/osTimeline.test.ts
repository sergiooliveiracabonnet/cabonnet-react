import { describe, expect, it } from 'vitest'
import { buildAgendamentoSequence } from './osTimeline'

describe('buildAgendamentoSequence', () => {
  it('posiciona o primeiro agendamento antes dos reagendamentos e numera em ordem', () => {
    const result = buildAgendamentoSequence({
      dataatendimento: '24/07/2026',
      dataagendamento: '25/07/2026',
      equipeAgendada: 'REAGENDAMENTO O',
      historico: [
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'COPE', descsituacao: 'Pendente', ts: 10 },
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'INST F08 - ELCIO', descsituacao: 'Pendente', ts: 20 },
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'REAGENDAMENTO O', descsituacao: 'Pendente', ts: 30 },
      ],
    })

    expect(result.map(item => item.label)).toEqual([
      '1º Agendamento', 'Reagendamento 1', 'Reagendamento 2', 'Reagendamento 3',
    ])
    expect(result.map(item => item.equipe)).toEqual([
      'REAGENDAMENTO O', 'COPE', 'INST F08 - ELCIO', 'REAGENDAMENTO O',
    ])
  })

  it('não duplica o primeiro agendamento quando o histórico contém o mesmo registro', () => {
    const result = buildAgendamentoSequence({
      dataatendimento: '24/07/2026',
      dataagendamento: '24/07/2026',
      equipeAgendada: 'F08',
      historico: [
        { numos: '1', dataagendamento: '24/07/2026', nomedaequipe: 'F08', descsituacao: 'Pendente', ts: 10 },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('1º Agendamento')
  })

  it('mantém Agendamento como primeiro rótulo quando não existe dataatendimento', () => {
    const result = buildAgendamentoSequence({
      dataatendimento: null,
      dataagendamento: '26/07/2026',
      equipeAgendada: 'F08',
      historico: [
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'COPE', descsituacao: 'Pendente', ts: 20 },
        { numos: '1', dataagendamento: '26/07/2026', nomedaequipe: 'F08', descsituacao: 'Pendente', ts: 30 },
      ],
    })

    expect(result.map(item => item.label)).toEqual(['Agendamento', 'Reagendamento 1'])
  })
})
