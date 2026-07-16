import { useEffect, useState } from 'react'
import type { OSRow } from '../../lib/types'
import { getBairroCoords } from './geo'
import { geocodeAddress } from './searchAddress'

export const MAX_GEOCODE_OS = 60
const GEOCODE_DELAY_MS = 1100
const CACHE_KEY = 'cabonnet:geocode-cache'

type Coords = { lat: number; lng: number }

export function buildOSAddress(os: OSRow): string | null {
  const enderecoconexao = typeof os.enderecoconexao === 'string' ? os.enderecoconexao : ''
  const logradouro = (os.logradouro || enderecoconexao).trim()
  const cidade = (os.nomedacidade || '').trim()
  if (!logradouro || !cidade) return null
  const numero = (os.numero || '').trim()
  const bairro = (os.bairro || '').trim()
  const rua = [logradouro, numero].filter(Boolean).join(', ')
  return [rua, bairro, cidade].filter(Boolean).join(' - ')
}

export function normalizeAddressKey(address: string): string {
  return address.trim().toUpperCase()
}

export function loadGeocodeCache(): Record<string, Coords> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    console.warn('Falha ao ler cache de geocodificação', e)
    return {}
  }
}

export function saveGeocodeCache(cache: Record<string, Coords>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.warn('Falha ao salvar cache de geocodificação', e)
  }
}

export interface GeocodedOSPoint {
  os:     OSRow
  lat:    number
  lng:    number
  approx: boolean
}

export interface UseGeocodedEquipeOSResult {
  points:   GeocodedOSPoint[]
  resolved: number
  total:    number
  capped:   boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function fallbackPoint(os: OSRow): GeocodedOSPoint | null {
  const coords = getBairroCoords(os.nomedacidade, os.bairro)
  if (!coords) return null
  return { os, lat: coords.lat, lng: coords.lng, approx: true }
}

async function resolveOne(
  os: OSRow,
  cache: Record<string, Coords>,
): Promise<{ point: GeocodedOSPoint | null; calledNetwork: boolean }> {
  const address = buildOSAddress(os)
  if (!address) return { point: fallbackPoint(os), calledNetwork: false }

  const key = normalizeAddressKey(address)
  const cached = cache[key]
  if (cached) {
    return { point: { os, lat: cached.lat, lng: cached.lng, approx: false }, calledNetwork: false }
  }

  try {
    const results = await geocodeAddress(address)
    if (results.length > 0) {
      const { lat, lng } = results[0]
      cache[key] = { lat, lng }
      saveGeocodeCache(cache)
      return { point: { os, lat, lng, approx: false }, calledNetwork: true }
    }
    return { point: fallbackPoint(os), calledNetwork: true }
  } catch {
    return { point: fallbackPoint(os), calledNetwork: true }
  }
}

export function useGeocodedEquipeOS(
  rows: OSRow[],
  active: boolean,
  options?: { delayMs?: number },
): UseGeocodedEquipeOSResult {
  const delayMs = options?.delayMs ?? GEOCODE_DELAY_MS
  const limited = active ? rows.slice(0, MAX_GEOCODE_OS) : []
  const total = limited.length
  const capped = active && rows.length > MAX_GEOCODE_OS
  const signature = limited.map(r => r.numos).join(',')

  const [points, setPoints] = useState<GeocodedOSPoint[]>([])
  const [resolvedCount, setResolvedCount] = useState(0)

  useEffect(() => {
    if (!active || limited.length === 0) {
      setPoints([])
      setResolvedCount(0)
      return
    }

    let cancelled = false
    const cache = loadGeocodeCache()
    const resolvedPoints: GeocodedOSPoint[] = []
    setPoints([])
    setResolvedCount(0)

    async function run() {
      for (const os of limited) {
        if (cancelled) return
        const { point, calledNetwork } = await resolveOne(os, cache)
        if (cancelled) return
        if (point) {
          resolvedPoints.push(point)
          setPoints([...resolvedPoints])
        }
        setResolvedCount(c => c + 1)
        if (calledNetwork && !cancelled) await sleep(delayMs)
      }
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, active, delayMs])

  return { points, resolved: resolvedCount, total, capped }
}
