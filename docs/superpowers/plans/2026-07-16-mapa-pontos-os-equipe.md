# Mapa — Pontos Individuais de OS por Equipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando uma equipe é selecionada no Menu Mapa, mostrar um ponto por OS (endereço real geocodificado via Nominatim, com fallback aproximado por bairro) em vez das bolhas agregadas de cidade/bairro — com detalhes do cliente ao passar o mouse e clique abrindo o drawer completo.

**Architecture:** Um novo hook `useGeocodedEquipeOS` resolve, com rate-limit e cache em `localStorage`, a posição de cada OS de uma lista (endereço via Nominatim; se falhar ou não tiver endereço, cai para a posição aproximada de bairro já existente, agora extraída como `getBairroCoords` em `geo.ts`). `MapaPage.tsx` troca heatmap/bolhas por esses pontos individuais quando uma equipe está selecionada.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react (testes), react-leaflet, Nominatim/OpenStreetMap (geocodificação, já usado em `searchAddress.ts`).

## Global Constraints

- Geocodificação só dispara quando uma equipe **específica** está selecionada (`filterEquipe` não vazio) — nunca para "Todas as equipes".
- Limite de segurança: no máximo **60 OS** (`MAX_GEOCODE_OS`) geocodificadas por seleção; excedente não é geocodificado, e a UI avisa quantas ficaram de fora (nunca esconde).
- Intervalo de **1100ms** entre chamadas de rede ao Nominatim (política de uso: máx. 1 req/s). Endereços em cache não entram nessa fila e não têm delay.
- Cache em `localStorage`, chave `cabonnet:geocode-cache`, por endereço normalizado (trim + uppercase) — leitura/escrita nunca lançam exceção; falha vira `console.warn` e segue com cache vazio/em memória.
- Endereço sem `logradouro`/`enderecoconexao` E sem `cidade` não entra na fila de geocodificação — vai direto para o fallback de bairro.
- Falha de geocodificação (sem resultado ou erro de rede) nunca é cacheada — cai para o fallback de bairro naquela mesma tentativa, sem lançar.
- Pontos aproximados (fallback de bairro) têm indicação visual diferente dos pontos reais (borda tracejada) — nunca aparentam ser endereço exato.
- Nenhuma mudança em `AddressSearchPanel`, no cálculo de proximidade por endereço, ou nos toggles de granularidade/visualização (Cidade/Bairro/Calor/Bolhas) — eles continuam visíveis e funcionais quando "Todas as equipes" está selecionado; quando uma equipe está selecionada eles só ficam sem efeito (não precisam ser desabilitados visualmente).
- `npm run build` e `npm run lint` devem ficar limpos antes de qualquer commit tocando `.tsx`/`.ts`.

---

### Task 1: `getBairroCoords` extraído e reutilizado em `aggregateByBairro`

**Files:**
- Modify: `src/features/mapa/geo.ts`
- Test: `src/features/mapa/geo.test.ts` (arquivo já existe, com testes de `buildEquipeOptions` — adicionar novos `describe` blocks, não remover os existentes)

