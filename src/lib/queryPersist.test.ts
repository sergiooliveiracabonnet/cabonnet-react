import { beforeEach, describe, expect, it, vi } from 'vitest'
import { broadcastData, persistSave } from './queryPersist'

describe('queryPersist — proteção do thread principal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('persiste e sinaliza payload pequeno', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    expect(persistSave({ agendado: 'numos\n1234567' })).toBe(true)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('não serializa payload acima do limite síncrono', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    expect(persistSave({ agendado: 'x'.repeat(5_000_000) })).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('não clona payload grande via BroadcastChannel', () => {
    const channel = vi.fn()
    vi.stubGlobal('BroadcastChannel', channel)

    expect(broadcastData({ agendado: 'x'.repeat(5_000_000) })).toBe(false)
    expect(channel).not.toHaveBeenCalled()
  })
})
