import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Circle as MapCircle, Tooltip, ZoomControl, ScaleControl } from 'react-leaflet'
import { MapTrifold as MapIcon, Fire, Circle, X, GridFour, Stack, MagnifyingGlass, CircleNotch, Warning, Wrench, SlidersHorizontal, ArrowCounterClockwise } from '@phosphor-icons/react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { isConcluida } from '../../lib/transform'
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, buildEquipeOptions, type BairroAgg } from './geo'
import { useGeocodedEquipeOS } from './useGeocodedEquipeOS'
import { geocodeAddress, haversineKm, type GeocodeResult } from './searchAddress'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { StatCard } from '../../components/ui/StatCard'
import OSDrawer from '../ordens/OSDrawer'
import { useOSExecucaoGeo } from '../../hooks/useOSExecucaoGeo'
import type { OSRow } from '../../lib/types'
import {
  MapResizer, FlyTo, HeatLayer, bubbleRadius, CidadePanel, AddressSearchPanel,
  RankingPanel, BairroRankingPanel, BairroPanel,
  PROXIMIDADE_KM, searchPinIcon, execucaoIcon,
  osPointColor, EquipeGeocodeStatus,
  ApproximateLocationNotice, MapLegend,
  type CidadeAgg, type ProximidadeInfo, type BairroProx,
} from './MapaComponents'

