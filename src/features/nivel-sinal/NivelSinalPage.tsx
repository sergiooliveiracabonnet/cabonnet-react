import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Broadcast, CheckCircle, DownloadSimple, FileCsv, MagnifyingGlass, Radio, UploadSimple, WarningCircle, WaveSine, X } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { TabBar } from '../../components/ui/TabBar'
import { alertRows, buildHotspots, filterSignals, groupBySeverity, parseSignalCsv, rankedCounts, signalPonKey, signalSummary, type SignalFilters, type SignalHotspot, type SignalRow, type SignalSeverity } from './nivelSinal'
import { HotspotGrid, KpiAction, Panel, RankedList, SeverityBars, SignalDetailModal, SignalHistogram, SignalTable, type DetailState } from './NivelSinalComponents'
import { NivelSinalAI } from './NivelSinalAI'
import { OcorrenciasSinal } from './OcorrenciasSinal'
import { syncSignalOccurrences, type SignalOccurrence } from './signalOccurrenceModel'
import { PonsTratadas } from './PonsTratadas'
import { PonMedicoesModal } from './PonMedicoesModal'
import { buildMedicaoDrafts, type MedicaoDraft, type PonMedicao } from './ponMedicoes'
import { buildTreatedPons, snapshotFromHotspot, splitHotspots, treatedPonKeys, treatmentsByKey, type PonTreatment, type TreatedPon } from './ponTreatments'
import { ponTreatmentsApi, signalOccurrencesApi } from '../../lib/api'

