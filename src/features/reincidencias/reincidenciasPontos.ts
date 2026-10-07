import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'

// O app de campo grava no texto da execução o GPS do técnico quando a visita começa:
//   "LOCALIZAÇÃO  Latitude Inicio: -22.98465  Longitude Inicio: -45.5419971 ..."
// É o endereço do cliente, não o centro da cidade — por isso dá para ver rua e bairro.
const GPS_INICIO = /Latitude\s+In[ií]cio:\s*(-?\d{1,3}(?:[.,]\d+)?)[\s\S]{0,60}?Longitude\s+In[ií]cio:\s*(-?\d{1,3}(?:[.,]\d+)?)/i

// Caixa que cobre o Vale do Paraíba com folga. Fora dela é GPS ruim (0,0, trocado, sem sinal).
const LIMITES = { latMin: -24.2, latMax: -22.2, lngMin: -46.6, lngMax: -44.8 }

export interface Coordenada { lat: number; lng: number }

export function extrairCoordenadas(texto: string | null | undefined): Coordenada | null {
  const m = GPS_INICIO.exec(String(texto ?? ''))
  if (!m) return null
  const lat = Number(m[1].replace(',', '.')), lng = Number(m[2].replace(',', '.'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < LIMITES.latMin || lat > LIMITES.latMax || lng < LIMITES.lngMin || lng > LIMITES.lngMax) return null
  return { lat, lng }
}

export interface PontoRevisita extends Coordenada {
  numos: string
  /** Chave do cliente (ClienteReincidente.chave) — liga o ponto ao bairro e ao cliente. */
  clienteChave: string
}

export interface CoberturaMapa { comLocalizacao: number; total: number }

/** Um ponto por OS envolvida com GPS — a mesma contagem de "OS envolvidas" da tela. */
export function pontosDasRevisitas(clientes: ClienteReincidente[]): { pontos: PontoRevisita[]; cobertura: CoberturaMapa } {
  const pontos: PontoRevisita[] = []
  let total = 0
  for (const cliente of clientes) {
    for (const row of cliente.rows as OSRow[]) {
      total++
      const c = extrairCoordenadas(String(row.observacoes || row.observacaocritica || ''))
      if (c) pontos.push({ ...c, numos: row.numos, clienteChave: cliente.chave })
    }
  }
  return { pontos, cobertura: { comLocalizacao: pontos.length, total } }
}

export interface PontoQuente extends Coordenada {
  /** OS nesta célula: o "calor". */
  n: number
  clientes: string[]
  numos: string[]
}

/** Grade de ~170 m: junta as OS do mesmo quarteirão/rua em um ponto com peso. O centro de
 *  cada ponto é a média das coordenadas reais, não o canto da célula. */
export const CELULA_GRAUS = 0.0015

export function agruparPorCelula(pontos: PontoRevisita[], celula = CELULA_GRAUS): PontoQuente[] {
  const celulas = new Map<string, { soma: Coordenada; itens: PontoRevisita[] }>()
  for (const p of pontos) {
    const chave = `${Math.floor(p.lat / celula)}:${Math.floor(p.lng / celula)}`
    const c = celulas.get(chave) ?? { soma: { lat: 0, lng: 0 }, itens: [] }
    c.soma.lat += p.lat; c.soma.lng += p.lng; c.itens.push(p)
    celulas.set(chave, c)
  }
  return [...celulas.values()].map(({ soma, itens }) => ({
    lat: soma.lat / itens.length, lng: soma.lng / itens.length,
    n: itens.length,
    clientes: [...new Set(itens.map(i => i.clienteChave))],
    numos: itens.map(i => i.numos),
  })).sort((a, b) => b.n - a.n || b.clientes.length - a.clientes.length)
}

/** Pontos para a camada de calor: [lat, lng, peso]. */
export const paraCamadaDeCalor = (quentes: PontoQuente[]): Array<[number, number, number]> => quentes.map(q => [q.lat, q.lng, q.n])

/** A caixa que enquadra todos os pontos, com a vista padrão do Vale se não houver nenhum. */
export function limitesDosPontos(pontos: Coordenada[]): [[number, number], [number, number]] {
  if (!pontos.length) return [[-23.35, -46.0], [-22.8, -45.3]]
  const lats = pontos.map(p => p.lat), lngs = pontos.map(p => p.lng)
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
}

/** Bairro mais frequente entre os clientes de um ponto quente (para abrir o modal certo). */
export function bairroDominante(clientes: string[], bairroDoCliente: Map<string, string>): string | null {
  const contagem = new Map<string, number>()
  for (const chave of clientes) {
    const b = bairroDoCliente.get(chave)
    if (b) contagem.set(b, (contagem.get(b) ?? 0) + 1)
  }
  return [...contagem].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
