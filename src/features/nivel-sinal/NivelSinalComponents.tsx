import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Broadcast, MapPin, Rows, WarningCircle } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { buildHistogram, type SignalHotspot, type SignalRow, type SignalSeverity, sortSignals, type SignalSortKey, type SortDirection } from './nivelSinal'

export function severityVariant(value: SignalSeverity) {
  if (value === 'Crítico') return 'red'
  if (value === 'Atenção') return 'orange'
  if (value === 'Normal') return 'green'
  return 'gray'
}

export interface DetailState {
  title: string
  subtitle: string
  rows: SignalRow[]
  action?: { label: string; run: () => void }
}

export function SignalDetailModal({ detail, onClose }: { detail: DetailState | null; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<SignalSortKey>('rx')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const rows = useMemo(() => detail ? sortSignals(detail.rows, sortKey, sortDir).slice(0, 100) : [], [detail, sortKey, sortDir])
  if (!detail) return null
  const criticos = detail.rows.filter(row => row.classificacao === 'Crítico').length
  const offline = detail.rows.filter(row => row.status.toLocaleLowerCase('pt-BR') !== 'online').length
  const validRx = detail.rows.map(row => row.rx).filter((value): value is number => value != null)
  const avg = validRx.length ? validRx.reduce((sum, value) => sum + value, 0) / validRx.length : null
  const columns: [SignalSortKey, string][] = [['classificacao', 'Severidade'], ['cliente', 'Cliente'], ['cidade', 'Cidade'], ['olt', 'OLT'], ['pon', 'PON'], ['rx', 'RX dBm'], ['status', 'Status']]

  function changeSort(key: SignalSortKey) {
    if (key === sortKey) setSortDir(value => value === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  return (
    <Modal open onClose={onClose} title={detail.title} subtitle={detail.subtitle} maxWidth="1100px"
      headerAction={detail.action && <Button size="sm" onClick={() => { detail.action?.run(); onClose() }}>{detail.action.label}</Button>}>
      <div className="grid grid-cols-2 gap-2 border-b border-border p-4 sm:grid-cols-4">
        {[['Registros', detail.rows.length], ['Críticos', criticos], ['Offline', offline], ['RX médio', avg == null ? '—' : `${avg.toFixed(2)} dBm`]].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface/40 px-3 py-2"><p className="text-caption text-muted">{label}</p><p className="mt-1 text-body font-bold text-text tabular-nums">{value}</p></div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-label">
          <thead className="border-b border-border bg-surface/20"><tr>{columns.map(([key, label]) => (
            <th key={key} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-muted">
              <button className="flex items-center gap-1 hover:text-text" onClick={() => changeSort(key)}>{label}{sortKey === key && (sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</button>
            </th>
          ))}</tr></thead>
          <tbody className="divide-y divide-border">{rows.map((row, index) => (
            <tr key={`${row.olt}-${row.pon}-${row.onu}-${index}`} className="hover:bg-surface/20">
              <td className="px-4 py-2"><Badge variant={severityVariant(row.classificacao)}>{row.classificacao}</Badge></td>
              <td className="max-w-64 truncate px-4 py-2 font-semibold text-text">{row.cliente}</td><td className="px-4 py-2">{row.cidade}</td>
              <td className="px-4 py-2">{row.olt}</td><td className="px-4 py-2 font-mono">{row.pon}</td>
              <td className="px-4 py-2 font-mono font-bold tabular-nums">{row.rx?.toFixed(2) ?? '—'}</td><td className="px-4 py-2">{row.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-caption text-muted">{detail.rows.length > 100 ? `Exibindo os 100 primeiros de ${detail.rows.length.toLocaleString('pt-BR')} registros.` : `${detail.rows.length.toLocaleString('pt-BR')} registros.`}</p>
    </Modal>
  )
}

export function Panel({ title, hint, children, className = '' }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return <Card className={className}><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><h2 className="text-body font-semibold text-text">{title}</h2>{hint && <span className="text-caption text-muted">{hint}</span>}</div><div className="p-4">{children}</div></Card>
}

export function SignalHistogram({ rows, onOpen }: { rows: SignalRow[]; onOpen: (detail: DetailState) => void }) {
  const bins = buildHistogram(rows)
  const max = Math.max(1, ...bins.map(bin => bin.total))
  return <div><div className="flex h-44 items-end gap-1 border-b border-border px-1">{bins.map(bin => (
    <button key={bin.start} disabled={!bin.total} title={`${bin.start.toFixed(1)} a ${bin.end.toFixed(1)} dBm · ${bin.total} ONUs`}
      onClick={() => onOpen({ title: `Potência RX: ${bin.start.toFixed(1)} a ${bin.end.toFixed(1)} dBm`, subtitle: 'ONUs posicionadas nesta faixa do histograma.', rows: bin.rows })}
      className="group flex h-full flex-1 flex-col justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
      <span className="mb-1 text-caption tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">{bin.total || ''}</span>
      <span style={{ height: `${bin.total / max * 100}%` }} className={`min-h-px w-full rounded-t-sm transition-opacity group-hover:opacity-75 ${bin.start < -26.5 ? 'bg-red' : 'bg-orange'}`} />
    </button>
  ))}</div><div className="mt-2 flex justify-between text-caption font-mono text-muted"><span>-34</span><span>-32</span><span>-30</span><span>-28</span><span>-26</span><span>-24 dBm</span></div></div>
}

export interface SeverityGroup { key: string; total: number; criticos: number; atencao: number; rows: SignalRow[] }
export function SeverityBars({ groups, label, onOpen }: { groups: SeverityGroup[]; label: string; onOpen: (detail: DetailState) => void }) {
  const max = groups[0]?.total || 1
  return <div className="space-y-3">{groups.length ? groups.map(group => (
    <button key={group.key} onClick={() => onOpen({ title: `${label}: ${group.key}`, subtitle: `${group.total} registros · ${group.criticos} críticos.`, rows: group.rows })} className="grid w-full grid-cols-[minmax(90px,1fr)_2fr_62px] items-center gap-3 text-left group">
      <span className="truncate text-label text-secondary group-hover:text-text">{group.key}</span>
      <span className="flex h-2 overflow-hidden rounded-full bg-surface"><i className="bg-red" style={{ width: `${group.criticos / max * 100}%` }} /><i className="bg-orange" style={{ width: `${group.atencao / max * 100}%` }} /></span>
      <span className="text-right text-caption tabular-nums text-muted"><b className="text-text">{group.total}</b> · <span className="text-red">{group.criticos}</span></span>
    </button>
  )) : <p className="py-8 text-center text-label text-muted">Sem dados</p>}</div>
}

export interface RankItem { key: string; total: number; pct: number; rows: SignalRow[] }
export function RankedList({ items, label, onOpen }: { items: RankItem[]; label: string; onOpen: (detail: DetailState) => void }) {
  return <div className="divide-y divide-border">{items.length ? items.map((item, index) => (
    <button key={item.key} onClick={() => onOpen({ title: `${label}: ${item.key}`, subtitle: `${item.total} registros relacionados.`, rows: item.rows })} className="grid w-full grid-cols-[28px_1fr_auto_auto] items-center gap-2 py-2 text-left hover:text-text">
      <span className="font-mono text-caption text-muted">{String(index + 1).padStart(2, '0')}</span><span className="truncate text-label text-secondary">{item.key}</span><b className="text-label tabular-nums text-text">{item.total}</b><span className="w-12 text-right text-caption tabular-nums text-muted">{item.pct.toFixed(1)}%</span>
    </button>
  )) : <p className="py-8 text-center text-label text-muted">Sem dados</p>}</div>
}

export function HotspotGrid({ hotspots, rows, onOpen, onApply }: { hotspots: SignalHotspot[]; rows: SignalRow[]; onOpen: (detail: DetailState) => void; onApply: (hotspot: SignalHotspot) => void }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{hotspots.length ? hotspots.map(hotspot => {
    const related = rows.filter(row => `${row.olt} · ${row.pon}` === hotspot.key)
    return <Card key={hotspot.key} onClick={() => onOpen({ title: `Hotspot ${hotspot.pon} · ${hotspot.olt}`, subtitle: `${hotspot.cidade} · ${hotspot.bairro} · ${hotspot.criticos} críticas em ${hotspot.total} ONUs.`, rows: related, action: { label: 'Aplicar este filtro', run: () => onApply(hotspot) } })} className="p-4">
      <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-title font-bold text-text">{hotspot.pon}</p><p className="mt-0.5 text-caption text-muted">{hotspot.olt}</p></div><Badge variant={hotspot.nivel === 'alto' ? 'red' : 'orange'}>{hotspot.nivel === 'alto' ? 'Risco alto' : 'Risco médio'}</Badge></div>
      <p className="mt-3 flex items-center gap-1 text-caption text-muted"><MapPin size={11} /> {hotspot.cidade} · {hotspot.bairro}</p>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center"><Metric label="Críticas" value={hotspot.criticos} critical /><Metric label="Total" value={hotspot.total} /><Metric label="Concentr." value={`${(hotspot.concentracao * 100).toFixed(0)}%`} /><Metric label="RX med." value={hotspot.rxMediano?.toFixed(1) ?? '—'} /></div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface"><div className="h-full bg-red" style={{ width: `${hotspot.concentracao * 100}%` }} /></div>
    </Card>
  }) : <div className="col-span-full flex flex-col items-center py-10 text-center text-muted"><Broadcast size={28} className="mb-2 opacity-40" /><p className="text-label">Nenhuma PON atinge ≥4 críticas e ≥30% de concentração.</p></div>}</div>
}

function Metric({ label, value, critical }: { label: string; value: ReactNode; critical?: boolean }) {
  return <div><span className="text-caption uppercase tracking-wide text-muted">{label}</span><strong className={`mt-1 block text-body tabular-nums ${critical ? 'text-red' : 'text-text'}`}>{value}</strong></div>
}

export function KpiAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{children}</button>
}

export const signalIcons = { rows: Rows, warning: WarningCircle }

const TABLE_COLUMNS: { key: SignalSortKey; label: string; render: (row: SignalRow) => ReactNode }[] = [
  { key: 'classificacao', label: 'Sev', render: row => <Badge variant={severityVariant(row.classificacao)}>{row.classificacao}</Badge> },
  { key: 'rx', label: 'RX dBm', render: row => <b className={row.classificacao === 'Crítico' ? 'text-red' : 'text-orange'}>{row.rx?.toFixed(2) ?? '—'}</b> },
  { key: 'oltRx', label: 'OLT RX', render: row => row.oltRx?.toFixed(2) ?? '—' },
  { key: 'tx', label: 'TX dBm', render: row => row.tx?.toFixed(2) ?? '—' },
  { key: 'cliente', label: 'Cliente', render: row => <span className="block max-w-52 truncate font-semibold text-text" title={row.cliente}>{row.cliente}</span> },
  { key: 'cidade', label: 'Cidade', render: row => row.cidade }, { key: 'bairro', label: 'Bairro', render: row => row.bairro },
  { key: 'olt', label: 'OLT', render: row => row.olt }, { key: 'pon', label: 'PON', render: row => <span className="font-mono">{row.pon}</span> },
  { key: 'onu', label: 'ONU', render: row => <span className="font-mono">{row.onu}</span> }, { key: 'modelo', label: 'Modelo', render: row => row.modelo },
  { key: 'serial', label: 'Serial', render: row => <span className="font-mono">{row.serial || '—'}</span> },
  { key: 'distancia', label: 'Dist (m)', render: row => row.distancia?.toLocaleString('pt-BR') ?? '—' },
  { key: 'status', label: 'Status', render: row => <span className={row.status.toLocaleLowerCase('pt-BR') !== 'online' ? 'font-semibold text-red' : ''}>{row.status}</span> },
  { key: 'situacao', label: 'Situação', render: row => row.situacao }, { key: 'causa', label: 'Causa', render: row => row.causa },
]

export function SignalTable({ rows, onOpen }: { rows: SignalRow[]; onOpen: (detail: DetailState) => void }) {
  const [sortKey, setSortKey] = useState<SignalSortKey>('rx')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / 60))
  useEffect(() => setPage(0), [rows])
  const sorted = useMemo(() => sortSignals(rows, sortKey, sortDir), [rows, sortKey, sortDir])
  const visible = sorted.slice(page * 60, page * 60 + 60)

  function changeSort(key: SignalSortKey) {
    if (key === sortKey) setSortDir(value => value === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(0)
  }

  return <Panel title="Detalhamento das ONUs" hint={`${rows.length.toLocaleString('pt-BR')} registros · clique no cabeçalho para ordenar`}>
    <div className="-mx-4 -mb-4 overflow-x-auto">
      <table className="w-full min-w-[1800px] text-label"><thead className="border-y border-border bg-surface/20"><tr>{TABLE_COLUMNS.map(column => (
        <th key={column.key} aria-sort={sortKey === column.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-muted">
          <button onClick={() => changeSort(column.key)} className="flex items-center gap-1 whitespace-nowrap hover:text-text">{column.label}{sortKey === column.key && (sortDir === 'asc' ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}</button>
        </th>
      ))}</tr></thead><tbody className="divide-y divide-border">{visible.map((row, index) => (
        <tr key={`${row.olt}-${row.pon}-${row.onu}-${index}`} onClick={() => onOpen({ title: `ONU ${row.onu || '—'} · ${row.cliente}`, subtitle: 'Registro individual selecionado na tabela.', rows: [row] })} className="cursor-pointer text-secondary hover:bg-surface/20">
          {TABLE_COLUMNS.map(column => <td key={column.key} className="whitespace-nowrap px-3 py-2.5">{column.render(row)}</td>)}
        </tr>
      ))}</tbody></table>
      {!rows.length && <p className="py-12 text-center text-label text-muted">Nenhum registro para os filtros selecionados.</p>}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-caption text-muted"><span>{rows.length ? `${page * 60 + 1}–${Math.min(rows.length, page * 60 + 60)} de ${rows.length.toLocaleString('pt-BR')} · página ${page + 1}/${pages}` : '0 registros'}</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(0)}>‹‹</Button><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => setPage(value => value + 1)}>Próxima</Button><Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>››</Button></div></div>
    </div>
  </Panel>
}
