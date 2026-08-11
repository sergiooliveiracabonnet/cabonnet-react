import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Broadcast, DownloadSimple, FileCsv, MagnifyingGlass, Radio, UploadSimple, WarningCircle, WaveSine, X } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { TabBar } from '../../components/ui/TabBar'
import { buildHotspots, filterSignals, groupBySeverity, parseSignalCsv, rankedCounts, signalPonKey, signalSummary, type SignalFilters, type SignalHotspot, type SignalRow, type SignalSeverity } from './nivelSinal'
import { HotspotGrid, KpiAction, Panel, RankedList, SeverityBars, SignalDetailModal, SignalHistogram, SignalTable, type DetailState } from './NivelSinalComponents'
import { NivelSinalAI } from './NivelSinalAI'
import { OcorrenciasSinal } from './OcorrenciasSinal'

const optionList = (values: string[]) => [...new Set(values.filter(value => value && value !== '—'))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(value => ({ value, label: value }))

const EMPTY_FILTERS: SignalFilters = { query: '', cidade: '', olt: '', pon: '', slot: '', tipo: '', situacao: '', severities: [], offline: false, hotspotsOnly: false }
const HOTSPOTS_PER_PAGE = 12

function csvCell(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"` }

export default function NivelSinalPage() {
  const [activeTab, setActiveTab] = useState('analise')
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<SignalRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<SignalFilters>(EMPTY_FILTERS)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [hotspotPage, setHotspotPage] = useState(0)

  const hotspots = useMemo(() => buildHotspots(rows), [rows])
  const hotspotKeys = useMemo(() => new Set(hotspots.map(item => item.key)), [hotspots])
  const filtered = useMemo(() => filterSignals(rows, filters, hotspotKeys), [rows, filters, hotspotKeys])
  const summary = useMemo(() => signalSummary(filtered), [filtered])
  const validRx = filtered.map(row => row.rx).filter((value): value is number => value != null)
  const rxAverage = validRx.length ? validRx.reduce((sum, value) => sum + value, 0) / validRx.length : null
  const worstRx = validRx.length ? Math.min(...validRx) : null
  const reach = useMemo(() => ({ olts: new Set(filtered.map(row => row.olt)).size, bairros: new Set(filtered.map(row => row.bairro).filter(value => value !== '—')).size }), [filtered])

  const cityRows = useMemo(() => rows.filter(row => !filters.cidade || row.cidade === filters.cidade), [rows, filters.cidade])
  const oltRows = useMemo(() => cityRows.filter(row => !filters.olt || row.olt === filters.olt), [cityRows, filters.olt])
  const matchingHotspots = hotspots.filter(item => (!filters.cidade || item.cidade === filters.cidade) && (!filters.olt || item.olt === filters.olt) && (!filters.pon || item.key === filters.pon))
  const hotspotPages = Math.max(1, Math.ceil(matchingHotspots.length / HOTSPOTS_PER_PAGE))
  const visibleHotspots = matchingHotspots.slice(hotspotPage * HOTSPOTS_PER_PAGE, (hotspotPage + 1) * HOTSPOTS_PER_PAGE)
  const hasFilters = Boolean(filters.query || filters.cidade || filters.olt || filters.pon || filters.slot || filters.tipo || filters.situacao || filters.severities?.length || filters.offline || filters.hotspotsOnly)

  useEffect(() => setHotspotPage(0), [filters.cidade, filters.olt, filters.pon])

  const setFilter = <K extends keyof SignalFilters>(key: K, value: SignalFilters[K]) => setFilters(current => ({ ...current, [key]: value }))
  const show = (title: string, subtitle: string, detailRows: SignalRow[]) => setDetail({ title, subtitle, rows: detailRows })

  function toggleSeverity(value: SignalSeverity) {
    const selected = filters.severities ?? []
    setFilter('severities', selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value])
  }

  function applyHotspot(hotspot: SignalHotspot) {
    setFilters({ ...EMPTY_FILTERS, cidade: hotspot.cidade, olt: hotspot.olt, pon: hotspot.key })
    setHotspotPage(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseSignalCsv(String(reader.result ?? ''))
      if (!parsed.length) { setError('O CSV não contém registros reconhecidos nas cinco cidades atendidas.'); return }
      setRows(parsed); setFileName(file.name); setError(''); setFilters(EMPTY_FILTERS); setHotspotPage(0)
    }
    reader.onerror = () => setError('Não foi possível ler o arquivo selecionado.')
    reader.readAsText(file, 'utf-8'); event.target.value = ''
  }

  function exportFiltered() {
    const header = ['Cidade', 'Bairro', 'OLT', 'Tipo', 'Slot', 'PON', 'ONU ID', 'Cliente', 'Código', 'Situação', 'PPPoE', 'Serial', 'Modelo', 'Status', 'Classificação', 'RX dBm', 'TX dBm', 'OLT RX dBm', 'Distância', 'Down Cause']
    const lines = filtered.map(row => [row.cidade, row.bairro, row.olt, row.tipo, row.slot, row.pon, row.onu, row.cliente, row.codigo, row.situacao, row.pppoe, row.serial, row.modelo, row.status, row.classificacao, row.rx, row.tx, row.oltRx, row.distancia, row.causa].map(csvCell).join(';'))
    const url = URL.createObjectURL(new Blob([`\uFEFF${header.join(';')}\r\n${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `nivel-sinal-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  return <div className="space-y-4 animate-fade-in">
    <TabBar tabs={[{ id: 'analise', label: 'Análise de sinal', icon: WaveSine }, { id: 'ocorrencias', label: 'Controle de ocorrências', icon: WarningCircle }]} active={activeTab} onChange={setActiveTab} />
    {activeTab === 'ocorrencias' ? <OcorrenciasSinal /> : <>
    <PageHeader title="Nível de Sinal" description="Supervisão óptica das ONUs nas cinco cidades atendidas" icon={WaveSine}
      titleExtra={fileName && <span className="text-caption font-normal text-muted">{fileName}</span>} actions={<><input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" onChange={handleFile} />{rows.length > 0 && <Button variant="ghost" onClick={exportFiltered}><DownloadSimple size={15} /> Exportar filtro</Button>}<Button onClick={() => fileRef.current?.click()}><UploadSimple size={15} /> {rows.length ? 'Trocar CSV' : 'Carregar CSV'}</Button></>} />

    {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-red/30 bg-red/[0.07] px-4 py-3 text-label text-red"><WarningCircle size={17} /><span className="flex-1">{error}</span><button aria-label="Fechar aviso" onClick={() => setError('')}><X size={15} /></button></div>}

    {!rows.length ? <div className="rounded-xl border border-border bg-card"><EmptyState icon={FileCsv} title="Carregue o relatório de sinais das ONUs" description="O arquivo é processado somente neste navegador e não é enviado ao servidor. Aceita CSV separado por vírgula ou ponto e vírgula." action={{ label: 'Selecionar arquivo CSV', onClick: () => fileRef.current?.click() }} /></div> : <>
      <section className="rounded-xl border border-border bg-card p-3"><div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={filters.cidade ?? ''} onChange={value => setFilters(current => ({ ...current, cidade: value, olt: '', pon: '', slot: '' }))} options={optionList(rows.map(row => row.cidade))} placeholder="Todas as cidades" className="min-w-40" />
        <FilterSelect value={filters.olt ?? ''} onChange={value => setFilters(current => ({ ...current, olt: value, pon: '', slot: '' }))} options={optionList(cityRows.map(row => row.olt))} placeholder="Todas as OLTs" className="min-w-40" />
        <FilterSelect value={filters.pon ?? ''} onChange={value => setFilter('pon', value)} options={optionList(oltRows.map(signalPonKey))} placeholder="Todas as PONs" className="min-w-44" />
        <FilterSelect value={filters.slot ?? ''} onChange={value => setFilter('slot', value)} options={optionList(oltRows.map(row => row.slot))} placeholder="Todos os slots" className="min-w-32" />
        <FilterSelect value={filters.tipo ?? ''} onChange={value => setFilter('tipo', value)} options={optionList(rows.map(row => row.tipo))} placeholder="Fabricante" className="min-w-36" />
        <FilterSelect value={filters.situacao ?? ''} onChange={value => setFilter('situacao', value)} options={optionList(rows.map(row => row.situacao))} placeholder="Situação" className="min-w-40" />
        <label className="relative min-w-[220px] flex-1"><span className="sr-only">Buscar sinais</span><MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input type="search" value={filters.query ?? ''} onChange={event => setFilter('query', event.target.value)} placeholder="Cliente, serial, PPPoE, bairro, código, ONU…" className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-label text-text outline-none placeholder:text-muted focus:border-primary/50" /></label>
      </div><div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {(['Crítico', 'Atenção'] as SignalSeverity[]).map(value => <button key={value} aria-pressed={filters.severities?.includes(value)} onClick={() => toggleSeverity(value)} className={`rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors ${filters.severities?.includes(value) ? value === 'Crítico' ? 'border-red/40 bg-red/15 text-red' : 'border-orange/40 bg-orange/15 text-orange' : 'border-border text-muted hover:text-text'}`}>{value}</button>)}
        <button aria-pressed={filters.offline} onClick={() => setFilter('offline', !filters.offline)} className={`rounded-full border px-3 py-1.5 text-caption font-semibold ${filters.offline ? 'border-red/40 bg-red/15 text-red' : 'border-border text-muted'}`}>Offline</button>
        <button aria-pressed={filters.hotspotsOnly} onClick={() => setFilter('hotspotsOnly', !filters.hotspotsOnly)} className={`rounded-full border px-3 py-1.5 text-caption font-semibold ${filters.hotspotsOnly ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-muted'}`}>Só hotspots</button>
        <span className="ml-auto text-caption text-muted">{filtered.length.toLocaleString('pt-BR')} de {rows.length.toLocaleString('pt-BR')} registros</span>{hasFilters && <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}><X size={13} /> Limpar</Button>}
      </div></section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiAction onClick={() => show('Total fora do padrão', 'Soma das ONUs classificadas como Crítico e Atenção nos filtros ativos.', filtered)}><StatCard title="Total fora do padrão" value={summary.total} sub="Crítico + Atenção no filtro" icon={WaveSine} /></KpiAction>
        <KpiAction onClick={() => show('Crítico', 'ONUs com a coluna Classificação igual a Crítico no CSV.', filtered.filter(row => row.classificacao === 'Crítico'))}><StatCard title="Crítico" value={summary.criticos} sub={`Classificação “Crítico” no CSV · ${summary.total ? (summary.criticos / summary.total * 100).toFixed(1) : '0.0'}%`} tone="critical" icon={WarningCircle} /></KpiAction>
        <KpiAction onClick={() => show('Atenção', 'ONUs com a coluna Classificação igual a Atenção no CSV.', filtered.filter(row => row.classificacao !== 'Crítico'))}><StatCard title="Atenção" value={summary.atencao} sub={`Classificação “Atenção” no CSV · ${summary.total ? (summary.atencao / summary.total * 100).toFixed(1) : '0.0'}%`} tone="warning" icon={Radio} /></KpiAction>
        <KpiAction onClick={() => show('Hotspots de PON', 'Registros pertencentes às PONs priorizadas para ação de campo.', filtered.filter(row => hotspotKeys.has(signalPonKey(row))))}><StatCard title="Hotspots de PON" value={matchingHotspots.length} sub="PONs para ação de campo" tone="critical" icon={Broadcast} /></KpiAction>
        <KpiAction onClick={() => show('RX médio', 'Medições utilizadas no cálculo da potência RX média.', filtered.filter(row => row.rx != null))}><StatCard title="RX médio" value={rxAverage == null ? '—' : rxAverage.toFixed(2)} sub={`pior: ${worstRx?.toFixed(2) ?? '—'} dBm`} tone="info" icon={WaveSine} /></KpiAction>
        <KpiAction onClick={() => show('Alcance', 'Cobertura dos registros: PONs, OLTs, bairros e equipamentos offline.', filtered)}><StatCard title="Alcance" value={summary.pons} sub={`${reach.olts} OLT · ${reach.bairros} bairros · ${summary.offline} offline`} icon={Radio} /></KpiAction>
      </div>

      <NivelSinalAI rows={filtered} filters={filters} />

      <div className="grid gap-4 xl:grid-cols-2"><Panel title="Distribuição de potência RX" hint="faixas de 0,5 dBm"><SignalHistogram rows={filtered} onOpen={setDetail} /></Panel><Panel title="Ranking de OLTs" hint="crítico / atenção"><SeverityBars groups={groupBySeverity(filtered, row => row.olt, 12)} label="OLT" onOpen={setDetail} /></Panel></div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><Panel title="Distribuição por cidade" hint="crítico / atenção"><SeverityBars groups={groupBySeverity(filtered, row => row.cidade, 8)} label="Cidade" onOpen={setDetail} /></Panel><Panel title="Causa / status"><RankedList items={rankedCounts(filtered, row => row.status.toLocaleLowerCase('pt-BR') !== 'online' ? `⚠ ${row.status}` : row.causa !== '—' ? row.causa : 'sem causa reportada', 6)} label="Causa/status" onOpen={setDetail} /></Panel></div>
      <Panel title="Hotspots de PON — prioridade de campo" hint={`${matchingHotspots.length} PON${matchingHotspots.length === 1 ? '' : 's'} priorizada${matchingHotspots.length === 1 ? '' : 's'}`}>
        <p className="mb-4 text-caption text-muted">PONs ordenadas da maior para a menor quantidade de ONUs críticas.</p>
        <HotspotGrid hotspots={visibleHotspots} rows={filtered} onOpen={setDetail} onApply={applyHotspot} />
        {matchingHotspots.length > HOTSPOTS_PER_PAGE && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-caption text-muted">
          <span>{hotspotPage * HOTSPOTS_PER_PAGE + 1}–{Math.min(matchingHotspots.length, (hotspotPage + 1) * HOTSPOTS_PER_PAGE)} de {matchingHotspots.length} PONs</span>
          <div className="flex items-center gap-2"><Button variant="ghost" size="sm" aria-label="Página anterior de hotspots" disabled={hotspotPage === 0} onClick={() => setHotspotPage(page => page - 1)}>Anterior</Button><span className="min-w-24 text-center">Página {hotspotPage + 1} de {hotspotPages}</span><Button variant="ghost" size="sm" aria-label="Próxima página de hotspots" disabled={hotspotPage >= hotspotPages - 1} onClick={() => setHotspotPage(page => page + 1)}>Próxima</Button></div>
        </div>}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2"><Panel title="Bairros mais afetados"><RankedList items={rankedCounts(filtered, row => row.bairro, 10, ['—'])} label="Bairro" onOpen={setDetail} /></Panel><Panel title="Modelos de ONU"><RankedList items={rankedCounts(filtered, row => row.modelo, 6, ['—'])} label="Modelo de ONU" onOpen={setDetail} /></Panel></div>
      <SignalTable rows={filtered} onOpen={setDetail} />
    </>}
    <SignalDetailModal detail={detail} onClose={() => setDetail(null)} />
    </>}
  </div>
}
