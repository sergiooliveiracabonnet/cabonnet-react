import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { OSRow } from '../../lib/types'

vi.mock('./searchAddress', () => ({
  geocodeAddress: vi.fn(),
}))
import { geocodeAddress } from './searchAddress'
import {
  useGeocodedEquipeOS, buildOSAddress, normalizeAddressKey,
  loadGeocodeCache, saveGeocodeCache, MAX_GEOCODE_OS,
} from './useGeocodedEquipeOS'
import { getBairroCoords } from './geo'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'INST F01',
    tiposervico:     'INSTALACAO',
    servico:         'INSTALACAO RESIDENCIAL',
    descsituacao:    'Pendente',
    datacadastro:    '01/01/2026',
    dataagendamento: '',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      'RUA TESTE',
    complemento:     '',
    numero:          '100',
    empresa:         '',
    obs:             '',
    periodo:         '',
    ...overrides,
  } as unknown as OSRow
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(geocodeAddress).mockReset()
})

describe('buildOSAddress', () => {
  it('monta endereço a partir de logradouro, número, bairro e cidade', () => {
    const os = makeOS({ logradouro: 'RUA DAS FLORES', numero: '42', bairro: 'CENTRO', nomedacidade: 'TAUBATE' })
    expect(buildOSAddress(os)).toBe('RUA DAS FLORES, 42 - CENTRO - TAUBATE')
  })

  it('usa enderecoconexao quando logradouro está vazio', () => {
    const os = makeOS({ logradouro: '', enderecoconexao: 'AV CONEXAO', numero: '10', bairro: 'CENTRO', nomedacidade: 'TAUBATE' })
    expect(buildOSAddress(os)).toBe('AV CONEXAO, 10 - CENTRO - TAUBATE')
  })

  it('retorna null quando não há logradouro/enderecoconexao nem cidade', () => {
    expect(buildOSAddress(makeOS({ logradouro: '', nomedacidade: '' }))).toBeNull()
  })
})

describe('normalizeAddressKey', () => {
  it('normaliza espaços e caixa', () => {
    expect(normalizeAddressKey('  rua teste, 1 - centro - taubate  ')).toBe('RUA TESTE, 1 - CENTRO - TAUBATE')
  })
})

describe('loadGeocodeCache / saveGeocodeCache', () => {
  it('retorna objeto vazio quando não há cache salvo', () => {
    expect(loadGeocodeCache()).toEqual({})
  })

  it('persiste e recupera o cache', () => {
    saveGeocodeCache({ 'RUA X - CENTRO - TAUBATE': { lat: -23, lng: -45 } })
    expect(loadGeocodeCache()).toEqual({ 'RUA X - CENTRO - TAUBATE': { lat: -23, lng: -45 } })
  })
})

describe('useGeocodedEquipeOS', () => {
  it('não faz nada quando active=false', () => {
    const { result } = renderHook(() => useGeocodedEquipeOS([makeOS()], false, { delayMs: 0 }))
    expect(result.current).toEqual({ points: [], resolved: 0, total: 0, capped: false })
    expect(geocodeAddress).not.toHaveBeenCalled()
  })

  it('geocodifica via geocodeAddress e cacheia o resultado', async () => {
    vi.mocked(geocodeAddress).mockResolvedValue([
      { lat: -23.05, lng: -45.4, label: 'Rua Teste, 100', bairro: 'Centro', cidade: 'Taubaté' },
    ])
    const os = makeOS({ numos: 'A' })
    const { result } = renderHook(() => useGeocodedEquipeOS([os], true, { delayMs: 0 }))

    await waitFor(() => expect(result.current.resolved).toBe(1))
    expect(result.current.points).toEqual([{ os, lat: -23.05, lng: -45.4, approx: false }])
    expect(geocodeAddress).toHaveBeenCalledTimes(1)

    const cacheKey = normalizeAddressKey(buildOSAddress(os)!)
    expect(loadGeocodeCache()[cacheKey]).toEqual({ lat: -23.05, lng: -45.4 })
  })

  it('usa o cache e não chama geocodeAddress de novo', async () => {
    const os = makeOS({ numos: 'B' })
    const cacheKey = normalizeAddressKey(buildOSAddress(os)!)
    saveGeocodeCache({ [cacheKey]: { lat: -23.1, lng: -45.5 } })

    const { result } = renderHook(() => useGeocodedEquipeOS([os], true, { delayMs: 0 }))

    await waitFor(() => expect(result.current.resolved).toBe(1))
    expect(result.current.points).toEqual([{ os, lat: -23.1, lng: -45.5, approx: false }])
    expect(geocodeAddress).not.toHaveBeenCalled()
  })

  it('cai pro fallback de bairro quando geocodeAddress não encontra resultado', async () => {
    vi.mocked(geocodeAddress).mockResolvedValue([])
    const os = makeOS({ numos: 'C', nomedacidade: 'TAUBATE', bairro: 'CENTRO' })
    const { result } = renderHook(() => useGeocodedEquipeOS([os], true, { delayMs: 0 }))

    await waitFor(() => expect(result.current.resolved).toBe(1))
    const fallback = getBairroCoords('TAUBATE', 'CENTRO')!
    expect(result.current.points).toEqual([{ os, lat: fallback.lat, lng: fallback.lng, approx: true }])
  })

  it('cai pro fallback de bairro quando geocodeAddress rejeita', async () => {
    vi.mocked(geocodeAddress).mockRejectedValue(new Error('rede fora'))
    const os = makeOS({ numos: 'D', nomedacidade: 'TAUBATE', bairro: 'CENTRO' })
    const { result } = renderHook(() => useGeocodedEquipeOS([os], true, { delayMs: 0 }))

    await waitFor(() => expect(result.current.resolved).toBe(1))
    const fallback = getBairroCoords('TAUBATE', 'CENTRO')!
    expect(result.current.points).toEqual([{ os, lat: fallback.lat, lng: fallback.lng, approx: true }])
  })

  it('limita a MAX_GEOCODE_OS e reporta capped=true', async () => {
    vi.mocked(geocodeAddress).mockImplementation(async (query: string) => [
      { lat: -23, lng: -45, label: query, bairro: 'Centro', cidade: 'Taubaté' },
    ])
    const rows = Array.from({ length: MAX_GEOCODE_OS + 1 }, (_, i) =>
      makeOS({ numos: `E${i}`, logradouro: `RUA ${i}` }))

    const { result } = renderHook(() => useGeocodedEquipeOS(rows, true, { delayMs: 0 }))

    await waitFor(() => expect(result.current.resolved).toBe(MAX_GEOCODE_OS), { timeout: 5000 })
    expect(result.current.total).toBe(MAX_GEOCODE_OS)
    expect(result.current.capped).toBe(true)
    expect(geocodeAddress).toHaveBeenCalledTimes(MAX_GEOCODE_OS)
  })
})
