import { useState, useMemo, useEffect } from 'react'
import { useMap } from 'react-leaflet'
import {
  TrendingUp, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, MapPin as PinIcon, Loader2,
} from 'lucide-react'
import L from 'leaflet'
import type { BairroAgg } from './geo'
import type { GeocodeResult } from './searchAddress'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'

export const PROXIMIDADE_KM = 3

export const searchPinIcon = L.divIcon({
  className: 'address-search-pin',
  html: `<div style="
    width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:#22d3ee;border:2px solid #0d1117;box-shadow:0 2px 8px rgba(0,0,0,.5);
  "></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

export const execucaoIcon = L.divIcon({
  className: 'execucao-pin',
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    background:#facc15;border:2px solid #0d1117;box-shadow:0 2px 6px rgba(0,0,0,.5);
    display:flex;align-items:center;justify-content:center;
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

// Tipo do objeto retornado por aggregateByCidade
export interface CidadeAgg {
  cidade:     string
  count:      number
  criticos:   number
  excedidos:  number
  pendentes:  number
  semEquipe:  number
  avgAging:   number
  coords:     { lat: number; lng: number }
  topBairros: { bairro: string; count: number; criticos: number }[]
}

// ── Força o Leaflet a recalcular tamanho após montagem lazy ──────────────────
export function MapResizer() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(t)
  }, [map])
  return null
}

// ── Voa para um ponto buscado (resultado de geocodificação) ──────────────────
export function FlyTo({ point }: { point: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], 14, { duration: 0.8 })
  }, [map, point])
  return null
}

// ── Heatmap layer — implementação nativa sem leaflet.heat ─────────────────────
// Cada ponto recebe 3 círculos concêntricos semi-transparentes (bloom effect),
// coloridos de acordo com a intensidade relativa ao máximo da fila.
export function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const maxWeight = Math.max(...points.map(p => p[2]), 1)
    const layers: L.CircleMarker[] = []

    for (const [lat, lng, weight] of points) {
      const t = weight / maxWeight
      const color = t > 0.65 ? '#f87171' : t > 0.4 ? '#f97316' : t > 0.15 ? '#a855f7' : '#3b82f6'
      const opts = (radius: number, opacity: number) => ({
        radius, fillColor: color, fillOpacity: opacity * t,
        stroke: false, interactive: false,
      } as L.CircleMarkerOptions)

      layers.push(
        L.circleMarker([lat, lng] as L.LatLngExpression, opts(62, 0.06)).addTo(map),
        L.circleMarker([lat, lng] as L.LatLngExpression, opts(38, 0.13)).addTo(map),
        L.circleMarker([lat, lng] as L.LatLngExpression, opts(20, 0.28)).addTo(map),
      )
    }
    return () => layers.forEach(l => map.removeLayer(l))
  }, [map, points])
  return null
}

// ── Cores por criticidade ─────────────────────────────────────────────────────
export function bubbleColor(g: CidadeAgg): { fill: string; stroke: string } {
  if (g.criticos  > 0)  return { fill: '#f87171', stroke: '#fca5a5' }
  if (g.excedidos > 0)  return { fill: '#f97316', stroke: '#fdba74' }
  if (g.pendentes > 0)  return { fill: '#3b82f6', stroke: '#7dd3fc' }
  return                       { fill: '#4ade80', stroke: '#86efac' }
}

// ── Cor de um ponto individual de OS (mesma paleta de bubbleColor, por linha) ─
export function osPointColor(os: OSRow): { fill: string; stroke: string } {
  if (os._slaCritico)  return { fill: '#f87171', stroke: '#fca5a5' }
  if (os._slaExcedido) return { fill: '#f97316', stroke: '#fdba74' }
  const sit = os._situacaoEfetiva ?? os.descsituacao
  if (sit === 'Pendente' || sit === 'Atendimento') return { fill: '#3b82f6', stroke: '#7dd3fc' }
  return { fill: '#4ade80', stroke: '#86efac' }
}

// ── Radius proporcional à raiz quadrada do count ──────────────────────────────
export const bubbleRadius = (count: number): number => Math.max(10, Math.min(42, 6 + Math.sqrt(count) * 3.2))

// ── Painel lateral de detalhes da cidade ──────────────────────────────────────
export function CidadePanel({ cidade, onClose }: { cidade: CidadeAgg | null; onClose: () => void }) {
  if (!cidade) return null
  const { fill } = bubbleColor(cidade)
  return (
    <div className="absolute bottom-4 left-4 z-[500] w-72 animate-fade-in">
      <div className="bg-elevated/95 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: fill }} />
            <p className="text-body font-bold text-text capitalize">
              {cidade.cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center
                       text-muted hover:text-text hover:bg-surface transition-all"
          >
            <X size={12} />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.08]">
          <Stat label="Total OS"   value={cidade.count}              color="text-text" />
          <Stat label="Críticas"   value={cidade.criticos}           color={cidade.criticos  > 0 ? 'text-red'    : 'text-muted'} />
          <Stat label="Excedidas"  value={cidade.excedidos}          color={cidade.excedidos > 0 ? 'text-orange' : 'text-muted'} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.08]">
          <Stat label="Aging med." value={`${cidade.avgAging.toFixed(1)}d`} color="text-cyan" />
          <Stat label="Pendentes"  value={cidade.pendentes}   color="text-yellow" />
          <Stat label="Sem equipe" value={cidade.semEquipe}   color={cidade.semEquipe > 0 ? 'text-orange' : 'text-muted'} />
        </div>

        {/* Top bairros */}
        {cidade.topBairros?.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted mb-2">Top bairros</p>
            <div className="space-y-1.5">
              {cidade.topBairros.map((b: { bairro: string; count: number; criticos: number }, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-caption text-secondary truncate capitalize">
                        {(b.bairro || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <span className="text-caption font-mono text-text ml-2 flex-shrink-0">{b.count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round((b.count / cidade.count) * 100)}%`,
                          background: b.criticos > 0 ? '#f87171' : '#3b82f6',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Painel de resultado da busca por endereço ─────────────────────────────────
export interface BairroProx extends BairroAgg { distKm: number }
interface EquipeProx  { nome: string; count: number }
export interface ProximidadeInfo {
  proximos:           BairroProx[]
  maisProximo:        BairroProx | null
  equipes:            EquipeProx[]
  temEquipesProximas: boolean
}

export function AddressSearchPanel({ result, info, onClose }: {
  result: GeocodeResult
  info:   ProximidadeInfo
  onClose: () => void
}) {
  const { temEquipesProximas, equipes, proximos, maisProximo } = info
  return (
    <div className="absolute top-4 left-4 z-[500] w-80 animate-fade-in">
      <div className="bg-elevated/95 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-start gap-2 min-w-0">
            <PinIcon size={13} className="text-cyan flex-shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-secondary leading-snug">{result.label}</p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0
                       text-muted hover:text-text hover:bg-surface transition-all"
          >
            <X size={12} />
          </button>
        </div>

        {/* Veredito */}
        <div className={`flex items-start gap-2.5 px-4 py-3 border-b border-white/[0.08]
                          ${temEquipesProximas ? 'bg-green/[0.06]' : 'bg-yellow/[0.06]'}`}>
          {temEquipesProximas
            ? <CheckCircle2 size={15} className="text-green flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={15} className="text-yellow flex-shrink-0 mt-0.5" />}
          <div>
            {temEquipesProximas ? (
              <>
                <p className="text-label font-bold text-green leading-snug">
                  {equipes.length} equipe{equipes.length !== 1 ? 's' : ''} com OS nas proximidades
                </p>
                <p className="text-[10.5px] text-muted mt-0.5">raio de {PROXIMIDADE_KM} km</p>
              </>
            ) : (
              <>
                <p className="text-label font-bold text-yellow leading-snug">
                  Nenhuma equipe com OS ativa em até {PROXIMIDADE_KM} km
                </p>
                {maisProximo && (
                  <p className="text-[10.5px] text-muted mt-0.5">
                    Mais próxima: {maisProximo.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} — {maisProximo.distKm.toFixed(1)} km
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Equipes próximas */}
        {equipes.length > 0 && (
          <div className="px-4 py-3 border-b border-white/[0.08]">
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted mb-2">Equipes com OS ativas</p>
            <div className="flex flex-wrap gap-1.5">
              {equipes.map(e => (
                <span key={e.nome} className="text-caption bg-surface/40 border border-white/[0.08] rounded-full px-2.5 py-1">
                  <span className="text-text font-semibold">{shortEquipe(e.nome)}</span>
                  <span className="text-muted ml-1.5 font-mono">{e.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bairros próximos */}
        {proximos.length > 0 && (
          <div className="px-4 py-3 max-h-48 overflow-y-auto">
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted mb-2">Bairros próximos</p>
            <div className="space-y-1.5">
              {proximos.map(b => (
                <div key={`${b.cidade}::${b.bairro}`} className="flex items-center gap-2 text-caption">
                  <span className="flex-1 min-w-0 truncate text-secondary capitalize">
                    {b.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span className="text-muted font-mono flex-shrink-0">{b.distKm.toFixed(1)}km</span>
                  <span className="font-mono font-semibold text-text flex-shrink-0 w-6 text-right">{b.count}</span>
                  {b.criticos > 0 && <span className="text-caption font-bold text-red flex-shrink-0">⚠{b.criticos}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center py-2.5 px-1 gap-0.5">
      <span className={`text-[18px] font-black font-mono leading-none ${color}`}>{value}</span>
      <span className="text-caption font-bold uppercase tracking-[0.04em] text-muted text-center leading-tight">{label}</span>
    </div>
  )
}

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

// ── Ranking lateral (glassmorphism) ───────────────────────────────────────────
export function RankingPanel({ cidades, onSelect, selected }: {
  cidades:  CidadeAgg[]
  onSelect: (g: CidadeAgg | null) => void
  selected: CidadeAgg | null
}) {
  return (
    <div className="absolute top-4 right-4 z-[500] w-60">
      <div className="bg-elevated/90 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.08]">
          <TrendingUp size={12} className="text-primary" />
          <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Ranking de cidades</p>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto divide-y divide-white/[0.05]">
          {cidades.slice(0, 15).map((g: CidadeAgg, i: number) => {
            const { fill } = bubbleColor(g)
            const isSelected = selected?.cidade === g.cidade
            return (
              <button
                key={g.cidade}
                onClick={() => onSelect(isSelected ? null : g)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-all
                            ${isSelected ? 'bg-primary/10' : 'hover:bg-surface/30'}`}
              >
                <span className="text-caption font-mono text-muted/50 w-4 flex-shrink-0">{i + 1}</span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fill }} />
                <span className="flex-1 text-caption text-secondary truncate capitalize">
                  {g.cidade.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
                <span className="text-caption font-mono font-semibold text-text flex-shrink-0">{g.count}</span>
                {g.criticos > 0 && (
                  <span className="text-caption font-bold text-red flex-shrink-0">{g.criticos}⚠</span>
                )}
              </button>
            )
          })}
          {cidades.length === 0 && (
            <p className="text-caption text-muted/50 italic px-4 py-3">Nenhum dado com coordenadas.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export type SortKey = '_aging' | 'numos' | 'descsituacao'

export function SortIcon({ k, sortKey, sortDir }: { k: SortKey, sortKey: SortKey, sortDir: 'desc' | 'asc' }) {
  if (sortKey !== k) return <ChevronDown size={8} className="opacity-30" />
  return sortDir === 'asc'
    ? <ChevronUp size={8} className="text-primary" />
    : <ChevronDown size={8} className="text-primary" />
}

// ── Painel lateral de bairro com lista de OS ──────────────────────────────────
export function BairroPanel({ bairro, rows, onClose, onOS }: {
  bairro: BairroAgg | null
  rows:   OSRow[]
  onClose: () => void
  onOS:    (os: OSRow) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('_aging')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const bairroRows = useMemo(() => {
    if (!bairro) return []
    const norm = (s: string) => (s || '').trim().toUpperCase()
    return rows.filter(r =>
      norm(r.bairro) === norm(bairro.bairro) &&
      norm(r.nomedacidade) === norm(bairro.cidade)
    )
  }, [bairro, rows])

  const sorted = useMemo(() => {
    return [...bairroRows].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0
      if (sortKey === '_aging')       { av = a._aging ?? -1; bv = b._aging ?? -1 }
      else if (sortKey === 'numos')   { av = parseInt(a.numos) || 0; bv = parseInt(b.numos) || 0 }
      else                            { av = a.descsituacao ?? ''; bv = b.descsituacao ?? '' }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [bairroRows, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  if (!bairro) return null
  const fill = bairro.criticos > 0 ? '#f87171' : bairro.excedidos > 0 ? '#f97316' : bairro.pendentes > 0 ? '#3b82f6' : '#4ade80'
  const cidadeFmt = bairro.cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const bairroFmt = bairro.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="absolute bottom-4 left-4 z-[500] w-80 animate-fade-in">
      <div className="bg-elevated/95 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[70vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: fill }} />
            <div className="min-w-0">
              <p className="text-body font-bold text-text leading-tight truncate">{bairroFmt}</p>
              <p className="text-caption text-muted">{cidadeFmt}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface transition-all flex-shrink-0">
            <X size={12} />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.08] flex-shrink-0">
          <Stat label="Total OS"  value={bairro.count}    color="text-text" />
          <Stat label="Críticas"  value={bairro.criticos} color={bairro.criticos  > 0 ? 'text-red'    : 'text-muted'} />
          <Stat label="Excedidas" value={bairro.excedidos} color={bairro.excedidos > 0 ? 'text-orange' : 'text-muted'} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.08] flex-shrink-0">
          <Stat label="Aging med." value={`${bairro.avgAging.toFixed(1)}d`} color="text-cyan" />
          <Stat label="Pendentes"  value={bairro.pendentes} color="text-yellow" />
          <Stat label="Sem equipe" value={bairro.semEquipe} color={bairro.semEquipe > 0 ? 'text-orange' : 'text-muted'} />
        </div>

        {/* Lista de OS */}
        {sorted.length > 0 && (
          <>
            {/* Cabeçalho da tabela */}
            <div className="flex items-center px-3 py-1.5 border-b border-white/[0.05] bg-surface/30 flex-shrink-0">
              <button onClick={() => toggleSort('numos')} className="flex items-center gap-0.5 text-caption font-bold uppercase text-muted hover:text-secondary w-14 flex-shrink-0">
                Nº OS <SortIcon k="numos" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <span className="flex-1 text-caption font-bold uppercase text-muted">Cliente / Equipe</span>
              <button onClick={() => toggleSort('descsituacao')} className="flex items-center gap-0.5 text-caption font-bold uppercase text-muted hover:text-secondary mr-2">
                Status <SortIcon k="descsituacao" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <button onClick={() => toggleSort('_aging')} className="flex items-center gap-0.5 text-caption font-bold uppercase text-muted hover:text-secondary w-8 text-right">
                Age <SortIcon k="_aging" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </div>

            {/* Linhas */}
            <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
              {sorted.map(os => {
                const aging  = os._aging ?? 0
                const agVar  = aging >= 6 ? 'red' : aging >= 3 ? 'yellow' : 'cyan'
                const sit    = os._situacaoEfetiva ?? os.descsituacao ?? '—'
                const sVar   = situacaoVariant(sit)
                const semEq  = !os.nomedaequipe?.trim()
                return (
                  <button
                    key={os.numos}
                    onClick={() => onOS(os)}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-primary/[0.05] transition-colors"
                  >
                    <span className="text-caption font-mono font-bold text-primary flex-shrink-0 w-14 pt-0.5">{os.numos}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-caption text-text truncate leading-tight">{os.nomecliente || '—'}</p>
                      <p className={`text-caption truncate ${semEq ? 'text-orange font-semibold' : 'text-muted'}`}>
                        {semEq ? 'Sem equipe' : shortEquipe(os.nomedaequipe)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant={sVar} dot={false}>{sit.split('/')[0]}</Badge>
                      {os._aging != null && <Badge variant={agVar} dot={false}>{aging}d</Badge>}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Ranking de bairros ────────────────────────────────────────────────────────
export function BairroRankingPanel({ bairros, onSelect, selected }: {
  bairros:  BairroAgg[]
  onSelect: (b: BairroAgg | null) => void
  selected: BairroAgg | null
}) {
  return (
    <div className="absolute top-4 right-4 z-[500] w-64">
      <div className="bg-elevated/90 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.08]">
          <TrendingUp size={12} className="text-primary" />
          <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted">Ranking por bairro</p>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto divide-y divide-white/[0.05]">
          {bairros.slice(0, 20).map((b, i) => {
            const fill = b.criticos > 0 ? '#f87171' : b.excedidos > 0 ? '#f97316' : '#3b82f6'
            const isSelected = selected?.bairro === b.bairro && selected?.cidade === b.cidade
            return (
              <button
                key={`${b.cidade}::${b.bairro}`}
                onClick={() => onSelect(isSelected ? null : b)}
                className={`w-full flex items-center gap-2 px-3.5 py-2 text-left transition-all
                            ${isSelected ? 'bg-primary/10' : 'hover:bg-surface/30'}`}
              >
                <span className="text-caption font-mono text-muted/50 w-4 flex-shrink-0">{i + 1}</span>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: fill }} />
                <div className="flex-1 min-w-0">
                  <p className="text-caption text-secondary truncate capitalize">
                    {b.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <p className="text-caption text-muted/60 truncate capitalize">
                    {b.cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                </div>
                <span className="text-caption font-mono font-semibold text-text flex-shrink-0">{b.count}</span>
                {b.criticos > 0 && <span className="text-caption font-bold text-red flex-shrink-0">{b.criticos}⚠</span>}
              </button>
            )
          })}
          {bairros.length === 0 && (
            <p className="text-caption text-muted/50 italic px-4 py-3">Nenhum bairro com OS no filtro atual.</p>
          )}
        </div>
      </div>
    </div>
  )
}
