import { useMemo, useState, type FormEvent } from 'react'
import { ChartBar, CheckCircle, ClipboardText, Wrench } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { OCCURRENCE_STATUSES as STATUSES, type OccurrenceStatus, type SignalOccurrence } from './signalOccurrenceModel'

const STATUS_STYLE: Record<OccurrenceStatus, string> = {
  'Aberto': 'border-red/25 bg-red/10 text-red',
  'Em atendimento': 'border-orange/25 bg-orange/10 text-orange',
  'Aguardando material': 'border-purple/25 bg-purple/10 text-purple',
  'Concluído': 'border-green/25 bg-green/10 text-green',
}

function SignalBadge({ status }: { status: OccurrenceStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-caption font-semibold ${STATUS_STYLE[status]}`}>{status}</span>
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={`grid gap-1.5 text-label font-semibold text-secondary ${full ? 'sm:col-span-2' : ''}`}><span>{label}</span>{children}</label>
}

const inputClass = 'h-10 w-full rounded-lg border border-border bg-surface px-3 text-body text-text outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15'

interface OcorrenciasSinalProps { occurrences: SignalOccurrence[]; onChange: (occurrences: SignalOccurrence[]) => void }

export function OcorrenciasSinal({ occurrences, onChange }: OcorrenciasSinalProps) {
  const [filter, setFilter] = useState('Todos')
  const [selected, setSelected] = useState<SignalOccurrence | null>(null)
  const sorted = useMemo(() => [...occurrences].sort((a, b) => b.date.localeCompare(a.date)), [occurrences])
  const visible = filter === 'Todos' ? sorted : sorted.filter(item => item.status === filter)
  const concluded = occurrences.filter(item => item.status === 'Concluído').length
  const open = occurrences.length - concluded
  const inWork = occurrences.filter(item => item.status === 'Em atendimento').length
  const improvements = occurrences.filter(item => item.after != null).map(item => (item.after as number) - item.before)
  const average = improvements.length ? improvements.reduce((sum, item) => sum + item, 0) / improvements.length : null
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (6 - index))
    const key = date.toISOString().slice(0, 10)
    return { key, label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', ''), count: occurrences.filter(item => item.date === key).length }
  }), [occurrences])
  const maxDay = Math.max(1, ...days.map(day => day.count))

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!selected) return
    const status = String(form.get('status')) as OccurrenceStatus
    const updated = occurrences.map(item => item.id === selected.id ? {
      ...item, status, after: form.get('after') === '' ? null : Number(form.get('after')),
      team: String(form.get('team')).trim(), note: String(form.get('note')).trim(),
      updatedAt: new Date().toISOString().slice(0, 10), resolution: status === 'Concluído' ? 'Tratativa manual' : '',
    } : item)
    onChange(updated); setSelected(null)
  }

  return <div className="space-y-4">
    <PageHeader title="Controle de Ocorrências de Sinal" description="Ocorrências criadas automaticamente a partir do CSV e mantidas até a normalização" icon={ClipboardText} />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard title="Backlog ativo" value={open} sub={`${occurrences.filter(item => item.severity === 'Crítico' && item.status !== 'Concluído').length} críticas`} tone={open ? 'critical' : 'neutral'} icon={ClipboardText} />
      <StatCard title="Em atendimento" value={inWork} sub="aguardando conclusão" tone="warning" icon={Wrench} />
      <StatCard title="Concluídas" value={concluded} sub={`${occurrences.length ? Math.round(concluded / occurrences.length * 100) : 0}% de resolução`} tone="ok" icon={CheckCircle} />
      <StatCard title="Melhora média" value={average == null ? '—' : `${average.toFixed(1)} dB`} sub="após a tratativa" tone="info" icon={ChartBar} />
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.45fr_.8fr]">
      <Card className="p-5"><div className="mb-5 flex items-center justify-between"><h2 className="text-body font-semibold text-text">Volume de ocorrências</h2><span className="text-caption text-muted">últimos 7 dias</span></div>
        <div className="flex h-48 items-end gap-2 border-b border-border px-1 sm:gap-4">{days.map(day => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-caption font-semibold text-muted">{day.count || ''}</span><div title={`${day.count} ocorrência(s)`} className="w-full max-w-12 rounded-t-md bg-primary/80 transition-colors hover:bg-primary" style={{ height: `${Math.max(5, day.count / maxDay * 130)}px` }} /><span className="mb-2 truncate text-caption capitalize text-muted">{day.label}</span></div>)}</div>
      </Card>
      <Card className="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-body font-semibold text-text">Situação atual</h2><span className="text-caption text-muted">ao vivo</span></div>{STATUSES.map(status => <div key={status} className="flex items-center justify-between border-b border-border py-3 last:border-0"><SignalBadge status={status} /><strong className="text-subtitle text-text">{occurrences.filter(item => item.status === status).length}</strong></div>)}</Card>
    </div>

    <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-body font-semibold text-text">Ocorrências recentes</h2><p className="mt-0.5 text-caption text-muted">Dados armazenados somente neste navegador</p></div><FilterSelect ariaLabel="Filtrar por status" value={filter === 'Todos' ? '' : filter} onChange={value => setFilter(value || 'Todos')} placeholder="Todos os status" options={STATUSES.map(status => ({ value: status, label: status }))} className="min-w-48" /></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-label"><thead className="bg-surface/70 text-caption uppercase tracking-wide text-muted"><tr>{['Detecção', 'Cliente / ponto', 'OLT / PON / ONU', 'Cidade / bairro', 'Severidade', 'Sinal', 'Equipe', 'Status', 'Ação'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{visible.map(item => <tr key={item.id} className="border-t border-border transition-colors hover:bg-surface/50"><td className="px-4 py-3 text-muted"><span className="block">{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}</span><span className="text-caption">{item.detections} leitura(s){item.missedSnapshots ? ` · ${item.missedSnapshots} ausente(s)` : ''}</span></td><td className="px-4 py-3 font-semibold text-text">{item.client}</td><td className="px-4 py-3 font-mono text-caption text-secondary"><span className="block">{item.olt}</span><span>{item.pon} · ONU {item.onu || '—'}</span></td><td className="px-4 py-3"><span className="block text-text">{item.city}</span><span className="text-caption text-muted">{item.region}</span></td><td className={`px-4 py-3 font-semibold ${item.severity === 'Crítico' ? 'text-red' : 'text-orange'}`}>{item.severity}</td><td className="px-4 py-3 font-mono text-text">{item.before.toFixed(1)}{item.after != null ? <span className="text-green"> → {item.after.toFixed(1)}</span> : item.current !== item.before ? <span className="text-orange"> → {item.current.toFixed(1)}</span> : null}</td><td className="px-4 py-3 text-secondary">{item.team || '—'}</td><td className="px-4 py-3"><SignalBadge status={item.status} /></td><td className="px-4 py-3"><Button variant="ghost" size="sm" aria-label={`Registrar tratativa de ${item.client}`} onClick={() => setSelected(item)}>Tratar</Button></td></tr>)}{!visible.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-muted">{occurrences.length ? 'Nenhuma ocorrência encontrada para este status.' : 'Nenhuma ocorrência registrada.'}</td></tr>}</tbody></table></div>
    </Card>

    <Modal open={!!selected} onClose={() => setSelected(null)} title="Registrar tratativa" subtitle={selected ? `${selected.client} · leitura inicial ${selected.before.toFixed(1)} dBm` : ''} maxWidth="620px">{selected && <form key={selected.id} onSubmit={save} className="p-6"><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Status"><select className={inputClass} name="status" defaultValue={selected.status}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></Field>
      <Field label="Equipe responsável"><input className={inputClass} name="team" defaultValue={selected.team} placeholder="Ex.: Equipe 02" /></Field>
      <Field label="Sinal após tratativa (dBm)"><input className={inputClass} type="number" step="0.01" name="after" defaultValue={selected.after ?? ''} placeholder="-20.00" /></Field>
      <Field label="Tratativa realizada" full><textarea className={`${inputClass} h-24 resize-y py-2`} name="note" defaultValue={selected.note} required placeholder="Descreva a correção realizada." /></Field>
    </div><div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setSelected(null)}>Cancelar</Button><Button type="submit">Salvar tratativa</Button></div></form>}</Modal>
  </div>
}
