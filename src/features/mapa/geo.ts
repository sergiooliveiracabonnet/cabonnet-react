import type { OSRow } from '../../lib/types'

// Coordenadas das cidades da Cabonnet ISP — Vale do Paraíba / SP
// Cidades atendidas: SJC, Caçapava, Taubaté, Tremembé, Pindamonhangaba
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // ── Cobertura principal ──────────────────────────────────────────────────
  'SAO JOSE DOS CAMPOS':        { lat: -23.1894, lng: -45.8837 },
  'CACAPAVA':                   { lat: -23.0998, lng: -45.7021 },
  'TAUBATE':                    { lat: -23.0256, lng: -45.5553 },
  'TREMEMBE':                   { lat: -22.9669, lng: -45.5514 },
  'PINDAMONHANGABA':            { lat: -22.9249, lng: -45.4613 },
  // ── Municípios vizinhos (fallback) ───────────────────────────────────────
  'JACAREI':                    { lat: -23.3049, lng: -45.9658 },
  'GUARATINGUETA':              { lat: -22.8164, lng: -45.1939 },
  'LORENA':                     { lat: -22.7319, lng: -45.1261 },
  'APARECIDA':                  { lat: -22.8478, lng: -45.2306 },
  'ROSEIRA':                    { lat: -22.8932, lng: -45.3168 },
  'POTIM':                      { lat: -22.8214, lng: -45.1849 },
  'CAMPOS DO JORDAO':           { lat: -22.7395, lng: -45.5916 },
  'SAO BENTO DO SAPUCAI':       { lat: -22.6898, lng: -45.7330 },
  'PIQUETE':                    { lat: -22.6152, lng: -45.1812 },
  'CRUZEIRO':                   { lat: -22.5779, lng: -44.9642 },
  'LAVRINHAS':                  { lat: -22.5684, lng: -44.9011 },
  'SAO LUIS DO PARAITINGA':     { lat: -23.2215, lng: -45.3122 },
  'SANTA BRANCA':               { lat: -23.3983, lng: -45.8797 },
  'MONTEIRO LOBATO':            { lat: -23.0895, lng: -45.8374 },
  'REDENCAO DA SERRA':          { lat: -23.2617, lng: -45.5426 },
  'PARAIBUNA':                  { lat: -23.3810, lng: -45.6626 },
  'NATIVIDADE DA SERRA':        { lat: -23.3756, lng: -45.4480 },
  'UBATUBA':                    { lat: -23.4337, lng: -45.0713 },
  'CARAGUATATUBA':              { lat: -23.6204, lng: -45.4118 },
  'SAO SEBASTIAO':              { lat: -23.7966, lng: -45.4003 },
  'ILHABELA':                   { lat: -23.7776, lng: -45.3581 },
  'BANANAL':                    { lat: -22.6836, lng: -44.3269 },
  'SAO JOSE DO BARREIRO':       { lat: -22.6444, lng: -44.5758 },
  'AREIAS':                     { lat: -22.5793, lng: -44.7009 },
  'QUELUZ':                     { lat: -22.5418, lng: -44.7720 },
  'SILVEIRAS':                  { lat: -22.6660, lng: -44.8575 },
  'CUNHA':                      { lat: -23.0728, lng: -44.9513 },
  'LAGOINHA':                   { lat: -22.9667, lng: -45.1849 },
  'CACHOEIRA PAULISTA':         { lat: -22.6818, lng: -45.0033 },
  'CANAS':                      { lat: -22.7027, lng: -45.0756 },
  'ARAPEÍ':                     { lat: -22.6635, lng: -44.4667 },
  'REDENÇÃO DA SERRA':          { lat: -23.2617, lng: -45.5426 },
}

function normalize(s: string | null | undefined): string {
  return (s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function getCityCoords(cidade: string): { lat: number; lng: number } | null {
  return CITY_COORDS[normalize(cidade)] ?? null
}

export function aggregateByCidade(rows: OSRow[]) {
  const map = new Map<string, { cidade: string; count: number; criticos: number; excedidos: number; pendentes: number; concluidas: number; semEquipe: number; aging: number[]; bairros: Map<string, { bairro: string; count: number; criticos: number }> }>()
  for (const r of rows) {
    const city = normalize(r.nomedacidade)
    if (!city) continue
    if (!map.has(city)) {
      map.set(city, {
        cidade: r.nomedacidade?.trim() || city,
        count: 0, criticos: 0, excedidos: 0, pendentes: 0,
        concluidas: 0, semEquipe: 0, aging: [], bairros: new Map(),
      })
    }
    const g = map.get(city)!
    g.count++
    if (r._slaCritico)     g.criticos++
    else if (r._slaExcedido) g.excedidos++
    if (r._situacaoEfetiva === 'Concluída') g.concluidas++
    else if (r._situacaoEfetiva === 'Pendente' || r._situacaoEfetiva === 'Atendimento') g.pendentes++
    if (!r.nomedaequipe?.trim()) g.semEquipe++
    if (r._aging != null) g.aging.push(r._aging)

    const bairro = (r.bairro || '').trim().toUpperCase()
    if (bairro) {
      const b = g.bairros.get(bairro) || { bairro: r.bairro, count: 0, criticos: 0 }
      b.count++
      if (r._slaCritico) b.criticos++
      g.bairros.set(bairro, b)
    }
  }

  return Array.from(map.values())
    .map(g => {
      const coords   = getCityCoords(g.cidade)
      const avgAging = g.aging.length
        ? g.aging.reduce((a: number, b: number) => a + b, 0) / g.aging.length
        : 0
      const topBairros = Array.from(g.bairros.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
      return { ...g, coords, avgAging, topBairros, bairros: undefined }
    })
    .filter((g): g is typeof g & { coords: { lat: number; lng: number } } => g.coords !== null)
    .sort((a, b) => b.count - a.count)
}

// Gera pontos para o heatmap — cada OS contribui com 1 ponto ponderado
// na coordenada da cidade, com peso baseado em criticidade e aging
// ── Agrupamento por bairro ────────────────────────────────────────────────────

export interface BairroAgg {
  bairro:    string
  cidade:    string
  count:     number
  criticos:  number
  excedidos: number
  pendentes: number
  semEquipe: number
  avgAging:  number
  coords:    { lat: number; lng: number }
}

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

export function buildHeatPoints(rows: OSRow[]): [number, number, number][] {
  const byCity = new Map<string, { coords: { lat: number; lng: number }; weight: number }>()
  for (const r of rows) {
    const city   = normalize(r.nomedacidade)
    const coords = getCityCoords(city)
    if (!coords) continue
    if (!byCity.has(city)) byCity.set(city, { coords, weight: 0 })
    const w = r._slaCritico ? 3 : r._slaExcedido ? 2 : 1
    byCity.get(city)!.weight += w
  }
  return Array.from(byCity.values()).map(({ coords, weight }) => [
    coords.lat, coords.lng, weight,
  ])
}
