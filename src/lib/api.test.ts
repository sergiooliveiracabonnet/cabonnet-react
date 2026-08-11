import { describe, expect, it } from 'vitest'
import { createRequestId, resolveApiBase } from './api'

describe('resolveApiBase', () => {
  it('força mesma origem durante automação de PDF', () => {
    expect(resolveApiBase('http://192.168.0.103:5000', '?automation=pdf')).toBe('')
  })

  it('preserva a API configurada no acesso normal', () => {
    expect(resolveApiBase('http://192.168.0.103:5000', '')).toBe('http://192.168.0.103:5000')
  })
})

describe('createRequestId', () => {
  it('funciona em acesso HTTP pela rede local sem randomUUID', () => {
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} })
    try {
      expect(createRequestId()).toMatch(/^req-/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original })
    }
  })
})
