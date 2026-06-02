import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { Map, Flame, Circle, TrendingUp, X, LayoutGrid, Layers } from 'lucide-react'
import L from 'leaflet'
import { useOSDerived } from '../../contexts/OSDataContext'
import { isConcluida } from '../../lib/transform'
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, type BairroAgg } from './geo'
import { FilterSelect } from '../../components/ui/FilterSelect'

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
  const { rows: globalRows } = useOSDerived()

  const [view,        setView]        = useState('ambos')    // 'calor' | 'bolhas' | 'ambos'
  const [granularity, setGranularity] = useState<'cidade' | 'bairro'>('cidade')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAging,  setFilterAging]  = useState('')
  const [selectedCidade, setSelectedCidade] = useState<CidadeAgg | null>(null)
  const [selectedBairro, setSelectedBairro] = useState<BairroAgg | null>(null)

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
          <Map size={15} className="text-primary" />
          <span className="text-[13px] font-bold text-text">Mapa de Calor</span>
        </div>

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
            { val: 'ambos',  icon: Map,    label: 'Ambos'  },
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
        </MapContainer>

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
          : <BairroPanel bairro={selectedBairro}  onClose={() => setSelectedBairro(null)} />
        }
      </div>
    </div>
  )
}

// ── Painel lateral de bairro ──────────────────────────────────────────────────
function BairroPanel({ bairro, onClose }: { bairro: BairroAgg | null; onClose: () => void }) {
  if (!bairro) return null
  const fill = bairro.criticos > 0 ? '#f87171' : bairro.excedidos > 0 ? '#f97316' : bairro.pendentes > 0 ? '#3b82f6' : '#4ade80'
  const cidadeFmt = bairro.cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const bairroFmt = bairro.bairro.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  return (
    <div className="absolute bottom-4 left-4 z-[500] w-72 animate-fade-in">
      <div className="bg-elevated/95 backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
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
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.08]">
          <Stat label="Total OS"  value={bairro.count}                            color="text-text" />
          <Stat label="Críticas"  value={bairro.criticos}  color={bairro.criticos  > 0 ? 'text-red'    : 'text-muted'} />
          <Stat label="Excedidas" value={bairro.excedidos} color={bairro.excedidos > 0 ? 'text-orange' : 'text-muted'} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
          <Stat label="Aging med." value={`${bairro.avgAging.toFixed(1)}d`} color="text-cyan" />
          <Stat label="Pendentes"  value={bairro.pendentes}   color="text-yellow" />
          <Stat label="Sem equipe" value={bairro.semEquipe}   color={bairro.semEquipe > 0 ? 'text-orange' : 'text-muted'} />
        </div>
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
