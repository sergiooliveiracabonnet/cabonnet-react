import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { DownloadSimple, FileCsv, MagnifyingGlass, Radio, UploadSimple, WarningCircle, WaveSine, X } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { parseSignalCsv, signalSummary, type SignalRow, type SignalSeverity } from './nivelSinal'

const PAGE_SIZE = 60

const uniqueOptions = (values: string[]) => [...new Set(values.filter(value => value && value !== '—'))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR')).map(value => ({ value, label: value }))

function severityVariant(value: SignalSeverity) {
  if (value === 'Crítico') return 'red'
  if (value === 'Atenção') return 'orange'
  if (value === 'Normal') return 'green'
  return 'gray'
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export default function NivelSinalPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<SignalRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [olt, setOlt] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)

  const summary = useMemo(() => signalSummary(rows), [rows])
  const cities = useMemo(() => uniqueOptions(rows.map(row => row.cidade)), [rows])
  const olts = useMemo(() => uniqueOptions(rows.filter(row => !city || row.cidade === city).map(row => row.olt)), [rows, city])
  const statuses = useMemo(() => uniqueOptions(rows.map(row => row.status)), [rows])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    return rows.filter(row => {
      const searchable = [row.cliente, row.codigo, row.pppoe, row.serial, row.bairro, row.pon, row.onu]
        .join(' ').toLocaleLowerCase('pt-BR')
      return (!needle || searchable.includes(needle)) && (!city || row.cidade === city)
        && (!olt || row.olt === olt) && (!severity || row.classificacao === severity)
        && (!status || row.status === status)
    }).sort((a, b) => (a.rx ?? 0) - (b.rx ?? 0))
  }, [rows, query, city, olt, severity, status])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visibleRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasFilters = Boolean(query || city || olt || severity || status)

  function clearFilters() {
    setQuery(''); setCity(''); setOlt(''); setSeverity(''); setStatus(''); setPage(0)
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseSignalCsv(String(reader.result ?? ''))
      if (!parsed.length) {
        setError('O CSV não contém registros reconhecidos nas cinco cidades atendidas.')
        return
      }
      setRows(parsed); setFileName(file.name); setError(''); clearFilters()
    }
    reader.onerror = () => setError('Não foi possível ler o arquivo selecionado.')
    reader.readAsText(file, 'utf-8')
    event.target.value = ''
  }

  function exportFiltered() {
    const header = ['Cidade', 'Bairro', 'OLT', 'Slot', 'PON', 'ONU', 'Cliente', 'Código', 'PPPoE', 'Serial', 'Modelo', 'Status', 'Classificação', 'RX dBm', 'TX dBm', 'OLT RX dBm', 'Distância', 'Causa']
    const lines = filtered.map(row => [row.cidade, row.bairro, row.olt, row.slot, row.pon, row.onu, row.cliente, row.codigo,
      row.pppoe, row.serial, row.modelo, row.status, row.classificacao, row.rx, row.tx, row.oltRx, row.distancia, row.causa]
      .map(csvCell).join(';'))
    const url = URL.createObjectURL(new Blob([`\uFEFF${header.join(';')}\r\n${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `nivel-sinal-${new Date().toISOString().slice(0, 10)}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Nível de Sinal"
        description="Supervisão óptica das ONUs nas cinco cidades atendidas"
        icon={WaveSine}
        titleExtra={fileName && <span className="text-caption font-normal text-muted">{fileName}</span>}
        actions={<>
          <input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" onChange={handleFile} />
          {rows.length > 0 && <Button variant="ghost" onClick={exportFiltered}><DownloadSimple size={15} /> Exportar filtro</Button>}
          <Button onClick={() => fileRef.current?.click()}><UploadSimple size={15} /> {rows.length ? 'Trocar CSV' : 'Carregar CSV'}</Button>
        </>}
      />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red/30 bg-red/[0.07] px-4 py-3 text-label text-red">
          <WarningCircle size={17} className="flex-shrink-0" /> <span className="flex-1">{error}</span>
          <button aria-label="Fechar aviso" onClick={() => setError('')}><X size={15} /></button>
        </div>
      )}

      {!rows.length ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={FileCsv} title="Carregue o relatório de sinais das ONUs"
            description="O arquivo é processado somente neste navegador e não é enviado ao servidor. Aceita CSV separado por vírgula ou ponto e vírgula."
            action={{ label: 'Selecionar arquivo CSV', onClick: () => fileRef.current?.click() }} />
        </div>
      ) : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard title="Fora do padrão" value={summary.total} sub="registros importados" icon={WaveSine} />
          <StatCard title="Críticos" value={summary.criticos} sub="ação imediata" tone="critical" icon={WarningCircle} />
          <StatCard title="Em atenção" value={summary.atencao} sub="acompanhar degradação" tone="warning" icon={Radio} />
          <StatCard title="Offline" value={summary.offline} sub="sem sinal online" tone="critical" icon={Radio} />
          <StatCard title="PONs afetadas" value={summary.pons} sub="OLT · slot · PON" tone="info" icon={WaveSine} />
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/20 p-3">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Buscar sinais</span>
              <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }}
                placeholder="Cliente, PPPoE, serial, bairro ou ONU…"
                className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-label text-text outline-none placeholder:text-muted focus:border-primary/50" />
            </label>
            <FilterSelect value={city} onChange={value => { setCity(value); setOlt(''); setPage(0) }} options={cities} placeholder="Todas as cidades" className="min-w-40" />
            <FilterSelect value={olt} onChange={value => { setOlt(value); setPage(0) }} options={olts} placeholder="Todas as OLTs" className="min-w-40" />
            <FilterSelect value={severity} onChange={value => { setSeverity(value); setPage(0) }} options={['Crítico', 'Atenção', 'Normal'].map(value => ({ value, label: value }))} placeholder="Severidade" className="min-w-36" />
            <FilterSelect value={status} onChange={value => { setStatus(value); setPage(0) }} options={statuses} placeholder="Status" className="min-w-32" />
            {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X size={13} /> Limpar</Button>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-label">
              <thead className="border-b border-border bg-surface/10 text-caption uppercase tracking-wide text-muted">
                <tr>{['Severidade', 'RX', 'Cliente', 'Cidade / Bairro', 'OLT', 'PON / ONU', 'Modelo / Serial', 'Status'].map(label => <th key={label} className="px-4 py-2.5 text-left font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map((row, index) => (
                  <tr key={`${row.olt}-${row.pon}-${row.onu}-${index}`} className="hover:bg-surface/20">
                    <td className="px-4 py-3"><Badge variant={severityVariant(row.classificacao)}>{row.classificacao}</Badge></td>
                    <td className={`px-4 py-3 font-mono font-bold tabular-nums ${row.classificacao === 'Crítico' ? 'text-red' : row.classificacao === 'Atenção' ? 'text-orange' : 'text-text'}`}>{row.rx?.toFixed(2) ?? '—'} dBm</td>
                    <td className="max-w-56 px-4 py-3"><p className="truncate font-semibold text-text">{row.cliente}</p><p className="truncate text-caption text-muted">{row.pppoe || row.codigo || '—'}</p></td>
                    <td className="px-4 py-3"><p className="text-text">{row.cidade}</p><p className="text-caption text-muted">{row.bairro}</p></td>
                    <td className="px-4 py-3 text-secondary">{row.olt}</td>
                    <td className="px-4 py-3 font-mono text-secondary">{row.slot} · {row.pon} / {row.onu}</td>
                    <td className="max-w-48 px-4 py-3"><p className="truncate text-secondary">{row.modelo}</p><p className="truncate font-mono text-caption text-muted">{row.serial || '—'}</p></td>
                    <td className="px-4 py-3"><span className="text-secondary">{row.status}</span><p className="text-caption text-muted">{row.causa}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!filtered.length ? <EmptyState icon={MagnifyingGlass} title="Nenhum sinal corresponde aos filtros" action={{ label: 'Limpar filtros', onClick: clearFilters }} /> : (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-caption text-muted">
              <span>{filtered.length.toLocaleString('pt-BR')} registros · página {page + 1} de {pageCount}</span>
              <div className="flex gap-2"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button variant="ghost" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>
            </div>
          )}
        </section>
      </>}
    </div>
  )
}
