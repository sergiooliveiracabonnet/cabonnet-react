import { describe, expect, it } from 'vitest'
import { buildStatusMap, contarEquipesComStatus, ESCALA_EQUIPES } from './escalaConstants'

const DAYS = [
  { key: '14/09/2026' }, { key: '15/09/2026' }, { key: '16/09/2026' },
  { key: '17/09/2026' }, { key: '18/09/2026' }, { key: '19/09/2026' }, { key: '20/09/2026' },
]

describe('contarEquipesComStatus', () => {
  it('conta a equipe uma vez só, mesmo com o status preenchido nos 7 dias da semana', () => {
    // F12 é THM (terceira) — mesmo caso relatado: uma equipe de férias a
    // semana toda não pode virar "7 equipes de férias".
    const equipeF12 = ESCALA_EQUIPES.find(e => e.codigo === 'F12')
    expect(equipeF12?.empresa).toBe('THM')

    const items = DAYS.map(d => ({
      team_code: 'F12', dia: d.key, local1: 'Férias', local2: '',
      updated_at: '', updated_by: '',
    }))
    const statusMap = buildStatusMap(items)

    const { propria, terceira } = contarEquipesComStatus('Férias', statusMap, DAYS)
    expect(terceira).toBe(1)
    expect(propria).toBe(0)
  })

  it('soma equipes diferentes com o mesmo status', () => {
    const items = [
      { team_code: 'F12', dia: DAYS[0].key, local1: 'Ausente', local2: '', updated_at: '', updated_by: '' },
      { team_code: 'F13', dia: DAYS[1].key, local1: 'Ausente', local2: '', updated_at: '', updated_by: '' },
      { team_code: 'M01', dia: DAYS[0].key, local1: 'Ausente', local2: '', updated_at: '', updated_by: '' },
    ]
    const statusMap = buildStatusMap(items)

    const { propria, terceira } = contarEquipesComStatus('Ausente', statusMap, DAYS)
    expect(terceira).toBe(2) // F12 e F13 (THM)
    expect(propria).toBe(1)  // M01
  })

  it('também conta quando o status está no local2', () => {
    const items = [
      { team_code: 'F01', dia: DAYS[0].key, local1: 'Caçapava', local2: 'Plantão', updated_at: '', updated_by: '' },
    ]
    const statusMap = buildStatusMap(items)

    const { terceira } = contarEquipesComStatus('Plantão', statusMap, DAYS)
    expect(terceira).toBe(1)
  })

  it('não conta equipe sem nenhum dia com o status', () => {
    const items = [
      { team_code: 'F01', dia: DAYS[0].key, local1: 'Caçapava', local2: '', updated_at: '', updated_by: '' },
    ]
    const statusMap = buildStatusMap(items)

    const { propria, terceira } = contarEquipesComStatus('Férias', statusMap, DAYS)
    expect(propria).toBe(0)
    expect(terceira).toBe(0)
  })
})
