import { useMemo, useState, type FormEvent } from 'react'
import { ChartBar, CheckCircle, ClipboardText, Plus, Wrench } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { storage } from '../../lib/storage'

const STORAGE_KEY = 'cabonnet-sinal-ocorrencias'
const CITIES = ['São José dos Campos', 'Caçapava', 'Taubaté', 'Tremembé', 'Pindamonhangaba'] as const
const STATUSES = ['Aberto', 'Em atendimento', 'Aguardando material', 'Concluído'] as const
type OccurrenceStatus = typeof STATUSES[number]

interface SignalOccurrence {
  id: string
  date: string
  client: string
  city: typeof CITIES[number]
  region: string
  before: number
  after: number | null
  team: string
  status: OccurrenceStatus
  note: string
}

const today = () => new Date().toISOString().slice(0, 10)
const INITIAL: SignalOccurrence[] = [
  { id: 'demo-1', date: '2026-08-11', client: 'Cliente Marcos — CTO 12', city: 'São José dos Campos', region: 'Jardim Europa', before: -28.5, after: -20.1, team: 'Equipe 03', status: 'Em atendimento', note: '' },
  { id: 'demo-2', date: '2026-08-10', client: 'Residencial Horizonte — CTO 04', city: 'Taubaté', region: 'Centro', before: -30.2, after: -21.4, team: 'Equipe 01', status: 'Concluído', note: '' },
  { id: 'demo-3', date: '2026-08-10', client: 'Cliente Ana — CTO 07', city: 'Caçapava', region: 'Vila Nova', before: -27.8, after: null, team: 'Equipe 02', status: 'Aberto', note: '' },
  { id: 'demo-4', date: '2026-08-09', client: 'Condomínio Ipê — CTO 21', city: 'Pindamonhangaba', region: 'Centro', before: -29.1, after: -22.2, team: 'Equipe 04', status: 'Concluído', note: '' },
]

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

