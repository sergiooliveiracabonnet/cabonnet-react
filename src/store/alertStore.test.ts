import { describe, it, expect } from 'vitest'
import {
  migrateAlertStore, ALERT_STORE_VERSION,
  DEFAULT_META_SLA, DEFAULT_SLA_LIMITS, DEFAULT_RULES,
} from './alertStore'

describe('migrateAlertStore', () => {
  it('a meta de SLA padrão é 80%', () => {
    expect(Object.values(DEFAULT_META_SLA).every(v => v === 80)).toBe(true)
  })

  // O valor salvo era alvo de um score composto que não existe mais. Carregá-lo
  // manteria o número e trocaria o significado por baixo do gestor.
  it('descarta a meta do score composto ao vir de uma versão anterior à 4', () => {
    const migrado = migrateAlertStore(
      { metaScore: { WES: 70, Instacable: 65 }, metaSla: { WES: 70 } },
      3
    )
    expect(migrado.metaSla).toEqual(DEFAULT_META_SLA)
    expect(migrado).not.toHaveProperty('metaScore.WES', 70)
  })

  it('preserva a meta de SLA de quem já está na versão corrente', () => {
    const custom = { WES: 95, Instacable: 88, THM: 80 }
    const migrado = migrateAlertStore({ metaSla: custom }, ALERT_STORE_VERSION)
    expect(migrado.metaSla).toEqual(custom)
  })

  it('preenche os padrões quando o estado salvo está incompleto', () => {
    const migrado = migrateAlertStore({}, ALERT_STORE_VERSION)
    expect(migrado.slaLimits).toEqual(DEFAULT_SLA_LIMITS)
    expect(migrado.rules).toEqual(DEFAULT_RULES)
    expect(migrado.metaSla).toEqual(DEFAULT_META_SLA)
    expect(migrado.acknowledged).toEqual({})
  })

  it('não quebra quando não há nada persistido', () => {
    expect(() => migrateAlertStore(undefined, 1)).not.toThrow()
    expect(migrateAlertStore(undefined, 1).metaSla).toEqual(DEFAULT_META_SLA)
  })

  it('limpa os reconhecimentos vindos de antes da v2, mas mantém depois', () => {
    const ack = { 'regra-1': 1750000000000 }
    expect(migrateAlertStore({ acknowledged: ack }, 1).acknowledged).toEqual({})
    expect(migrateAlertStore({ acknowledged: ack }, 3).acknowledged).toEqual(ack)
  })

  it('não mexe nos limites de SLA que o gestor customizou', () => {
    const custom = { ...DEFAULT_SLA_LIMITS, MANUTENCAO: 3 }
    expect(migrateAlertStore({ slaLimits: custom }, 3).slaLimits).toEqual(custom)
  })
})
