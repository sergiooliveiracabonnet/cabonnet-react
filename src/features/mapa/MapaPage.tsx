import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Circle as MapCircle, Tooltip, useMap } from 'react-leaflet'
import {
  Map as MapIcon, Flame, Circle, TrendingUp, X, LayoutGrid, Layers, ChevronDown, ChevronUp,
  Search, Loader2, CheckCircle2, AlertTriangle, MapPin as PinIcon, Wrench,
} from 'lucide-react'
import L from 'leaflet'
import { useOSDerived } from '../../contexts/OSDataContext'
import { isConcluida } from '../../lib/transform'
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, type BairroAgg } from './geo'
import { geocodeAddress, haversineKm, type GeocodeResult } from './searchAddress'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import OSDrawer from '../ordens/OSDrawer'
import { useOSExecucaoGeo } from '../../hooks/useOSExecucaoGeo'
import type { OSRow } from '../../lib/types'

const PROXIMIDADE_KM = 5

const searchPinIcon = L.divIcon({
  className: 'address-search-pin',
  html: `<div style="
    width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:#22d3ee;border:2px solid #0d1117;box-shadow:0 2px 8px rgba(0,0,0,.5);
  "></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

const execucaoIcon = L.divIcon({
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
interface CidadeAgg {
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
function MapResizer() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(t)
  }, [map])
  return null
}

// ── Voa para um ponto buscado (resultado de geocodificação) ──────────────────
function FlyTo({ point }: { point: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], 14, { duration: 0.8 })
  }, [map, point])
  return null
}

// ── Heatmap layer — implementação nativa sem leaflet.heat ─────────────────────
// Cada ponto recebe 3 círculos concêntricos semi-transparentes (bloom effect),
// coloridos de acordo com a intensidade relativa ao máximo da fila.
function HeatLayer({ points }: { points: [number, number, number][] }) {
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
function bubbleColor(g: CidadeAgg): { fill: string; stroke: string } {
  if (g.criticos  > 0)  return { fill: '#f87171', stroke: '#fca5a5' }
  if (g.excedidos > 0)  return { fill: '#f97316', stroke: '#fdba74' }
  if (g.pendentes > 0)  return { fill: '#3b82f6', stroke: '#7dd3fc' }
  return                       { fill: '#4ade80', stroke: '#86efac' }
}

// ── Radius proporcional à raiz quadrada do count ──────────────────────────────
const bubbleRadius = (count: number): number => Math.max(10, Math.min(42, 6 + Math.sqrt(count) * 3.2))

// ── Painel lateral de detalhes da cidade ──────────────────────────────────────
function CidadePanel({ cidade, onClose }: { cidade: CidadeAgg | null; onClose: () => void }) {
  if (!cidade) return null
  const { fill } = bubbleColor(cidade)
  return (
    <div className="absolute bottom-4 left-4 z-[500] w-72 animate-fade-in">
      <div className="bg-elevated/95 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: fill }} />
            <p className="text-[13px] font-bold text-text capitalize">
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
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2">Top bairros</p>
            <div className="space-y-1.5">
              {cidade.topBairros.map((b: { bairro: string; count: number; criticos: number }, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-secondary truncate capitalize">
                        {(b.bairro || '—').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <span className="text-[11px] font-mono text-text ml-2 flex-shrink-0">{b.count}</span>
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
interface BairroProx extends BairroAgg { distKm: number }
interface EquipeProx  { nome: string; count: number }
interface ProximidadeInfo {
  proximos:           BairroProx[]
  maisProximo:        BairroProx | null
  equipes:            EquipeProx[]
  temEquipesProximas: boolean
}

function AddressSearchPanel({ result, info, onClose }: {
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
                <p className="text-[12px] font-bold text-green leading-snug">
                  {equipes.length} equipe{equipes.length !== 1 ? 's' : ''} com OS nas proximidades
                </p>
                <p className="text-[10.5px] text-muted mt-0.5">raio de {PROXIMIDADE_KM} km</p>
              </>
            ) : (
              <>
                <p className="text-[12px] font-bold text-yellow leading-snug">
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
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2">Equipes com OS ativas</p>
            <div className="flex flex-wrap gap-1.5">
              {equipes.map(e => (
                <span key={e.nome} className="text-[11px] bg-surface/40 border border-white/[0.08] rounded-full px-2.5 py-1">
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
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2">Bairros próximos</p>
            <div className="space-y-1.5">
              {proximos.map(b => (
                <div key={`${b.cidade}::${b.bairro}`} className="flex items-center gap-2 text-[11px]">
                  <span className="flex-1 min-w-0 truncate text-secondary capitalize">
                    {b.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span className="text-muted font-mono flex-shrink-0">{b.distKm.toFixed(1)}km</span>
                  <span className="font-mono font-semibold text-text flex-shrink-0 w-6 text-right">{b.count}</span>
                  {b.criticos > 0 && <span className="text-[10px] font-bold text-red flex-shrink-0">⚠{b.criticos}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center py-2.5 px-1 gap-0.5">
      <span className={`text-[18px] font-black font-mono leading-none ${color}`}>{value}</span>
      <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-muted text-center leading-tight">{label}</span>
    </div>
  )
}

// ── Ranking lateral (glassmorphism) ───────────────────────────────────────────
function RankingPanel({ cidades, onSelect, selected }: {
  cidades:  CidadeAgg[]
  onSelect: (g: CidadeAgg | null) => void
  selected: CidadeAgg | null
}) {
  return (
    <div className="absolute top-4 right-4 z-[500] w-60">
      <div className="bg-elevated/90 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.08]">
          <TrendingUp size={12} className="text-primary" />
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">Ranking de cidades</p>
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
                <span className="text-[11px] font-mono text-muted/50 w-4 flex-shrink-0">{i + 1}</span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fill }} />
                <span className="flex-1 text-[11px] text-secondary truncate capitalize">
                  {g.cidade.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
                <span className="text-[11px] font-mono font-semibold text-text flex-shrink-0">{g.count}</span>
                {g.criticos > 0 && (
                  <span className="text-[10px] font-bold text-red flex-shrink-0">{g.criticos}⚠</span>
                )}
              </button>
            )
          })}
          {cidades.length === 0 && (
            <p className="text-[11px] text-muted/50 italic px-4 py-3">Nenhum dado com coordenadas.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MapaPage() {
  const { rows: globalRows, allRows } = useOSDerived()
  const { data: execucaoGeo = [] } = useOSExecucaoGeo()
  const [showExecucao, setShowExecucao] = useState(false)

  const [view,        setView]        = useState('ambos')    // 'calor' | 'bolhas' | 'ambos'
  const [granularity, setGranularity] = useState<'cidade' | 'bairro'>('cidade')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAging,  setFilterAging]  = useState('')
  const [selectedCidade, setSelectedCidade] = useState<CidadeAgg | null>(null)
  const [selectedBairro, setSelectedBairro] = useState<BairroAgg | null>(null)
  const [drawerOS,       setDrawerOS]       = useState<OSRow | null>(null)

  // ── Busca de endereço ────────────────────────────────────────────────────
  const [addressQuery,  setAddressQuery]  = useState('')
  const [searching,     setSearching]     = useState(false)
  const [searchError,   setSearchError]   = useState<string | null>(null)
  const [searchResult,  setSearchResult]  = useState<GeocodeResult | null>(null)

  async function handleSearchAddress() {
    const q = addressQuery.trim()
    if (!q || searching) return
    setSearching(true)
    setSearchError(null)
    try {
      const results = await geocodeAddress(q)
      if (!results.length) {
        setSearchResult(null)
        setSearchError('Endereço não encontrado. Tente incluir bairro e cidade.')
      } else {
        setSearchResult(results[0])
        setSelectedCidade(null)
        setSelectedBairro(null)
      }
    } catch {
      setSearchResult(null)
      setSearchError('Falha ao buscar endereço. Tente novamente.')
    } finally {
      setSearching(false)
    }
  }

  function handleClearSearch() {
    setSearchResult(null)
    setSearchError(null)
  }

  // Reset seleção ao trocar granularidade
  const handleGranularity = (g: 'cidade' | 'bairro') => {
    setGranularity(g)
    setSelectedCidade(null)
    setSelectedBairro(null)
  }

  // Aplica filtros locais sobre o rows já filtrado por data e por hideRede (via contexto).
  // Padrão sem filtro de status = apenas OS ativas (pendente + atendimento),
  // igual à definição de "Total OS" do Dashboard.
  const rows = useMemo(() => {
    const base = globalRows || []
    let r

    if (!filterStatus) {
      // padrão: ativas — mesma definição do Dashboard "Total OS"
      r = base.filter(x => x.descsituacao === 'Pendente' || x.descsituacao === 'Atendimento')
    } else {
      r = [...base]
      if (filterStatus === 'critico')     r = r.filter(x => x._slaCritico)
      if (filterStatus === 'excedido')    r = r.filter(x => x._slaExcedido && !x._slaCritico)
      if (filterStatus === 'pendente')    r = r.filter(x => x._situacaoEfetiva === 'Pendente')
      if (filterStatus === 'atendimento') r = r.filter(x => x._situacaoEfetiva === 'Atendimento')
      if (filterStatus === 'concluida')   r = r.filter(x => isConcluida(x._situacaoEfetiva))
      // 'todas' → sem filtro adicional, r = base completo
    }

    if (filterTipo)   r = r.filter(x => (x._tipo || '').toUpperCase() === filterTipo.toUpperCase())
    if (filterAging === '1-2')   r = r.filter(x => x._aging != null && x._aging <= 2)
    if (filterAging === '3-5')   r = r.filter(x => x._aging != null && x._aging >= 3  && x._aging <= 5)
    if (filterAging === '6-10')  r = r.filter(x => x._aging != null && x._aging >= 6  && x._aging <= 10)
    if (filterAging === '11+')   r = r.filter(x => x._aging != null && x._aging >= 11)
    return r
  }, [globalRows, filterStatus, filterTipo, filterAging])

  const cidades    = useMemo(() => aggregateByCidade(rows), [rows])
  const bairros    = useMemo(() => aggregateByBairro(rows), [rows])
  const heatPoints = useMemo(() => buildHeatPoints(rows),   [rows])

  // ── Proximidade: bairros e equipes com OS próximas ao endereço buscado ──
  const proximidade = useMemo<ProximidadeInfo | null>(() => {
    if (!searchResult) return null
    const point = { lat: searchResult.lat, lng: searchResult.lng }
    const ranked: BairroProx[] = bairros
      .map(b => ({ ...b, distKm: haversineKm(point, b.coords) }))
      .sort((a, b) => a.distKm - b.distKm)
    const proximos    = ranked.filter(b => b.distKm <= PROXIMIDADE_KM)
    const maisProximo = ranked[0] ?? null

    const norm = (s: string) => (s || '').trim().toUpperCase()
    const bairroKeys = new Set(proximos.map(b => `${norm(b.cidade)}::${norm(b.bairro)}`))
    const equipeMap = new Map<string, number>()
    if (bairroKeys.size > 0) {
      for (const r of rows) {
        const key = `${norm(r.nomedacidade)}::${norm(r.bairro)}`
        if (!bairroKeys.has(key)) continue
        if (!['Pendente', 'Atendimento'].includes(r._situacaoEfetiva ?? r.descsituacao)) continue
        const eq = r.nomedaequipe?.trim()
        if (!eq) continue
        equipeMap.set(eq, (equipeMap.get(eq) ?? 0) + 1)
      }
    }
    const equipes = [...equipeMap.entries()]
      .map(([nome, count]) => ({ nome, count }))
      .sort((a, b) => b.count - a.count)

    return { proximos: proximos.slice(0, 8), maisProximo, equipes, temEquipesProximas: equipes.length > 0 }
  }, [searchResult, bairros, rows])

  // KPIs globais
  const totalCriticos  = useMemo(() => rows.filter(r => r._slaCritico).length,  [rows])
  const totalExcedidos = useMemo(() => rows.filter(r => r._slaExcedido && !r._slaCritico).length, [rows])
  const avgAging = useMemo(() => {
    const vals = rows.map(r => r._aging).filter(v => v != null)
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
  }, [rows])

  // Marcadores ativos dependendo da granularidade
  const markers = granularity === 'cidade' ? cidades : bairros

  const tipoOpts = [
    { value: '',           label: 'Todos os tipos'   },
    { value: 'INSTALACAO', label: 'Instalação'       },
    { value: 'MANUTENCAO', label: 'Manutenção'       },
    { value: 'REDE',       label: 'Rede'             },
  ]
  const statusOpts = [
    { value: '',           label: 'Ativas (padrão)'  },
    { value: 'todas',      label: 'Todas as OS'      },
    { value: 'critico',    label: 'SLA Crítico'      },
    { value: 'excedido',   label: 'SLA Excedido'     },
    { value: 'pendente',   label: 'Pendente'         },
    { value: 'atendimento',label: 'Atendimento'      },
    { value: 'concluida',  label: 'Concluída'        },
  ]
  const agingOpts = [
    { value: '',     label: 'Qualquer aging' },
    { value: '1-2',  label: '1–2 dias'       },
    { value: '3-5',  label: '3–5 dias'       },
    { value: '6-10', label: '6–10 dias'      },
    { value: '11+',  label: '11+ dias'       },
  ]

  return (
    <div className="-mx-6 -my-6 flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>

      {/* ── Barra superior ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5
                      bg-elevated/80 backdrop-blur border-b border-white/[0.08] flex-wrap">

        {/* Ícone + título */}
        <div className="flex items-center gap-2">
          <MapIcon size={15} className="text-primary" />
          <span className="text-[13px] font-bold text-text">Mapa de Calor</span>
        </div>

        <div className="w-px h-5 bg-surface" />

        {/* Busca de endereço */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center">
            <Search size={11} className="absolute left-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              value={addressQuery}
              onChange={e => setAddressQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchAddress() }}
              placeholder="Buscar endereço (ex: Rua X, bairro, cidade)"
              className="w-64 pl-7 pr-2 py-1.5 text-[12px] rounded-lg
                         bg-bg border border-white/[0.08] text-text placeholder:text-muted
                         outline-none focus:border-primary/40 transition-colors duration-fast"
            />
          </div>
          <button
            onClick={handleSearchAddress}
            disabled={searching || !addressQuery.trim()}
            className="flex items-center gap-1.5 h-[30px] px-3 rounded-lg text-[11px] font-semibold
                       bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-fast"
          >
            {searching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
            Buscar
          </button>
          {(searchResult || searchError) && (
            <button
              onClick={handleClearSearch}
              title="Limpar busca"
              className="w-[30px] h-[30px] flex items-center justify-center rounded-lg
                         text-muted hover:text-text border border-white/[0.08] hover:bg-surface transition-all"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {searchError && (
          <span className="text-[11px] text-yellow flex items-center gap-1">
            <AlertTriangle size={10} /> {searchError}
          </span>
        )}

        <div className="w-px h-5 bg-surface" />

        {/* KPIs inline */}
        <KpiBadge label={filterStatus === '' ? 'OS Ativas' : 'OS'} value={rows.length} color="text-text" />
        <KpiBadge label="Críticas"  value={totalCriticos}  color="text-red"    />
        <KpiBadge label="Excedidas" value={totalExcedidos} color="text-orange" />
        <KpiBadge label="Aging med" value={`${avgAging}d`} color="text-cyan"   />
        {granularity === 'cidade'
          ? <KpiBadge label="Cidades" value={cidades.length} color="text-primary"/>
          : <KpiBadge label="Bairros" value={bairros.length} color="text-purple"/>
        }

        <div className="flex-1" />

        {/* Filtros */}
        <FilterSelect value={filterStatus} onChange={setFilterStatus} options={statusOpts} placeholder="Status" />
        <FilterSelect value={filterTipo}   onChange={setFilterTipo}   options={tipoOpts}   placeholder="Tipo" />
        <FilterSelect value={filterAging}  onChange={setFilterAging}  options={agingOpts}  placeholder="Aging" />

        <div className="w-px h-5 bg-surface" />

        {/* Toggle de granularidade */}
        <div className="flex bg-bg border border-white/[0.08] rounded-xl p-0.5">
          {([
            { val: 'cidade', icon: LayoutGrid, label: 'Cidade' },
            { val: 'bairro', icon: Layers,     label: 'Bairro' },
          ] as { val: 'cidade' | 'bairro'; icon: typeof LayoutGrid; label: string }[]).map(({ val, icon: Icon, label }) => (
            <button
              key={val}
              onClick={() => handleGranularity(val)}
              title={`Agrupar por ${label}`}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold
                          transition-all duration-fast
                          ${granularity === val
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : 'text-muted hover:text-text'}`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-surface" />

        {/* Toggle de visualização */}
        <div className="flex bg-bg border border-white/[0.08] rounded-xl p-0.5">
          {[
            { val: 'calor',  icon: Flame,  label: 'Calor'  },
            { val: 'bolhas', icon: Circle, label: 'Bolhas' },
            { val: 'ambos',  icon: MapIcon, label: 'Ambos'  },
          ].map(({ val, icon: Icon, label }) => (
            <button
              key={val}
              onClick={() => setView(val)}
              title={label}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold
                          transition-all duration-fast
                          ${view === val
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : 'text-muted hover:text-text'}`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-surface" />

        {/* Toggle de execução em campo */}
        <button
          onClick={() => setShowExecucao(v => !v)}
          title="OS em atendimento agora (ponto de início da execução)"
          className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold
                      transition-all duration-fast border
                      ${showExecucao
                        ? 'bg-yellow/20 text-yellow border-yellow/30'
                        : 'text-muted border-white/[0.08] hover:text-text'}`}
        >
          <Wrench size={11} />
          Em atendimento agora{execucaoGeo.length > 0 ? ` (${execucaoGeo.length})` : ''}
        </button>
        {showExecucao && execucaoGeo.length === 0 && (
          <span className="text-[10.5px] text-muted italic">Nenhuma OS em campo agora</span>
        )}
      </div>

      {/* ── Área do mapa ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>
        <MapContainer
          center={[-23.07, -45.72]}
          zoom={10}
          style={{ position: 'absolute', inset: 0, background: '#0d1117' }}
          zoomControl={false}
        >
          <MapResizer />
          <FlyTo point={searchResult} />

          {/* ESRI World Dark Gray Base — dark nativo, sem filtro CSS, sem API key */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="&copy; <a href='https://www.esri.com'>Esri</a>, DeLorme, NAVTEQ"
            maxZoom={16}
          />

          {/* Heatmap layer */}
          {(view === 'calor' || view === 'ambos') && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints as [number, number, number][]} />
          )}

          {/* Bubble markers */}
          {(view === 'bolhas' || view === 'ambos') && markers.map(g => {
            const isCidade = granularity === 'cidade'
            const gc = g as CidadeAgg
            const gb = g as BairroAgg
            const label = isCidade
              ? gc.cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
              : gb.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
            const key = isCidade ? gc.cidade : `${gb.cidade}::${gb.bairro}`
            const isSelected = isCidade
              ? selectedCidade?.cidade === gc.cidade
              : selectedBairro?.bairro === gb.bairro && selectedBairro?.cidade === gb.cidade

            const criticos  = g.criticos
            const excedidos = g.excedidos
            const fill   = criticos > 0 ? '#f87171' : excedidos > 0 ? '#f97316' : g.pendentes > 0 ? '#3b82f6' : '#4ade80'
            const stroke = criticos > 0 ? '#fca5a5' : excedidos > 0 ? '#fdba74' : g.pendentes > 0 ? '#7dd3fc' : '#86efac'
            const radius = isCidade ? bubbleRadius(g.count) : Math.max(6, Math.min(28, 4 + Math.sqrt(g.count) * 2.5))

            return (
              <CircleMarker
                key={key}
                center={[g.coords.lat, g.coords.lng]}
                radius={radius}
                pathOptions={{
                  fillColor: fill, fillOpacity: isSelected ? 0.9 : 0.55,
                  color: stroke, weight: isSelected ? 2.5 : 1.5, opacity: 0.9,
                }}
                eventHandlers={{
                  click: () => isCidade
                    ? setSelectedCidade(isSelected ? null : gc)
                    : setSelectedBairro(isSelected ? null : gb),
                }}
              >
                <Tooltip
                  permanent={g.count >= (isCidade ? 5 : 3)}
                  direction="top"
                  offset={[0, -radius - 4]}
                  className="map-tooltip"
                >
                  <span className="font-semibold">{label}</span>
                  {' '}
                  <span className="font-mono">{g.count}</span>
                  {criticos > 0 && <span className="text-red ml-1">⚠{criticos}</span>}
                </Tooltip>
              </CircleMarker>
            )
          })}

          {/* Resultado da busca de endereço */}
          {searchResult && (
            <>
              <MapCircle
                center={[searchResult.lat, searchResult.lng]}
                radius={PROXIMIDADE_KM * 1000}
                pathOptions={{ color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.04, weight: 1, dashArray: '4 6' }}
              />
              <Marker position={[searchResult.lat, searchResult.lng]} icon={searchPinIcon}>
                <Tooltip permanent direction="top" offset={[0, -28]} className="map-tooltip">
                  {searchResult.label}
                </Tooltip>
              </Marker>
            </>
          )}

          {/* Pins de execução em campo */}
          {showExecucao && execucaoGeo.map(p => (
            <Marker
              key={p.numos}
              position={[p.lat, p.lng]}
              icon={execucaoIcon}
              eventHandlers={{
                click: () => {
                  const found = allRows.find(r => r.numos === p.numos)
                  if (found) setDrawerOS(found)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -12]} className="map-tooltip">
                <span className="font-semibold">OS {p.numos}</span>
                {p.equipeagendada && <span className="block text-[10px]">{p.equipeagendada}</span>}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>

        {/* Resultado da busca de endereço */}
        {searchResult && proximidade && (
          <AddressSearchPanel
            result={searchResult}
            info={proximidade}
            onClose={handleClearSearch}
          />
        )}

        {/* Legenda */}
        <div className="absolute bottom-4 right-4 z-[500]">
          <div className="bg-elevated/85 backdrop-blur border border-white/[0.08] rounded-xl px-3 py-2.5 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.05em] text-muted mb-2">Criticidade</p>
            {[
              { color: '#f87171', label: 'SLA Crítico'   },
              { color: '#f97316', label: 'SLA Excedido'  },
              { color: '#3b82f6', label: 'Pendente/Atend.' },
              { color: '#4ade80', label: 'Concluída/OK'  },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[10px] text-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking lateral */}
        {granularity === 'cidade'
          ? <RankingPanel cidades={cidades} onSelect={setSelectedCidade} selected={selectedCidade} />
          : <BairroRankingPanel bairros={bairros} onSelect={setSelectedBairro} selected={selectedBairro} />
        }

        {/* Painel de detalhe */}
        {granularity === 'cidade'
          ? <CidadePanel cidade={selectedCidade} onClose={() => setSelectedCidade(null)} />
          : <BairroPanel
              bairro={selectedBairro}
              rows={rows}
              onClose={() => setSelectedBairro(null)}
              onOS={os => setDrawerOS(os)}
            />
        }
      </div>

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </div>
  )
}

type SortKey = '_aging' | 'numos' | 'descsituacao'

function SortIcon({ k, sortKey, sortDir }: { k: SortKey, sortKey: SortKey, sortDir: 'desc' | 'asc' }) {
  if (sortKey !== k) return <ChevronDown size={8} className="opacity-30" />
  return sortDir === 'asc'
    ? <ChevronUp size={8} className="text-primary" />
    : <ChevronDown size={8} className="text-primary" />
}

// ── Painel lateral de bairro com lista de OS ──────────────────────────────────
function BairroPanel({ bairro, rows, onClose, onOS }: {
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
              <p className="text-[13px] font-bold text-text leading-tight truncate">{bairroFmt}</p>
              <p className="text-[10px] text-muted">{cidadeFmt}</p>
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
              <button onClick={() => toggleSort('numos')} className="flex items-center gap-0.5 text-[9px] font-bold uppercase text-muted hover:text-secondary w-14 flex-shrink-0">
                Nº OS <SortIcon k="numos" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <span className="flex-1 text-[9px] font-bold uppercase text-muted">Cliente / Equipe</span>
              <button onClick={() => toggleSort('descsituacao')} className="flex items-center gap-0.5 text-[9px] font-bold uppercase text-muted hover:text-secondary mr-2">
                Status <SortIcon k="descsituacao" sortKey={sortKey} sortDir={sortDir} />
              </button>
              <button onClick={() => toggleSort('_aging')} className="flex items-center gap-0.5 text-[9px] font-bold uppercase text-muted hover:text-secondary w-8 text-right">
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
                    <span className="text-[11px] font-mono font-bold text-primary flex-shrink-0 w-14 pt-0.5">{os.numos}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text truncate leading-tight">{os.nomecliente || '—'}</p>
                      <p className={`text-[9px] truncate ${semEq ? 'text-orange font-semibold' : 'text-muted'}`}>
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
function BairroRankingPanel({ bairros, onSelect, selected }: {
  bairros:  BairroAgg[]
  onSelect: (b: BairroAgg | null) => void
  selected: BairroAgg | null
}) {
  return (
    <div className="absolute top-4 right-4 z-[500] w-64">
      <div className="bg-elevated/90 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.08]">
          <TrendingUp size={12} className="text-primary" />
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">Ranking por bairro</p>
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
                <span className="text-[10px] font-mono text-muted/50 w-4 flex-shrink-0">{i + 1}</span>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: fill }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-secondary truncate capitalize">
                    {b.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <p className="text-[9px] text-muted/60 truncate capitalize">
                    {b.cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                </div>
                <span className="text-[11px] font-mono font-semibold text-text flex-shrink-0">{b.count}</span>
                {b.criticos > 0 && <span className="text-[10px] font-bold text-red flex-shrink-0">{b.criticos}⚠</span>}
              </button>
            )
          })}
          {bairros.length === 0 && (
            <p className="text-[11px] text-muted/50 italic px-4 py-3">Nenhum bairro com OS no filtro atual.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-muted">{label}:</span>
      <span className={`text-[13px] font-black font-mono ${color}`}>{value}</span>
    </div>
  )
}
