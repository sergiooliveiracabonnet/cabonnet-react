import { describe, expect, it } from 'vitest'
import { buildAgendamentoSequence } from './osTimeline'

describe('buildAgendamentoSequence', () => {
  it('posiciona o primeiro agendamento antes dos reagendamentos e numera em ordem', () => {
    const result = buildAgendamentoSequence({
      dataatendimento: '24/07/2026',
      dataagendamento: '25/07/2026',
      equipeAgendada: 'REAGENDAMENTO O',
      historico: [
        { numos: '1', dataagendamento: '24/07/2026', nomedaequipe: 'INST F08 - ELCIO', descsituacao: 'Pendente', ts: 5 },
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'COPE', descsituacao: 'Pendente', ts: 10 },
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'INST F11', descsituacao: 'Pendente', ts: 20 },
        { numos: '1', dataagendamento: '25/07/2026', nomedaequipe: 'REAGENDAMENTO O', descsituacao: 'Pendente', ts: 30 },
      ],
    })

    expect(result.map(item => item.label)).toEqual([
      '1º Agendamento', 'Reagendamento 1', 'Reagendamento 2', 'Reagendamento 3',
    ])
    expect(result.map(item => item.equipe)).toEqual([
      'INST F08 - ELCIO', 'COPE', 'INST F11', 'REAGENDAMENTO O',
    ])
  })

  it('associa cada ocorrencia de reagendamento ao evento de mesma ordem', () => {
    const result = buildAgendamentoSequence({
      dataatendimento: '24/07/2026', dataagendamento: '27/07/2026', equipeAgendada: 'F12',
      historico: [
        { numos: '1', dataagendamento: '24/07/2026', nomedaequipe: 'F08', descsituacao: 'Pendente', ts: 10 },
        { numos: '1', dataagendamento: '26/07/2026', nomedaequipe: 'F11', descsituacao: 'Pendente', ts: 20 },
        { numos: '1', dataagendamento: '27/07/2026', nomedaequipe: 'F12', descsituacao: 'Pendente', ts: 30 },
      ],
      observacoesReagendamento: ['Cliente ausente', 'Chuva forte'],
    })

    expect(result.map(item => item.observacao)).toEqual([null, 'Cliente ausente', 'Chuva forte'])
  })

  it('mantém a observação vinculada à equipe e usa ocorrência como fallback', () => {
    const result = buildAgendamentoSequence({
      dataatendimento: '24/07/2026', dataagendamento: '26/07/2026', equipeAgendada: 'F11',
      historico: [
        { numos: '1', dataagendamento: '24/07/2026', nomedaequipe: 'F08', descsituacao: 'Pendente', ts: 10 },
        { numos: '1', dataagendamento: '26/07/2026', nomedaequipe: 'F11', descsituacao: 'Pendente', ts: 20,
          observacoes: 'Motivo meteorológico' },
      ],
      observacoesReagendamento: ['Cliente ausente'],
    })
    expect(result[0].equipe).toBe('F08')
    expect(result[1].observacao).toBe('Motivo meteorológico')
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