const optionList = (values: string[]) => [...new Set(values.filter(value => value && value !== '—'))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(value => ({ value, label: value }))

const EMPTY_FILTERS: SignalFilters = { query: '', cidade: '', olt: '', pon: '', slot: '', tipo: '', situacao: '', severities: [], offline: false, hotspotsOnly: false }
const HOTSPOTS_PER_PAGE = 12

function csvCell(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"` }

/** Formulário de potências aberto: tratar fecha a PON junto, editar só o cadastro. */
interface MedicaoTarget {
  modo: 'tratar' | 'editar'
  ponKey: string
  titulo: string
  subtitulo: string
  drafts: MedicaoDraft[]
  hotspot?: SignalHotspot
}

export default function NivelSinalPage() {
  const [activeTab, setActiveTab] = useState('analise')
  const [occurrences, setOccurrences] = useState<SignalOccurrence[]>([])
  const [importResult, setImportResult] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  // Um parse só por CSV: guardamos o snapshot completo e derivamos o recorte
  // de alerta em memória, em vez de parsear o arquivo duas vezes.
  const [allRows, setAllRows] = useState<SignalRow[]>([])
  const [treatments, setTreatments] = useState<PonTreatment[]>([])
  const [busyPon, setBusyPon] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<SignalFilters>(EMPTY_FILTERS)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [hotspotPage, setHotspotPage] = useState(0)
  const [medicaoTarget, setMedicaoTarget] = useState<MedicaoTarget | null>(null)

  const rows = useMemo(() => alertRows(allRows), [allRows])
  const hotspots = useMemo(() => buildHotspots(rows), [rows])
  const treatedKeys = useMemo(() => treatedPonKeys(treatments), [treatments])
  const treatmentMap = useMemo(() => treatmentsByKey(treatments), [treatments])
  const pendingHotspots = useMemo(() => splitHotspots(hotspots, treatedKeys).pendentes, [hotspots, treatedKeys])
  const treatedPons = useMemo(() => buildTreatedPons(treatments, hotspots), [treatments, hotspots])
  // Só as pendentes contam como fila: a tratada sai do KPI e do filtro de hotspots.
  const hotspotKeys = useMemo(() => new Set(pendingHotspots.map(item => item.key)), [pendingHotspots])
  const filtered = useMemo(() => filterSignals(rows, filters, hotspotKeys), [rows, filters, hotspotKeys])
  const summary = useMemo(() => signalSummary(filtered), [filtered])
  const validRx = filtered.map(row => row.rx).filter((value): value is number => value != null)
  const rxAverage = validRx.length ? validRx.reduce((sum, value) => sum + value, 0) / validRx.length : null
  const worstRx = validRx.length ? Math.min(...validRx) : null
  const reach = useMemo(() => ({ olts: new Set(filtered.map(row => row.olt)).size, bairros: new Set(filtered.map(row => row.bairro).filter(value => value !== '—')).size }), [filtered])
  // Modelo/Distância/OLT RX só vêm das OLTs Huawei; sem expor a cobertura o
  // ranking parece o parque inteiro.
  const modeloCoverage = useMemo(() => filtered.filter(row => row.modelo !== '—').length, [filtered])

  const cityRows = useMemo(() => rows.filter(row => !filters.cidade || row.cidade === filters.cidade), [rows, filters.cidade])
  const oltRows = useMemo(() => cityRows.filter(row => !filters.olt || row.olt === filters.olt), [cityRows, filters.olt])
  const matchingHotspots = pendingHotspots.filter(item => (!filters.cidade || item.cidade === filters.cidade) && (!filters.olt || item.olt === filters.olt) && (!filters.pon || item.key === filters.pon))
  const hotspotPages = Math.max(1, Math.ceil(matchingHotspots.length / HOTSPOTS_PER_PAGE))
  const visibleHotspots = matchingHotspots.slice(hotspotPage * HOTSPOTS_PER_PAGE, (hotspotPage + 1) * HOTSPOTS_PER_PAGE)
  const hasFilters = Boolean(filters.query || filters.cidade || filters.olt || filters.pon || filters.slot || filters.tipo || filters.situacao || filters.severities?.length || filters.offline || filters.hotspotsOnly)

  useEffect(() => setHotspotPage(0), [filters.cidade, filters.olt, filters.pon])
  useEffect(() => {
    signalOccurrencesApi.list<SignalOccurrence>()
      .then(response => setOccurrences(response.items))
      .catch(() => setError('Não foi possível carregar as ocorrências salvas no servidor.'))
    ponTreatmentsApi.list<PonTreatment>()
      .then(response => setTreatments(response.items))
      .catch(() => setError('Não foi possível carregar as PONs tratadas salvas no servidor.'))
    signalOccurrencesApi.latestImport()
      .then(response => {
        if (!response.item) return
        setAllRows(parseSignalCsv(response.item.csv_text, { includeNonAlerts: true }))
        setFileName(response.item.file_name)
      })
      .catch(() => setError('Não foi possível carregar o último CSV importado no servidor.'))
  }, [])

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
    reader.onload = async () => {
      try {
        const content = String(reader.result ?? '')
        const snapshot = parseSignalCsv(content, { includeNonAlerts: true })
        if (!snapshot.length) { setError('O CSV não contém registros reconhecidos nas cinco cidades atendidas.'); return }
        const synced = syncSignalOccurrences(occurrences, snapshot, new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()))
        const previousIds = new Set(occurrences.map(item => item.id))
        const newCount = synced.filter(item => !previousIds.has(item.id)).length
        const resolvedCount = synced.filter(item => occurrences.some(previous => previous.id === item.id && previous.status !== 'Concluído') && item.status === 'Concluído').length
        const updatedCount = synced.filter(item => previousIds.has(item.id) && item.status !== 'Concluído' && item.missedSnapshots === 0).length
        const missingCount = synced.filter(item => item.status !== 'Concluído' && item.missedSnapshots > 0).length
        const saved = await signalOccurrencesApi.sync<SignalOccurrence>({ file_name: file.name, csv_text: content, occurrences: synced })
        setOccurrences(saved.items)
        setImportResult(`${newCount} nova(s) · ${updatedCount} atualizada(s) · ${resolvedCount} normalizada(s) · ${missingCount} não localizada(s) · salvo no banco`)
        setAllRows(snapshot); setFileName(file.name); setError(''); setFilters(EMPTY_FILTERS); setHotspotPage(0)
      } catch (cause) {
        const detail = cause instanceof Error ? ` Motivo: ${cause.message}` : ''
        setError(`Não foi possível processar e salvar a importação.${detail}`)
      }
    }
    reader.onerror = () => setError('Não foi possível ler o arquivo selecionado.')
    reader.readAsText(file, 'utf-8'); event.target.value = ''
  }

  // Tratar a PON e informar a potência de cada cliente é o mesmo gesto: o OK só
  // vai ao banco depois que a equipe passa pelo formulário.
  function openTratar(hotspot: SignalHotspot) {
    setMedicaoTarget({
      modo: 'tratar', ponKey: hotspot.key, hotspot,
      titulo: `Tratar PON ${hotspot.pon} · ${hotspot.olt}`,
      subtitulo: `${hotspot.cidade} · ${hotspot.bairro} — informe a nova potência dos clientes desta PON.`,
      drafts: buildMedicaoDrafts(allRows.filter(row => signalPonKey(row) === hotspot.key), treatmentMap.get(hotspot.key)?.medicoes ?? []),
    })
  }

  function openEditarMedicoes(item: TreatedPon) {
    setMedicaoTarget({
      modo: 'editar', ponKey: item.pon_key,
      titulo: `Potências da PON ${item.snapshot.pon} · ${item.snapshot.olt}`,
      subtitulo: `${item.snapshot.cidade} · ${item.snapshot.bairro} — complete ou corrija o que foi medido em campo.`,
      drafts: buildMedicaoDrafts(allRows.filter(row => signalPonKey(row) === item.pon_key), item.medicoes ?? []),
    })
  }

  async function confirmMedicoes(target: MedicaoTarget, medicoes: PonMedicao[]) {
    setBusyPon(target.ponKey)
    try {
      const saved = target.modo === 'tratar' && target.hotspot
        ? await ponTreatmentsApi.treat<PonTreatment>({ pon_key: target.ponKey, snapshot: snapshotFromHotspot(target.hotspot), medicoes })
        : await ponTreatmentsApi.saveMedicoes<PonTreatment>({ pon_key: target.ponKey, medicoes })
      setTreatments(saved.items); setError(''); setMedicaoTarget(null)
    } catch {
      setError(target.modo === 'tratar'
        ? 'Não foi possível marcar a PON como tratada no banco de dados.'
        : 'Não foi possível salvar as potências no banco de dados.')
    } finally {
      setBusyPon('')
    }
  }

  async function reopenPon(item: TreatedPon) {
    setBusyPon(item.pon_key)
    try {
      // Reabre com a foto mais recente disponível: se o CSV atual ainda acusa a
      // PON, é esse número que interessa; senão preserva o do último OK.
      const snapshot = item.atual ? snapshotFromHotspot(item.atual) : item.snapshot
      const saved = await ponTreatmentsApi.reopen<PonTreatment>({ pon_key: item.pon_key, snapshot })
      setTreatments(saved.items); setError('')
    } catch {
      setError('Não foi possível reabrir a PON no banco de dados.')
    } finally {
      setBusyPon('')
    }
  }

  function exportFiltered() {
    const header = ['Cidade', 'Cidade Cliente', 'Bairro', 'OLT', 'Tipo', 'Slot', 'PON', 'ONU ID', 'Cliente', 'Código', 'Situação', 'PPPoE', 'Serial', 'Modelo', 'Status', 'Classificação', 'RX dBm', 'TX dBm', 'OLT RX dBm', 'Distância', 'Temperatura C', 'Down Cause']
    const lines = filtered.map(row => [row.cidade, row.cidadeCliente, row.bairro, row.olt, row.tipo, row.slot, row.pon, row.onu, row.cliente, row.codigo, row.situacao, row.pppoe, row.serial, row.modelo, row.status, row.classificacao, row.rx, row.tx, row.oltRx, row.distancia, row.temperatura, row.causa].map(csvCell).join(';'))
    const url = URL.createObjectURL(new Blob([`\uFEFF${header.join(';')}\r\n${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `nivel-sinal-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  return <div className="space-y-4 animate-fade-in">
    <TabBar tabs={[{ id: 'analise', label: 'Análise de sinal', icon: WaveSine }, { id: 'tratadas', label: `PONs tratadas${treatedPons.length ? ` (${treatedPons.length})` : ''}`, icon: CheckCircle }, { id: 'ocorrencias', label: 'Controle de ocorrências', icon: WarningCircle }]} active={activeTab} onChange={setActiveTab} />
    {activeTab === 'tratadas' ? <PonsTratadas treated={treatedPons} hasCsv={rows.length > 0} onReopen={reopenPon} onEditMedicoes={openEditarMedicoes} busyKey={busyPon} />
    : activeTab === 'ocorrencias' ? <OcorrenciasSinal occurrences={occurrences} onChange={async updated => {
      const changed = updated.find(item => occurrences.find(previous => previous.id === item.id) !== item)
      if (!changed) return
      try {
        const saved = await signalOccurrencesApi.update<SignalOccurrence>(changed)
        setOccurrences(saved.items); setError('')
      } catch (cause) {
        setError('Não foi possível salvar a tratativa no banco de dados.')
        throw cause
      }
    }} /> : <>
    <PageHeader title="Nível de Sinal" description="Supervisão óptica das ONUs nas cinco cidades atendidas" icon={WaveSine}
      titleExtra={fileName && <span className="text-caption font-normal text-muted">{fileName}</span>} actions={<><input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" onChange={handleFile} />{rows.length > 0 && <Button variant="ghost" onClick={exportFiltered}><DownloadSimple size={15} /> Exportar filtro</Button>}<Button onClick={() => fileRef.current?.click()}><UploadSimple size={15} /> {rows.length ? 'Trocar CSV' : 'Carregar CSV'}</Button></>} />

    {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-red/30 bg-red/[0.07] px-4 py-3 text-label text-red"><WarningCircle size={17} /><span className="flex-1">{error}</span><button aria-label="Fechar aviso" onClick={() => setError('')}><X size={15} /></button></div>}
    {importResult && <div role="status" className="rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3 text-label text-secondary"><strong className="text-primary">Importação concluída:</strong> {importResult}</div>}

    {!rows.length ? <div className="rounded-xl border border-border bg-card"><EmptyState icon={FileCsv} title="Carregue o relatório de sinais das ONUs" description="O arquivo é processado e salvo no banco de dados do projeto. Aceita CSV separado por vírgula ou ponto e vírgula." action={{ label: 'Selecionar arquivo CSV', onClick: () => fileRef.current?.click() }} /></div> : <>
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
        <button aria-pressed={filters.offline} title="O CSV só traz ONUs offline que também disparam alerta de RX; as demais ficam fora deste recorte." onClick={() => setFilter('offline', !filters.offline)} className={`rounded-full border px-3 py-1.5 text-caption font-semibold ${filters.offline ? 'border-red/40 bg-red/15 text-red' : 'border-border text-muted'}`}>Offline c/ alerta RX</button>
        <button aria-pressed={filters.hotspotsOnly} onClick={() => setFilter('hotspotsOnly', !filters.hotspotsOnly)} className={`rounded-full border px-3 py-1.5 text-caption font-semibold ${filters.hotspotsOnly ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-muted'}`}>Só hotspots</button>
        <span className="ml-auto text-caption text-muted">{filtered.length.toLocaleString('pt-BR')} de {rows.length.toLocaleString('pt-BR')} registros</span>{hasFilters && <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}><X size={13} /> Limpar</Button>}
      </div></section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiAction onClick={() => show('Total fora do padrão', 'ONUs no recorte de alerta de RX do CSV, dentro dos filtros ativos.', filtered)}><StatCard title="Total fora do padrão" value={summary.total} sub={`${summary.criticos} crítico · ${summary.atencao} atenção${summary.outros ? ` · ${summary.outros} sem classificação` : ''}`} icon={WaveSine} /></KpiAction>
        <KpiAction onClick={() => show('Crítico', 'ONUs com potência RX igual ou abaixo de −27 dBm. A régua é nossa: o CSV não traz coluna de classificação.', filtered.filter(row => row.classificacao === 'Crítico'))}><StatCard title="Crítico" value={summary.criticos} sub={`RX ≤ −27 dBm · ${summary.total ? (summary.criticos / summary.total * 100).toFixed(1) : '0.0'}%`} tone="critical" icon={WarningCircle} /></KpiAction>
        <KpiAction onClick={() => show('Atenção', 'ONUs com potência RX entre −27 e −25 dBm. A régua é nossa: o CSV não traz coluna de classificação.', filtered.filter(row => row.classificacao === 'Atenção'))}><StatCard title="Atenção" value={summary.atencao} sub={`RX entre −27 e −25 dBm · ${summary.total ? (summary.atencao / summary.total * 100).toFixed(1) : '0.0'}%`} tone="warning" icon={Radio} /></KpiAction>
        <KpiAction onClick={() => show('Hotspots de PON', 'Registros das PONs ainda pendentes de tratativa.', filtered.filter(row => hotspotKeys.has(signalPonKey(row))))}><StatCard title="Hotspots de PON" value={matchingHotspots.length} sub={treatedPons.length ? `pendentes · ${treatedPons.length} já tratada${treatedPons.length === 1 ? '' : 's'}` : 'PONs para ação de campo'} tone="critical" icon={Broadcast} /></KpiAction>
        <KpiAction onClick={() => show('RX médio', 'Medições utilizadas no cálculo da potência RX média.', filtered.filter(row => row.rx != null))}><StatCard title="RX médio" value={rxAverage == null ? '—' : rxAverage.toFixed(2)} sub={`pior: ${worstRx?.toFixed(2) ?? '—'} dBm`} tone="info" icon={WaveSine} /></KpiAction>
        <KpiAction onClick={() => show('Alcance', 'Cobertura dos registros: PONs, OLTs, bairros e equipamentos offline.', filtered)}><StatCard title="Alcance" value={summary.pons} sub={`${reach.olts} OLT · ${reach.bairros} bairros · ${summary.offline} offline c/ alerta`} icon={Radio} /></KpiAction>
      </div>

      <NivelSinalAI rows={filtered} filters={filters} />

      <div className="grid gap-4 xl:grid-cols-2"><Panel title="Distribuição de potência RX" hint="faixas de 0,5 dBm"><SignalHistogram rows={filtered} onOpen={setDetail} /></Panel><Panel title="Ranking de OLTs" hint="crítico / atenção"><SeverityBars groups={groupBySeverity(filtered, row => row.olt, 12)} label="OLT" onOpen={setDetail} /></Panel></div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><Panel title="Distribuição por cidade" hint="crítico / atenção"><SeverityBars groups={groupBySeverity(filtered, row => row.cidade, 8)} label="Cidade" onOpen={setDetail} /></Panel><Panel title="Causa / status"><RankedList items={rankedCounts(filtered, row => row.status.toLocaleLowerCase('pt-BR') !== 'online' ? `⚠ ${row.status}` : row.causa !== '—' ? row.causa : 'sem causa reportada', 6)} label="Causa/status" onOpen={setDetail} /></Panel></div>
      <Panel title="Hotspots de PON — prioridade de campo" hint={`${matchingHotspots.length} PON${matchingHotspots.length === 1 ? '' : 's'} priorizada${matchingHotspots.length === 1 ? '' : 's'}`}>
        <p className="mb-4 text-caption text-muted">PONs ordenadas da maior para a menor quantidade de ONUs críticas. Ao marcar “Tratada” a PON sai desta fila e vai para a aba PONs tratadas.</p>
        <HotspotGrid hotspots={visibleHotspots} rows={filtered} onOpen={setDetail} onApply={applyHotspot} onTreat={openTratar} treatments={treatmentMap} busyKey={busyPon} />
        {matchingHotspots.length > HOTSPOTS_PER_PAGE && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-caption text-muted">
          <span>{hotspotPage * HOTSPOTS_PER_PAGE + 1}–{Math.min(matchingHotspots.length, (hotspotPage + 1) * HOTSPOTS_PER_PAGE)} de {matchingHotspots.length} PONs</span>
          <div className="flex items-center gap-2"><Button variant="ghost" size="sm" aria-label="Página anterior de hotspots" disabled={hotspotPage === 0} onClick={() => setHotspotPage(page => page - 1)}>Anterior</Button><span className="min-w-24 text-center">Página {hotspotPage + 1} de {hotspotPages}</span><Button variant="ghost" size="sm" aria-label="Próxima página de hotspots" disabled={hotspotPage >= hotspotPages - 1} onClick={() => setHotspotPage(page => page + 1)}>Próxima</Button></div>
        </div>}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2"><Panel title="Bairros mais afetados"><RankedList items={rankedCounts(filtered, row => row.bairro, 10, ['—'])} label="Bairro" onOpen={setDetail} /></Panel><Panel title="Modelos de ONU" hint={`${modeloCoverage.toLocaleString('pt-BR')} de ${filtered.length.toLocaleString('pt-BR')} · só OLTs Huawei reportam modelo`}><RankedList items={rankedCounts(filtered, row => row.modelo, 6, ['—'])} label="Modelo de ONU" onOpen={setDetail} /></Panel></div>
      <SignalTable rows={filtered} onOpen={setDetail} />
    </>}
    <SignalDetailModal detail={detail} onClose={() => setDetail(null)} />
    </>}
    {medicaoTarget && <PonMedicoesModal key={`${medicaoTarget.modo}-${medicaoTarget.ponKey}`}
      titulo={medicaoTarget.titulo} subtitulo={medicaoTarget.subtitulo} modo={medicaoTarget.modo}
      drafts={medicaoTarget.drafts} hasCsv={allRows.length > 0} busy={busyPon === medicaoTarget.ponKey}
      onCancel={() => setMedicaoTarget(null)} onConfirm={medicoes => confirmMedicoes(medicaoTarget, medicoes)} />}
  </div>
}
