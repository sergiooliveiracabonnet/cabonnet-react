import { beforeEach, describe, expect, it, vi } from 'vitest'
import { broadcastData, persistLoad, persistSave } from './queryPersist'

describe('queryPersist — proteção do thread principal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('persiste e sinaliza payload pequeno', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    expect(persistSave('fornecedor:Instacable', { agendado: 'numos\n1234567' })).toBe(true)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('não serializa payload acima do limite síncrono', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    expect(persistSave('interno', { agendado: 'x'.repeat(5_000_000) })).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('não clona payload grande via BroadcastChannel', () => {
    const channel = vi.fn()
    vi.stubGlobal('BroadcastChannel', channel)

    expect(broadcastData('interno', { agendado: 'x'.repeat(5_000_000) })).toBe(false)
    expect(channel).not.toHaveBeenCalled()
  })

  it('isola o cache persistido entre fornecedores', () => {
    persistSave('fornecedor:Instacable', { agendado: 'instacable' })
    persistSave('fornecedor:WES', { agendado: 'wes' })

    expect(persistLoad('fornecedor:Instacable')?.payload.agendado).toBe('instacable')
    expect(persistLoad('fornecedor:WES')?.payload.agendado).toBe('wes')
    expect(persistLoad('interno')).toBeNull()
  })
})