export function OcorrenciasSinal() {
  const [occurrences, setOccurrences] = useState<SignalOccurrence[]>(() => storage.getJSON(STORAGE_KEY, INITIAL))
  const [filter, setFilter] = useState('Todos')
  const [modalOpen, setModalOpen] = useState(false)
  const sorted = useMemo(() => [...occurrences].sort((a, b) => b.date.localeCompare(a.date)), [occurrences])
  const visible = filter === 'Todos' ? sorted : sorted.filter(item => item.status === filter)
  const concluded = occurrences.filter(item => item.status === 'Concluído').length
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
    const next: SignalOccurrence = {
      id: crypto.randomUUID(), date: String(form.get('date')), client: String(form.get('client')).trim(),
      city: String(form.get('city')) as SignalOccurrence['city'], region: String(form.get('region')).trim(),
      before: Number(form.get('before')), after: form.get('after') === '' ? null : Number(form.get('after')),
      team: String(form.get('team')).trim(), status: String(form.get('status')) as OccurrenceStatus, note: String(form.get('note')).trim(),
    }
    const updated = [next, ...occurrences]
    setOccurrences(updated); storage.setJSON(STORAGE_KEY, updated); setModalOpen(false)
  }

  return <div className="space-y-4">
    <PageHeader title="Controle de Ocorrências de Sinal" description="Registro e acompanhamento das tratativas de potência óptica" icon={ClipboardText}
      actions={<Button onClick={() => setModalOpen(true)}><Plus size={15} /> Nova ocorrência</Button>} />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard title="Ocorrências registradas" value={occurrences.length} sub="no histórico local" icon={ClipboardText} />
      <StatCard title="Em atendimento" value={inWork} sub="aguardando conclusão" tone="warning" icon={Wrench} />
      <StatCard title="Concluídas" value={concluded} sub={`${occurrences.length ? Math.round(concluded / occurrences.length * 100) : 0}% de resolução`} tone="success" icon={CheckCircle} />
      <StatCard title="Melhora média" value={average == null ? '—' : `${average.toFixed(1)} dB`} sub="após a tratativa" tone="info" icon={ChartBar} />
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.45fr_.8fr]">
      <Card className="p-5"><div className="mb-5 flex items-center justify-between"><h2 className="text-body font-semibold text-text">Volume de ocorrências</h2><span className="text-caption text-muted">últimos 7 dias</span></div>
        <div className="flex h-48 items-end gap-2 border-b border-border px-1 sm:gap-4">{days.map(day => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-caption font-semibold text-muted">{day.count || ''}</span><div title={`${day.count} ocorrência(s)`} className="w-full max-w-12 rounded-t-md bg-primary/80 transition-colors hover:bg-primary" style={{ height: `${Math.max(5, day.count / maxDay * 130)}px` }} /><span className="mb-2 truncate text-caption capitalize text-muted">{day.label}</span></div>)}</div>
      </Card>
      <Card className="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-body font-semibold text-text">Situação atual</h2><span className="text-caption text-muted">ao vivo</span></div>{STATUSES.map(status => <div key={status} className="flex items-center justify-between border-b border-border py-3 last:border-0"><SignalBadge status={status} /><strong className="text-subtitle text-text">{occurrences.filter(item => item.status === status).length}</strong></div>)}</Card>
    </div>

    <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-body font-semibold text-text">Ocorrências recentes</h2><p className="mt-0.5 text-caption text-muted">Dados armazenados somente neste navegador</p></div><FilterSelect ariaLabel="Filtrar por status" value={filter === 'Todos' ? '' : filter} onChange={value => setFilter(value || 'Todos')} placeholder="Todos os status" options={STATUSES.map(status => ({ value: status, label: status }))} className="min-w-48" /></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-label"><thead className="bg-surface/70 text-caption uppercase tracking-wide text-muted"><tr>{['Data', 'Cliente / ponto', 'Cidade / bairro', 'Sinal', 'Equipe', 'Status'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{visible.map(item => <tr key={item.id} className="border-t border-border transition-colors hover:bg-surface/50"><td className="px-4 py-3 text-muted">{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="px-4 py-3 font-semibold text-text">{item.client}</td><td className="px-4 py-3"><span className="block text-text">{item.city}</span><span className="text-caption text-muted">{item.region}</span></td><td className="px-4 py-3 font-mono text-text">{item.before.toFixed(1)}{item.after != null && <span className="text-green"> → {item.after.toFixed(1)}</span>}</td><td className="px-4 py-3 text-secondary">{item.team || '—'}</td><td className="px-4 py-3"><SignalBadge status={item.status} /></td></tr>)}{!visible.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">Nenhuma ocorrência encontrada para este status.</td></tr>}</tbody></table></div>
    </Card>

    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar ocorrência" subtitle="Informe a leitura e a tratativa do ponto" maxWidth="680px"><form onSubmit={save} className="p-6"><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Data"><input className={inputClass} required type="date" name="date" defaultValue={today()} /></Field>
      <Field label="Status"><select className={inputClass} name="status" defaultValue="Aberto">{STATUSES.map(status => <option key={status}>{status}</option>)}</select></Field>
      <Field label="Cliente / ponto"><input className={inputClass} required name="client" placeholder="Ex.: Cliente João — CTO 04" /></Field>
      <Field label="Cidade"><select className={inputClass} required name="city" defaultValue=""><option value="" disabled>Selecione a cidade</option>{CITIES.map(city => <option key={city}>{city}</option>)}</select></Field>
      <Field label="Bairro"><input className={inputClass} required name="region" placeholder="Ex.: Centro" /></Field>
      <Field label="Equipe responsável"><input className={inputClass} name="team" placeholder="Ex.: Equipe 02" /></Field>
      <Field label="Sinal antes (dBm)"><input className={inputClass} required type="number" step="0.01" name="before" placeholder="-27.50" /></Field>
      <Field label="Sinal depois (dBm)"><input className={inputClass} type="number" step="0.01" name="after" placeholder="-20.00" /></Field>
      <Field label="Tratativa realizada" full><textarea className={`${inputClass} h-24 resize-y py-2`} name="note" placeholder="Descreva brevemente a correção." /></Field>
    </div><div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit">Salvar ocorrência</Button></div></form></Modal>
  </div>
}
