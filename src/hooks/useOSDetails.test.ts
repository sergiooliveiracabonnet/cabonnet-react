import { describe, it, expect } from 'vitest'
import { mapFotos, mapChecklist } from './useOSDetails'

describe('mapFotos', () => {
  it('mapeia fotos válidas filtrando entradas sem nomearquivo', () => {
    const raw = [
      { id: 1, codfoto: 10, nomearquivo: 'foto1.jpg', descricao: 'Fachada', usuario: 'tec1', extensaoarquivo: 'jpg' },
      { id: 2, codfoto: 11, nomearquivo: '', descricao: null, usuario: 'tec1', extensaoarquivo: 'jpg' },
    ]
    const result = mapFotos(raw)
    expect(result).toEqual([
      { codfoto: 10, nomearquivo: 'foto1.jpg', descricao: 'Fachada' },
    ])
  })

  it('retorna lista vazia quando raw não é array', () => {
    expect(mapFotos(undefined)).toEqual([])
    expect(mapFotos(null)).toEqual([])
  })
})

describe('mapChecklist', () => {
  it('mapeia itens de checklist com checked normalizado para boolean', () => {
    const raw = [
      { servico: 'Instalação', descricao: 'Testou sinal', checked: true },
      { servico: 'Instalação', descricao: 'Limpou local', checked: false },
    ]
    expect(mapChecklist(raw)).toEqual([
      { servico: 'Instalação', descricao: 'Testou sinal', checked: true },
      { servico: 'Instalação', descricao: 'Limpou local', checked: false },
    ])
  })

  it('retorna lista vazia quando raw não é array', () => {
    expect(mapChecklist(undefined)).toEqual([])
  })
})
