import { beforeEach, describe, expect, it } from 'vitest'
import { useTelegramStore } from './telegramStore'

describe('telegramStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useTelegramStore.setState({ history: [], ativo: false })
  })

  it('persiste a ativação do motor de alertas', () => {
    useTelegramStore.getState().setAtivo(true)

    expect(useTelegramStore.getState().ativo).toBe(true)
    expect(localStorage.getItem('cfg_alerta_ativo')).toBe('1')
  })

  it('mantém a deduplicação mesmo depois de limpar o histórico visual', () => {
    const store = useTelegramStore.getState()
    store.addAlert({ tipo: 'fila_alta', ref: 'global', nivel: 'atencao', titulo: 'Fila alta' })
    store.clearHistory()

    expect(useTelegramStore.getState().history).toEqual([])
    expect(useTelegramStore.getState().jaEmitido('fila_alta', 'global')).toBe(true)
  })
})
