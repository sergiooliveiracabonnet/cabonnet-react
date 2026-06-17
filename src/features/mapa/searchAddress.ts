// Geocodificação de endereço (Nominatim/OpenStreetMap) + cálculo de proximidade.
// Sem chave de API — uso pontual (busca explícita do usuário, não autocomplete).

export interface GeocodeResult {
  lat:    number
  lng:    number
  label:  string
  bairro: string | null
  cidade: string | null
}

// Bbox aproximado do Vale do Paraíba (SP) — usado só como viés de relevância,
// não restringe resultados fora da região (bounded=0).
const VALE_PARAIBA_VIEWBOX = '-46.3,-22.4,-44.7,-23.9'

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (!q) return []

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('viewbox', VALE_PARAIBA_VIEWBOX)
  url.searchParams.set('bounded', '0')
  url.searchParams.set('q', q)

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Falha ao consultar geocodificação')

  const data = await res.json() as Array<{
    lat: string; lon: string; display_name: string
    address?: Record<string, string>
  }>

  return data.map(d => ({
    lat:    parseFloat(d.lat),
    lng:    parseFloat(d.lon),
    label:  d.display_name,
    bairro: d.address?.suburb ?? d.address?.neighbourhood ?? d.address?.city_district ?? null,
    cidade: d.address?.city ?? d.address?.town ?? d.address?.municipality ?? null,
  }))
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