**Interfaces:**
- Produces: `getBairroCoords(cidade: string, bairro: string): { lat: number; lng: number } | null` — exportado de `geo.ts`. Retorna `null` quando a cidade não está em `CITY_COORDS` (via `getCityCoords`); caso contrário retorna as coordenadas da cidade deslocadas deterministicamente pelo bairro (mesma matemática que já existia dentro de `aggregateByBairro`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/mapa/geo.test.ts` (mantendo os `describe` de `buildEquipeOptions` já existentes no arquivo):

```typescript
import { aggregateByBairro, getBairroCoords } from './geo'
```

(ajustar o import do topo do arquivo, que hoje é `import { buildEquipeOptions } from './geo'`, para incluir os dois nomes acima).

```typescript
describe('getBairroCoords', () => {
  it('retorna null quando a cidade não é conhecida', () => {
    expect(getBairroCoords('CIDADE INEXISTENTE', 'CENTRO')).toBeNull()
  })

  it('retorna coordenadas deslocadas do centro da cidade, deterministicamente', () => {
    const a = getBairroCoords('TAUBATE', 'CENTRO')
    const b = getBairroCoords('TAUBATE', 'CENTRO')
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
  })

  it('bairros diferentes na mesma cidade produzem coordenadas diferentes', () => {
    const a = getBairroCoords('TAUBATE', 'CENTRO')
    const b = getBairroCoords('TAUBATE', 'JARDIM AMERICA')
    expect(a).not.toEqual(b)
  })
})

describe('aggregateByBairro — coordenadas vêm de getBairroCoords', () => {
  it('as coordenadas do bairro batem com getBairroCoords', () => {
    const rows = [makeOS({ numos: 'A', nomedacidade: 'TAUBATE', bairro: 'CENTRO' })]
    const [agg] = aggregateByBairro(rows)
    expect(agg.coords).toEqual(getBairroCoords('TAUBATE', 'CENTRO'))
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/features/mapa/geo.test.ts`
Expected: FAIL — `getBairroCoords` não existe em `./geo` (erro de import/undefined).

- [ ] **Step 3: Extrair `getBairroCoords` e refatorar `aggregateByBairro`**

Em `src/features/mapa/geo.ts`, o bloco atual (função `bairroOffset` seguida de `aggregateByBairro`) é:

```typescript
// Offset determinístico: espalha bairros ao redor do centro da cidade em
// posições consistentes (ângulo e raio derivados do nome, sem geocoding externo).
function bairroOffset(bairro: string): { dlat: number; dlng: number } {
  let h = 2166136261
  for (let i = 0; i < bairro.length; i++) h = Math.imul(h ^ bairro.charCodeAt(i), 16777619)
  const angle = (h >>> 0) % 360 * (Math.PI / 180)
  const dist  = 0.006 + ((h >>> 0) % 800) / 80000   // ~700m a 1.7km do centro
  return { dlat: Math.sin(angle) * dist, dlng: Math.cos(angle) * dist }
}

export function aggregateByBairro(rows: OSRow[]): BairroAgg[] {
  type Acc = {
    bairro: string; cidade: string; cityCoords: { lat: number; lng: number }
    count: number; criticos: number; excedidos: number; pendentes: number
    semEquipe: number; aging: number[]
  }
  const map = new Map<string, Acc>()

  for (const r of rows) {
    const city   = normalize(r.nomedacidade)
    const bairro = (r.bairro || '').trim()
    if (!city || !bairro) continue
    const cityCoords = getCityCoords(city)
    if (!cityCoords) continue

    const key = `${city}::${normalize(bairro)}`
    if (!map.has(key)) {
      map.set(key, {
        bairro, cidade: (r.nomedacidade || '').trim(), cityCoords,
        count: 0, criticos: 0, excedidos: 0, pendentes: 0, semEquipe: 0, aging: [],
      })
    }
    const g = map.get(key)!
    g.count++
    if (r._slaCritico)        g.criticos++
    else if (r._slaExcedido)  g.excedidos++
    if (r._situacaoEfetiva === 'Pendente' || r._situacaoEfetiva === 'Atendimento') g.pendentes++
    if (!r.nomedaequipe?.trim()) g.semEquipe++
    if (r._aging != null) g.aging.push(r._aging)
  }

  return Array.from(map.values())
    .filter(g => g.count > 0)
    .map(g => {
      const { dlat, dlng } = bairroOffset(normalize(g.bairro))
      const avgAging = g.aging.length
        ? g.aging.reduce((a, b) => a + b, 0) / g.aging.length : 0
      return {
        bairro: g.bairro, cidade: g.cidade,
        count: g.count, criticos: g.criticos, excedidos: g.excedidos,
        pendentes: g.pendentes, semEquipe: g.semEquipe, avgAging,
        coords: { lat: g.cityCoords.lat + dlat, lng: g.cityCoords.lng + dlng },
      }
    })
    .sort((a, b) => b.count - a.count)
}
```

Trocar por:

```typescript
// Offset determinístico: espalha bairros ao redor do centro da cidade em
// posições consistentes (ângulo e raio derivados do nome, sem geocoding externo).
function bairroOffset(bairro: string): { dlat: number; dlng: number } {
  let h = 2166136261
  for (let i = 0; i < bairro.length; i++) h = Math.imul(h ^ bairro.charCodeAt(i), 16777619)
  const angle = (h >>> 0) % 360 * (Math.PI / 180)
  const dist  = 0.006 + ((h >>> 0) % 800) / 80000   // ~700m a 1.7km do centro
  return { dlat: Math.sin(angle) * dist, dlng: Math.cos(angle) * dist }
}

export function getBairroCoords(cidade: string, bairro: string): { lat: number; lng: number } | null {
  const cityCoords = getCityCoords(cidade)
  if (!cityCoords) return null
  const { dlat, dlng } = bairroOffset(normalize(bairro))
  return { lat: cityCoords.lat + dlat, lng: cityCoords.lng + dlng }
}

export function aggregateByBairro(rows: OSRow[]): BairroAgg[] {
  type Acc = {
    bairro: string; cidade: string
    count: number; criticos: number; excedidos: number; pendentes: number
    semEquipe: number; aging: number[]
  }
  const map = new Map<string, Acc>()

  for (const r of rows) {
    const city   = normalize(r.nomedacidade)
    const bairro = (r.bairro || '').trim()
    if (!city || !bairro) continue
    if (!getCityCoords(city)) continue

    const key = `${city}::${normalize(bairro)}`
    if (!map.has(key)) {
      map.set(key, {
        bairro, cidade: (r.nomedacidade || '').trim(),
        count: 0, criticos: 0, excedidos: 0, pendentes: 0, semEquipe: 0, aging: [],
      })
    }
    const g = map.get(key)!
    g.count++
    if (r._slaCritico)        g.criticos++
    else if (r._slaExcedido)  g.excedidos++
    if (r._situacaoEfetiva === 'Pendente' || r._situacaoEfetiva === 'Atendimento') g.pendentes++
    if (!r.nomedaequipe?.trim()) g.semEquipe++
    if (r._aging != null) g.aging.push(r._aging)
  }

  return Array.from(map.values())
    .filter(g => g.count > 0)
    .map(g => {
      const coords = getBairroCoords(g.cidade, g.bairro)!
      const avgAging = g.aging.length
        ? g.aging.reduce((a, b) => a + b, 0) / g.aging.length : 0
      return {
        bairro: g.bairro, cidade: g.cidade,
        count: g.count, criticos: g.criticos, excedidos: g.excedidos,
        pendentes: g.pendentes, semEquipe: g.semEquipe, avgAging,
        coords,
      }
    })
    .sort((a, b) => b.count - a.count)
}
```

(A `map` de `Acc` perde o campo `cityCoords`, que não é mais necessário — a checagem `if (!getCityCoords(city)) continue` substitui o guard anterior, e o cálculo final de coordenadas passa a vir de `getBairroCoords`.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/features/mapa/geo.test.ts`
Expected: PASS — todos os testes do arquivo (os já existentes de `buildEquipeOptions` + os novos) passando.

Run: `npm test` (suíte completa)
Expected: PASS — nenhuma regressão em outros arquivos que dependem de `aggregateByBairro` (ex.: `MapaPage.tsx`, não coberto por teste automatizado, mas nenhum teste existente quebra).

- [ ] **Step 5: Commit**

```bash
git add src/features/mapa/geo.ts src/features/mapa/geo.test.ts
git commit -m "refactor(mapa): extrai getBairroCoords de aggregateByBairro"
```

---

### Task 2: Hook `useGeocodedEquipeOS` (geocodificação com cache, fila e limite)

**Files:**
- Create: `src/features/mapa/useGeocodedEquipeOS.ts`
- Test: `src/features/mapa/useGeocodedEquipeOS.test.ts`

**Interfaces:**
- Consumes: `getBairroCoords(cidade: string, bairro: string): { lat: number; lng: number } | null` (Task 1, `./geo`); `geocodeAddress(query: string): Promise<GeocodeResult[]>` (já existe em `./searchAddress`, onde `GeocodeResult` tem `{ lat: number; lng: number; label: string; bairro: string | null; cidade: string | null }`).
- Produces (usados pela Task 3):
  - `MAX_GEOCODE_OS: number` (constante, valor `60`)
  - `interface GeocodedOSPoint { os: OSRow; lat: number; lng: number; approx: boolean }`
  - `interface UseGeocodedEquipeOSResult { points: GeocodedOSPoint[]; resolved: number; total: number; capped: boolean }`
  - `useGeocodedEquipeOS(rows: OSRow[], active: boolean, options?: { delayMs?: number }): UseGeocodedEquipeOSResult`
  - `buildOSAddress(os: OSRow): string | null` e `normalizeAddressKey(address: string): string` — exportados para os testes, mas também podem ser usados por outras partes do módulo no futuro.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/mapa/useGeocodedEquipeOS.test.ts`:

```typescript
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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/features/mapa/useGeocodedEquipeOS.test.ts`
Expected: FAIL — `./useGeocodedEquipeOS` não existe.

- [ ] **Step 3: Implementar o hook**

Criar `src/features/mapa/useGeocodedEquipeOS.ts`:

```typescript
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
  }, [signature, active, delayMs])

  return { points, resolved: resolvedCount, total, capped }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/features/mapa/useGeocodedEquipeOS.test.ts`
Expected: PASS — todos os testes (13 no total: 3 `buildOSAddress`, 1 `normalizeAddressKey`, 2 `loadGeocodeCache/saveGeocodeCache`, 7 `useGeocodedEquipeOS`).

Run: `npm test` (suíte completa)
Expected: PASS — sem regressão em outros arquivos.

- [ ] **Step 5: Commit**

```bash
git add src/features/mapa/useGeocodedEquipeOS.ts src/features/mapa/useGeocodedEquipeOS.test.ts
git commit -m "feat(mapa): hook useGeocodedEquipeOS com cache, fila e limite de geocodificacao"
```

---

### Task 3: Wiring na UI — pontos individuais no Mapa

**Files:**
- Modify: `src/features/mapa/MapaComponents.tsx` (import de `Loader2`, nova função `osPointColor`, novo componente `EquipeGeocodeStatus`)
- Modify: `src/features/mapa/MapaPage.tsx` (novo hook chamado, troca condicional heatmap/bolhas ↔ pontos individuais, badge de progresso)

**Interfaces:**
- Consumes: `useGeocodedEquipeOS(rows, active, options?)` da Task 2 (`./useGeocodedEquipeOS`), retornando `{ points: GeocodedOSPoint[]; resolved: number; total: number; capped: boolean }` onde cada `GeocodedOSPoint` é `{ os: OSRow; lat: number; lng: number; approx: boolean }`.
- Produces: nenhuma interface pública nova além do componente `EquipeGeocodeStatus` (usado só dentro de `MapaPage.tsx`).

- [ ] **Step 1: `MapaComponents.tsx` — importar `Loader2`**

Em `src/features/mapa/MapaComponents.tsx:3-5`, o bloco atual é:

```typescript
import {
  TrendingUp, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, MapPin as PinIcon,
} from 'lucide-react'
```

Trocar por:

```typescript
import {
  TrendingUp, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, MapPin as PinIcon, Loader2,
} from 'lucide-react'
```

- [ ] **Step 2: `MapaComponents.tsx` — adicionar `osPointColor`**

Logo após a função `bubbleColor` (que termina em `src/features/mapa/MapaComponents.tsx` com `return { fill: '#4ade80', stroke: '#86efac' }` seguido de `}`), adicionar:

```typescript
// ── Cor de um ponto individual de OS (mesma paleta de bubbleColor, por linha) ─
export function osPointColor(os: OSRow): { fill: string; stroke: string } {
  if (os._slaCritico)  return { fill: '#f87171', stroke: '#fca5a5' }
  if (os._slaExcedido) return { fill: '#f97316', stroke: '#fdba74' }
  const sit = os._situacaoEfetiva ?? os.descsituacao
  if (sit === 'Pendente' || sit === 'Atendimento') return { fill: '#3b82f6', stroke: '#7dd3fc' }
  return { fill: '#4ade80', stroke: '#86efac' }
}
```

- [ ] **Step 3: `MapaComponents.tsx` — adicionar `EquipeGeocodeStatus`**

Logo após a função `Stat` (que termina com o `export function Stat(...) { ... }` fechando), adicionar:

```typescript
// ── Status de geocodificação da equipe selecionada ────────────────────────────
export function EquipeGeocodeStatus({ resolved, total, capped, totalEquipe }: {
  resolved:    number
  total:       number
  capped:      boolean
  totalEquipe: number
}) {
  if (total === 0) return null
  const done = resolved >= total
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500]">
      <div className="flex items-center gap-2 bg-elevated/90 backdrop-blur-md border border-white/[0.08]
                       rounded-full px-3.5 py-1.5 shadow-2xl">
        {!done && <Loader2 size={11} className="animate-spin text-primary" />}
        <span className="text-caption font-semibold text-secondary">
          {done ? `${total} OS localizadas` : `Localizando ${resolved}/${total}…`}
        </span>
        {capped && (
          <span className="text-caption text-yellow font-semibold">
            · {total} de {totalEquipe} — refine por Status/Tipo/Aging
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `MapaPage.tsx` — importar o hook e os novos componentes**

Em `src/features/mapa/MapaPage.tsx:8`, trocar:

```typescript
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, buildEquipeOptions, type BairroAgg } from './geo'
```

por (sem outra mudança nessa linha):

```typescript
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, buildEquipeOptions, type BairroAgg } from './geo'
import { useGeocodedEquipeOS } from './useGeocodedEquipeOS'
```

Em `src/features/mapa/MapaPage.tsx:15-20`, o bloco atual é:

```typescript
import {
  MapResizer, FlyTo, HeatLayer, bubbleRadius, CidadePanel, AddressSearchPanel,
  RankingPanel, BairroRankingPanel, BairroPanel,
  PROXIMIDADE_KM, searchPinIcon, execucaoIcon,
  type CidadeAgg, type ProximidadeInfo, type BairroProx,
} from './MapaComponents'
```

Trocar por:

```typescript
import {
  MapResizer, FlyTo, HeatLayer, bubbleRadius, CidadePanel, AddressSearchPanel,
  RankingPanel, BairroRankingPanel, BairroPanel,
  PROXIMIDADE_KM, searchPinIcon, execucaoIcon,
  osPointColor, EquipeGeocodeStatus,
  type CidadeAgg, type ProximidadeInfo, type BairroProx,
} from './MapaComponents'
```

- [ ] **Step 5: `MapaPage.tsx` — chamar o hook**

Em `src/features/mapa/MapaPage.tsx:108-111`, logo após o bloco:

```typescript
  const equipeOpts = useMemo(() => [
    { value: '', label: 'Todas as equipes' },
    ...buildEquipeOptions(globalRows || []),
  ], [globalRows])
```

adicionar:

```typescript

  const equipeGeo = useGeocodedEquipeOS(rows, !!filterEquipe)
```

- [ ] **Step 6: `MapaPage.tsx` — condicionar heatmap e bolhas, adicionar pontos individuais**

Em `src/features/mapa/MapaPage.tsx:345-348`, o bloco atual é:

```typescript
          {/* Heatmap layer */}
          {(view === 'calor' || view === 'ambos') && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints as [number, number, number][]} />
          )}
```

Trocar por:

```typescript
          {/* Heatmap layer */}
          {!filterEquipe && (view === 'calor' || view === 'ambos') && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints as [number, number, number][]} />
          )}
```

Em `src/features/mapa/MapaPage.tsx:350-351`, o bloco atual é:

```typescript
          {/* Bubble markers */}
          {(view === 'bolhas' || view === 'ambos') && markers.map(g => {
```

Trocar por:

```typescript
          {/* Bubble markers */}
          {!filterEquipe && (view === 'bolhas' || view === 'ambos') && markers.map(g => {
```

Logo após o fechamento desse bloco de `markers.map(...)` (linha `397` no arquivo atual: `})}`, antes do comentário `{/* Resultado da busca de endereço */}` que vem em seguida), adicionar:

```typescript

          {/* Pontos individuais de OS da equipe selecionada */}
          {filterEquipe && equipeGeo.points.map(({ os, lat, lng, approx }) => {
            const { fill, stroke } = osPointColor(os)
            const enderecoconexao = typeof os.enderecoconexao === 'string' ? os.enderecoconexao : ''
            const address = [os.logradouro || enderecoconexao, os.numero].filter(Boolean).join(', ')
            const sit = os._situacaoEfetiva ?? os.descsituacao

            return (
              <CircleMarker
                key={os.numos}
                center={[lat, lng]}
                radius={9}
                pathOptions={{
                  fillColor: fill, fillOpacity: 0.75,
                  color: stroke, weight: 2, opacity: 0.95,
                  dashArray: approx ? '3 3' : undefined,
                }}
                eventHandlers={{ click: () => setDrawerOS(os) }}
              >
                <Tooltip direction="top" offset={[0, -12]} className="map-tooltip">
                  <span className="font-semibold">{os.nomecliente || `OS ${os.numos}`}</span>
                  {address && <span className="block text-caption">{address}</span>}
                  <span className="block text-caption">{sit} · {os._aging ?? 0}d{approx ? ' · aprox.' : ''}</span>
                </Tooltip>
              </CircleMarker>
            )
          })}
```

- [ ] **Step 7: `MapaPage.tsx` — badge de progresso da geocodificação**

Em `src/features/mapa/MapaPage.tsx`, logo após o fechamento de `</MapContainer>` (linha `434` no arquivo atual) e antes do comentário `{/* Resultado da busca de endereço */}` seguinte (linha `436`), adicionar:

```typescript

        {/* Progresso da geocodificação da equipe selecionada */}
        {filterEquipe && (
          <EquipeGeocodeStatus
            resolved={equipeGeo.resolved}
            total={equipeGeo.total}
            capped={equipeGeo.capped}
            totalEquipe={rows.length}
          />
        )}
```

- [ ] **Step 8: Checagem de tipos, lint e testes**

Run: `npm run build`
Expected: build sem erros de TypeScript.

Run: `npm run lint`
Expected: 0 erros (warnings pré-existentes, como o de `react-hooks/exhaustive-deps` em `DataTable.tsx`, são aceitáveis — não falham o comando).

Run: `npm test`
Expected: todos os testes passando, incluindo os das Tasks 1 e 2.

- [ ] **Step 9: Verificação manual no navegador**

Run: `npm run dev`

No navegador (`http://localhost:3000/mapa`):
1. Selecionar uma equipe com OS ativas no filtro "Equipe" — confirmar que o heatmap/bolhas somem e que pontos individuais aparecem (badge "Localizando X/Y…" no topo, depois "N OS localizadas").
2. Passar o mouse num ponto — confirmar tooltip com cliente, endereço, status e aging.
3. Clicar num ponto — confirmar que o `OSDrawer` abre com os detalhes completos da OS.
4. Voltar para "Todas as equipes" — confirmar que o mapa volta ao heatmap/bolhas normal e a badge de progresso some.
5. Selecionar uma equipe cuja fila tenha mais de 60 OS ativas (se existir) — confirmar que a badge mostra "60 de N — refine por Status/Tipo/Aging". Se nenhuma equipe tiver fila tão grande, pular esta checagem e registrar como não verificado.

- [ ] **Step 10: Commit**

```bash
git add src/features/mapa/MapaComponents.tsx src/features/mapa/MapaPage.tsx
git commit -m "feat(mapa): pontos individuais de OS por equipe, com endereco real geocodificado"
```

---

## Self-Review Notes

- **Cobertura da spec:** geocodificação com cache/fila/limite → Task 2. `getBairroCoords` extraído e reutilizado → Task 1. Troca automática heatmap/bolhas ↔ pontos, tooltip, clique→drawer, badge de progresso → Task 3. Fallback aproximado com `dashArray` → Task 3 Step 6. Cap de 60 com aviso → Task 2 (lógica) + Task 3 (exibição via `EquipeGeocodeStatus`).
- **Sem placeholders:** todos os steps têm código completo, nenhum "TODO"/"implementar depois".
- **Consistência de tipos:** `GeocodedOSPoint` (Task 2) é consumido em Task 3 exatamente com os campos `os`, `lat`, `lng`, `approx`; `UseGeocodedEquipeOSResult` (`points`, `resolved`, `total`, `capped`) usado sem divergência de nomes em `EquipeGeocodeStatus`/JSX da Task 3.
- **Ordem de dependência:** Task 1 (getBairroCoords) → Task 2 (hook consome getBairroCoords) → Task 3 (UI consome o hook). Cada task só depende da anterior, nunca da seguinte.
