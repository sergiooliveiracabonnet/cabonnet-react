import { describe, it, expect, beforeEach } from 'vitest'
import { storage } from './storage'

// jsdom provê localStorage em memória — funciona nativamente nos testes Vitest

describe('storage.getString', () => {
  beforeEach(() => localStorage.clear())

  it('retorna o valor armazenado', () => {
    localStorage.setItem('chave', 'valor')
    expect(storage.getString('chave', 'padrão')).toBe('valor')
  })

  it('retorna defaultValue quando chave não existe', () => {
    expect(storage.getString('inexistente', 'padrão')).toBe('padrão')
  })
})

describe('storage.getInt', () => {
  beforeEach(() => localStorage.clear())

  it('retorna o número armazenado', () => {
    localStorage.setItem('n', '42')
    expect(storage.getInt('n', 0)).toBe(42)
  })

  it('retorna defaultValue quando valor não é número', () => {
    localStorage.setItem('n', 'abc')
    expect(storage.getInt('n', 99)).toBe(99)
  })

  it('retorna defaultValue quando chave não existe', () => {
    expect(storage.getInt('inexistente', 5)).toBe(5)
  })
})

describe('storage.getJSON', () => {
  beforeEach(() => localStorage.clear())

  it('retorna array armazenado', () => {
    localStorage.setItem('arr', JSON.stringify([1, 2, 3]))
    expect(storage.getJSON('arr', [])).toEqual([1, 2, 3])
  })

  it('retorna objeto armazenado', () => {
    localStorage.setItem('obj', JSON.stringify({ a: 1 }))
    expect(storage.getJSON('obj', {})).toEqual({ a: 1 })
  })

  it('retorna defaultValue para JSON inválido', () => {
    localStorage.setItem('mal', '{invalid}')
    expect(storage.getJSON('mal', [])).toEqual([])
  })

  it('retorna defaultValue quando chave não existe', () => {
    expect(storage.getJSON('inexistente', { x: 0 })).toEqual({ x: 0 })
  })
})

describe('storage.set e storage.remove', () => {
  beforeEach(() => localStorage.clear())

  it('armazena e recupera string', () => {
    storage.set('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('remove chave existente', () => {
    localStorage.setItem('k', 'v')
    storage.remove('k')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('setJSON serializa corretamente', () => {
    storage.setJSON('arr', [1, 2])
    expect(JSON.parse(localStorage.getItem('arr')!)).toEqual([1, 2])
  })
})
