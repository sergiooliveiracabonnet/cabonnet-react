import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../../lib/types'
import { buildTimeline, TIMELINE_HOURS } from './escalaTimeline'

const DIA = '14/09/2026'

function os(overrides: Partial<OSRow> & { horaatendimento?: string }): OSRow {
  return {
    numos: '1234567', nomecliente: 'Cliente', nomedacidade: 'Taubaté',
    nomedaequipe: 'INSTALACAO - F01 - FELIPE', tiposervico: 'INSTALACAO', servico: '',
    descsituacao: 'Pendente', datacadastro: DIA, dataagendamento: DIA,
    dataexecucao: '', databaixa: '', bairro: '', logradouro: '', complemento: '',
    numero: '', empresa: '', obs: '', periodo: '',
    ...overrides,
  } as OSRow
}

describe('buildTimeline', () => {
  it('agrupa a OS na hora de atendimento', () => {
    const [team] = buildTimeline([os({ horaatendimento: '09:00' })], DIA)
    expect(team.porHora[9]).toHaveLength(1)
    expect(team.total).toBe(1)
  })

  it('detecta conflito quando duas OS caem na mesma hora', () => {
    const [team] = buildTimeline([
      os({ numos: '1111111', horaatendimento: '10:00' }),
      os({ numos: '2222222', horaatendimento: '10:15' }),
    ], DIA)
    expect(team.porHora[10]).toHaveLength(2)
  })

  it('joga OS sem horaatendimento (ou fora de 08h–18h) no balde semHorario', () => {
    const [team] = buildTimeline([
      os({ numos: '1111111', horaatendimento: '' }),
      os({ numos: '2222222', horaatendimento: '19:00' }),
      os({ numos: '3333333' }), // sem o campo
    ], DIA)
    expect(team.semHorario).toHaveLength(3)
    expect(Object.keys(team.porHora)).toHaveLength(0)
  })

  it('a última hora da janela (17h) ainda entra na grade, 18h não', () => {
    const [team] = buildTimeline([
      os({ numos: '1111111', horaatendimento: '17:30' }),
      os({ numos: '2222222', horaatendimento: '18:00' }),
    ], DIA)
    expect(team.porHora[17]).toHaveLength(1)
    expect(team.semHorario).toHaveLength(1)
    expect(TIMELINE_HOURS[TIMELINE_HOURS.length - 1]).toBe(17)
  })

  it('separa por equipe e ignora OS de outro dia', () => {
    const teams = buildTimeline([
      os({ numos: '1111111', nomedaequipe: 'INSTALACAO - F01 - FELIPE', horaatendimento: '09:00' }),
      os({ numos: '2222222', nomedaequipe: 'INSTALACAO - F04 - THIAGO', horaatendimento: '09:00' }),
      os({ numos: '3333333', dataagendamento: '15/09/2026', horaatendimento: '09:00' }),
    ], DIA)
    expect(teams).toHaveLength(2)
    expect(teams.reduce((s, t) => s + t.total, 0)).toBe(2)
  })
})
