import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Circle as MapCircle, Tooltip } from 'react-leaflet'
import {
  Map as MapIcon, Flame, Circle, X, LayoutGrid, Layers, Search, Loader2, AlertTriangle, Wrench,
} from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { isConcluida } from '../../lib/transform'
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, type BairroAgg } from './geo'
import { geocodeAddress, haversineKm, type GeocodeResult } from './searchAddress'
import { FilterSelect } from '../../components/ui/FilterSelect'
import OSDrawer from '../ordens/OSDrawer'
import { useOSExecucaoGeo } from '../../hooks/useOSExecucaoGeo'
import type { OSRow } from '../../lib/types'
import {
  MapResizer, FlyTo, HeatLayer, bubbleRadius, CidadePanel, AddressSearchPanel,
  RankingPanel, BairroRankingPanel, BairroPanel, KpiBadge,
  PROXIMIDADE_KM, searchPinIcon, execucaoIcon,
  type CidadeAgg, type ProximidadeInfo, type BairroProx,
} from './MapaComponents'

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
