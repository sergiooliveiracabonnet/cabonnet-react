import { describe, expect, it } from 'vitest'
import { shouldReloadStaleChunk } from './chunkRecovery'

describe('recuperação de chunks obsoletos', () => {
  it('permite uma atualização automática quando não houve tentativa recente', () => {
    expect(shouldReloadStaleChunk(null, 100_000)).toBe(true)
    expect(shouldReloadStaleChunk('60000', 100_000)).toBe(true)
  })

  it('bloqueia ciclos de atualização durante trinta segundos', () => {
    expect(shouldReloadStaleChunk('90001', 100_000)).toBe(false)
    expect(shouldReloadStaleChunk('inválido', 100_000)).toBe(false)
  })
})
