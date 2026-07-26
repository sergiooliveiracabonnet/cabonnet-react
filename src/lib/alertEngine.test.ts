import { describe, expect, it } from 'vitest'
import type { OSRow } from './types'
import { buildAlertMetrics, evaluateAlertRules, summarizeAlerts } from './alertEngine'
import type { AlertRule } from '../store/alertStore'

const row = (patch: Partial<OSRow>): OSRow => ({
  numos: '1234567',
  descsituacao: 'Pendente',
  _tipo: 'MANUTENCAO',
  ...patch,
} as OSRow)

describe('alertEngine', () => {
  it('calcula OS sem equipe há mais de quatro horas na fila operacional completa', () => {
    const metrics = buildAlertMetrics([
      row({ numos: '1234567', _agingHoras: 5, nomedaequipe: '' }),
      row({ numos: '1234568', _agingHoras: 3, nomedaequipe: '' }),
      row({ numos: '1234569', _agingHoras: 8, nomedaequipe: 'F08' }),
    ], [])

    expect(metrics.total).toBe(3)
    expect(metrics.semEquipe).toBe(2)
    expect(metrics.semEquipe4h).toBe(1)
  })

  it('ignora REDE, COPE, reagendamento e registros fora da fila ativa', () => {
    const metrics = buildAlertMetrics([
      row({ _tipo: 'REDE' }),
      row({ nomedaequipe: 'COPE' }),
      row({ nomedaequipe: 'REAGENDAMENTO O' }),
      row({ descsituacao: 'Concluída' }),
    ], [])

    expect(metrics.total).toBe(0)
  })

  it('dispara a regra semEquipe4h com a métrica correspondente', () => {
    const rules: AlertRule[] = [{
      id: 'sem_equipe_4h', label: 'Sem equipe 4h', desc: '', metric: 'semEquipe4h',
      operator: '>', threshold: 0, severity: 'critical', enabled: true,
    }]

    expect(evaluateAlertRules(rules, { total: 1, criticas: 0, semEquipe: 1, semEquipe4h: 1, taxa: 0 })[0])
      .toMatchObject({ id: 'sem_equipe_4h', currentValue: 1 })
  })

  it('não interpreta período vazio como taxa de conclusão crítica', () => {
    const metrics = buildAlertMetrics([row({})], [])
    expect(metrics.taxa).toBe(100)
  })

  it('separa regras disparadas de ocorrências afetadas', () => {
    expect(summarizeAlerts([
      { id: 'a', severity: 'CRITICO', count: 12 },
      { id: 'b', severity: 'ALTO', count: 4 },
    ], [{ severity: 'critical' }, { severity: 'warning' }], new Set(['operational:a'])))
      .toEqual({ rulesTriggered: 4, occurrences: 16, criticalOccurrences: 12, acknowledged: 1 })
  })
})
