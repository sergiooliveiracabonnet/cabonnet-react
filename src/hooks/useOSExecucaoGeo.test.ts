import { describe, it, expect } from 'vitest'
import { parseExecucaoGeoRow } from './useOSExecucaoGeo'

describe('parseExecucaoGeoRow', () => {
  it('parseia uma linha válida', () => {
    const result = parseExecucaoGeoRow({
      numos: 9999999, latitudeinicio: '-23.1896', longitudeinicio: '-45.8841',
      equipeagendada: 'F01 - Equipe Teste',
    })
    expect(result).toEqual({ numos: '9999999', lat: -23.1896, lng: -45.8841, equipeagendada: 'F01 - Equipe Teste' })
  })

  it('retorna null quando latitude/longitude ausentes', () => {
    expect(parseExecucaoGeoRow({ numos: 1, latitudeinicio: null, longitudeinicio: null })).toBeNull()
  })

  it('retorna null quando latitude/longitude são zero (coordenada inválida)', () => {
    expect(parseExecucaoGeoRow({ numos: 1, latitudeinicio: '0', longitudeinicio: '0' })).toBeNull()
  })

  it('retorna null quando latitude/longitude não são numéricos', () => {
    expect(parseExecucaoGeoRow({ numos: 1, latitudeinicio: 'abc', longitudeinicio: '-45.8' })).toBeNull()
  })

  it('equipeagendada vira null quando ausente', () => {
    const result = parseExecucaoGeoRow({ numos: 1, latitudeinicio: '-23.1', longitudeinicio: '-45.8' })
    expect(result?.equipeagendada).toBeNull()
  })
})