// ── Página principal ──────────────────────────────────────────────────────────
export default function MapaPage() {
  const { rows: globalRows, allRows } = useOSDerived()
  const { data: execucaoGeo = [] } = useOSExecucaoGeo()
  const [showExecucao, setShowExecucao] = useState(false)

  const [view,        setView]        = useState<'calor' | 'bolhas'>('bolhas')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [granularity, setGranularity] = useState<'cidade' | 'bairro'>('cidade')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAging,  setFilterAging]  = useState('')
  const [filterEquipe, setFilterEquipe] = useState('')
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
    if (g === 'bairro') setView('bolhas')
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
    if (filterEquipe) r = r.filter(x => (x.nomedaequipe || '').trim() === filterEquipe)
    if (filterAging === '1-2')   r = r.filter(x => x._aging != null && x._aging <= 2)
    if (filterAging === '3-5')   r = r.filter(x => x._aging != null && x._aging >= 3  && x._aging <= 5)
    if (filterAging === '6-10')  r = r.filter(x => x._aging != null && x._aging >= 6  && x._aging <= 10)
    if (filterAging === '11+')   r = r.filter(x => x._aging != null && x._aging >= 11)
    return r
  }, [globalRows, filterStatus, filterTipo, filterEquipe, filterAging])

  const equipeOpts = useMemo(() => [
    { value: '', label: 'Todas as equipes' },
    ...buildEquipeOptions(globalRows || []),
  ], [globalRows])

  const equipeGeo = useGeocodedEquipeOS(rows, !!filterEquipe)

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

  const activeFilterCount = [filterStatus, filterTipo, filterEquipe, filterAging].filter(Boolean).length
  const clearFilters = () => {
    setFilterStatus('')
    setFilterTipo('')
    setFilterEquipe('')
    setFilterAging('')
    setSelectedCidade(null)
    setSelectedBairro(null)
  }

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100dvh-96px)] min-h-[560px] flex-col overflow-hidden">

      {/* ── Barra superior ────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-white/[0.08] bg-elevated/95 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">

        {/* Ícone + título */}
        <div className="flex items-center gap-2">
          <MapIcon size={15} className="text-primary" />
          <div>
            <h1 className="text-body font-bold text-text">Mapa Operacional</h1>
            <p className="text-caption text-muted">Distribuição e risco da fila em campo</p>
          </div>
        </div>

        {/* Busca de endereço */}
        <div className="order-3 flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1">
          <div className="relative flex min-w-0 flex-1 lg:max-w-md">
            <MagnifyingGlass size={11} className="absolute left-2.5 text-muted pointer-events-none" />
            <input
              aria-label="Buscar endereço no mapa"
              type="text"
              value={addressQuery}
              onChange={e => setAddressQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchAddress() }}
              placeholder="Buscar endereço (ex: Rua X, bairro, cidade)"
              className="h-11 w-full pl-8 pr-3 text-base sm:text-label rounded-lg
                         bg-bg border border-white/[0.08] text-text placeholder:text-muted
                         outline-none focus:border-primary/40 transition-colors duration-fast"
            />
          </div>
          <button
            onClick={handleSearchAddress}
            disabled={searching || !addressQuery.trim()}
            className="flex min-h-11 items-center gap-1.5 px-3 rounded-lg text-caption font-semibold
                       bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-fast"
          >
            {searching ? <CircleNotch size={11} className="animate-spin" /> : <MagnifyingGlass size={11} />}
            Buscar
          </button>
          {(searchResult || searchError) && (
            <button
              onClick={handleClearSearch}
              title="Limpar busca"
              aria-label="Limpar busca de endereço"
              className="flex h-11 w-11 items-center justify-center rounded-lg
                         text-muted hover:text-text border border-white/[0.08] hover:bg-surface transition-all"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {searchError && (
          <span role="alert" className="order-4 w-full text-caption text-yellow flex items-center gap-1">
            <Warning size={10} /> {searchError}
          </span>
        )}

        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setFiltersOpen(v => !v)}
          aria-expanded={filtersOpen}
          aria-controls="mapa-filtros"
          className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-caption font-semibold transition-colors
                      ${filtersOpen || activeFilterCount > 0 ? 'border-primary/30 bg-primary/15 text-primary' : 'border-white/[0.08] text-secondary hover:bg-surface'}`}
        >
          <SlidersHorizontal size={14} />
          Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5" aria-label="Resumo do mapa">
          <StatCard size="inline" title={filterStatus === '' ? 'OS Ativas' : 'OS'} value={rows.length} />
          <StatCard size="inline" title="Críticas" value={totalCriticos} tone="critical" />
          <StatCard size="inline" title="Excedidas" value={totalExcedidos} tone="warning" />
          <StatCard size="inline" title="Aging med" value={`${avgAging}d`} />
          <StatCard size="inline" title={granularity === 'cidade' ? 'Cidades' : 'Bairros'} value={granularity === 'cidade' ? cidades.length : bairros.length} />
        </div>

        {filtersOpen && (
          <div id="mapa-filtros" className="mt-2 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-2 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(130px,1fr))_auto]">
            <FilterSelect ariaLabel="Filtrar por status" value={filterStatus} onChange={setFilterStatus} options={statusOpts} />
            <FilterSelect ariaLabel="Filtrar por tipo" value={filterTipo} onChange={setFilterTipo} options={tipoOpts} />
            <FilterSelect ariaLabel="Filtrar por equipe" value={filterEquipe} onChange={setFilterEquipe} options={equipeOpts} />
            <FilterSelect ariaLabel="Filtrar por aging" value={filterAging} onChange={setFilterAging} options={agingOpts} />
            <button type="button" onClick={clearFilters} disabled={activeFilterCount === 0}
                    className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-3 text-caption font-semibold text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1">
              <ArrowCounterClockwise size={13} /> Limpar filtros
            </button>
          </div>
        )}
        {granularity === 'bairro' && <ApproximateLocationNotice />}
      </header>

      {/* ── Área do mapa ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden overscroll-contain" style={{ flex: '1 1 0', minHeight: 0 }}
           role="region" aria-label="Mapa operacional das ordens de serviço">
        <div className="absolute left-2 top-2 z-[500] flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-2 sm:left-4 sm:top-4">
          <div className="flex rounded-xl border border-white/[0.10] bg-elevated/95 p-1 shadow-lg backdrop-blur" aria-label="Agrupamento geográfico">
            {([
              { val: 'cidade', icon: GridFour, label: 'Cidade' },
              { val: 'bairro', icon: Stack, label: 'Bairro' },
            ] as const).map(({ val, icon: Icon, label }) => (
              <button key={val} type="button" onClick={() => handleGranularity(val)} aria-pressed={granularity === val}
                      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-caption font-semibold transition-colors
                                  ${granularity === val ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}>
                <Icon size={13} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          <div className="flex rounded-xl border border-white/[0.10] bg-elevated/95 p-1 shadow-lg backdrop-blur" aria-label="Camada de visualização">
            {([
              { val: 'bolhas', icon: Circle, label: 'Bolhas' },
              { val: 'calor', icon: Fire, label: 'Concentração' },
            ] as const).map(({ val, icon: Icon, label }) => (
              <button key={val} type="button" onClick={() => setView(val)} aria-pressed={view === val}
                      disabled={val === 'calor' && granularity === 'bairro'}
                      title={val === 'calor' ? 'Concentração agregada por cidade' : 'Quantidade e risco por localidade'}
                      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-caption font-semibold transition-colors
                                  ${view === val ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface hover:text-text'}
                                  disabled:cursor-not-allowed disabled:opacity-40`}>
                <Icon size={13} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => setShowExecucao(v => !v)} aria-pressed={showExecucao}
                  className={`flex min-h-11 items-center gap-1.5 rounded-xl border bg-elevated/95 px-3 text-caption font-semibold shadow-lg backdrop-blur transition-colors
                              ${showExecucao ? 'border-yellow/30 text-yellow' : 'border-white/[0.10] text-muted hover:bg-surface hover:text-text'}`}>
            <Wrench size={13} aria-hidden="true" />
            Em campo{execucaoGeo.length > 0 ? ` (${execucaoGeo.length})` : ''}
          </button>
        </div>

        {showExecucao && execucaoGeo.length === 0 && (
          <div role="status" className="absolute left-2 top-36 z-[500] rounded-lg border border-white/[0.08] bg-elevated/95 px-3 py-2 text-caption text-muted sm:left-4 sm:top-32">
            Nenhuma OS em campo agora
          </div>
        )}

        <MapContainer
          center={[-23.07, -45.72]}
          zoom={10}
          style={{ position: 'absolute', inset: 0, background: '#0d1117' }}
          zoomControl={false}
        >
          <MapResizer />
          <FlyTo point={searchResult} />
          <ZoomControl position="bottomleft" />
          <ScaleControl position="bottomleft" imperial={false} />

          {/* ESRI World Dark Gray Base — dark nativo, sem filtro CSS, sem API key */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="&copy; <a href='https://www.esri.com'>Esri</a>, DeLorme, NAVTEQ"
            maxZoom={16}
          />

          {/* Heatmap layer */}
          {!filterEquipe && view === 'calor' && granularity === 'cidade' && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints as [number, number, number][]} />
          )}

          {/* Bubble markers */}
          {!filterEquipe && view === 'bolhas' && markers.map(g => {
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
                  {criticos > 0 && <span className="text-red ml-1">Críticas: {criticos}</span>}
                </Tooltip>
              </CircleMarker>
            )
          })}

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
                {p.equipeagendada && <span className="block text-caption">{p.equipeagendada}</span>}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>

        {/* Progresso da geocodificação da equipe selecionada */}
        {filterEquipe && (
          <EquipeGeocodeStatus
            resolved={equipeGeo.resolved}
            total={equipeGeo.total}
            capped={equipeGeo.capped}
            totalEquipe={rows.length}
          />
        )}

        {/* Resultado da busca de endereço */}
        {searchResult && proximidade && (
          <AddressSearchPanel
            result={searchResult}
            info={proximidade}
            onClose={handleClearSearch}
          />
        )}

        {!searchResult && !selectedCidade && !selectedBairro && <MapLegend />}

        {/* Ranking lateral */}
        {!searchResult && !selectedCidade && !selectedBairro && (
          granularity === 'cidade'
            ? <RankingPanel cidades={cidades} onSelect={setSelectedCidade} selected={selectedCidade} />
            : <BairroRankingPanel bairros={bairros} onSelect={setSelectedBairro} selected={selectedBairro} />
        )}

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
