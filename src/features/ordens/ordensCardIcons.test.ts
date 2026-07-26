import { describe, expect, it } from 'vitest'
import { ORDENS_CARD_ICONS } from './ordensCardIcons'

describe('ORDENS_CARD_ICONS', () => {
  it('define um ícone para cada card de indicador do menu Ordens', () => {
    expect(Object.keys(ORDENS_CARD_ICONS)).toEqual([
      'total',
      'criticas',
      'semEquipe',
      'agendHoje',
      'agendAmanha',
      'agendFuturo',
    ])

    Object.values(ORDENS_CARD_ICONS).forEach((Icon) => {
      expect(Icon).toBeTruthy()
    })
  })
})
