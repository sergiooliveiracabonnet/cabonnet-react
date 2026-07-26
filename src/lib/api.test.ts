import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './api'

describe('resolveApiBase', () => {
  it('força mesma origem durante automação de PDF', () => {
    expect(resolveApiBase('http://192.168.0.103:5000', '?automation=pdf')).toBe('')
  })

  it('preserva a API configurada no acesso normal', () => {
    expect(resolveApiBase('http://192.168.0.103:5000', '')).toBe('http://192.168.0.103:5000')
  })
})
