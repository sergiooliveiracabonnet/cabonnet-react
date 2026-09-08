import { useMemo, useState } from 'react'
import { ArrowUUpLeft, Broadcast, CheckCircle, MagnifyingGlass, Repeat, WarningCircle, X } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { treatedSummary, type TreatedPon } from './ponTreatments'

interface PonsTratadasProps {
  treated: TreatedPon[]
  /** Sem CSV carregado não dá para dizer se a PON normalizou — só o histórico. */
  hasCsv: boolean
  onReopen: (item: TreatedPon) => void
  busyKey: string
}

const options = (values: string[]) => [...new Set(values.filter(value => value && value !== '—'))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(value => ({ value, label: value }))

const formatMoment = (value: string) => {
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function PonsTratadas({ treated, hasCsv, onReopen, busyKey }: PonsTratadasProps) {
  const [situacao, setSituacao] = useState('')
  const [cidade, setCidade] = useState('')
  const [olt, setOlt] = useState('')
  const [query, setQuery] = useState('')

  const summary = useMemo(() => treatedSummary(treated), [treated])
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return treated.filter(item => {
      if (situacao === 'criticas' && !item.aindaCritica) return false
      if (situacao === 'normalizadas' && item.aindaCritica) return false
      if (situacao === 'reincidentes' && !item.reopened_count) return false
      if (cidade && item.snapshot.cidade !== cidade) return false
      if (olt && item.snapshot.olt !== olt) return false
      if (normalized && ![item.snapshot.pon, item.snapshot.olt, item.snapshot.bairro, item.created_by]
        .join(' ').toLocaleLowerCase('pt-BR').includes(normalized)) return false
      return true
    })
  }, [treated, situacao, cidade, olt, query])
  const hasFilters = Boolean(situacao || cidade || olt || query)

  return <div className="space-y-4">
    <PageHeader title="PONs tratadas" icon={CheckCircle}
      description="PONs que saíram da pendência por confirmação manual — só voltam se você reabrir" />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard title="Tratadas" value={summary.total} sub="fora da fila de pendência" tone="ok" icon={CheckCircle} />
      <StatCard title="Ainda críticas" value={summary.aindaCriticas} tone={summary.aindaCriticas ? 'critical' : 'neutral'} icon={WarningCircle}
        sub={hasCsv ? 'batem o critério no CSV atual' : 'sem CSV carregado'} />
      <StatCard title="Normalizadas" value={summary.normalizadas} tone="ok" icon={Broadcast}
        sub={hasCsv ? 'saíram do critério no CSV atual' : 'sem CSV carregado'} />
      <StatCard title="Reincidentes" value={summary.reincidentes} sub="já foram reabertas ao menos uma vez" tone="warning" icon={Repeat} />
    </div>

    {!treated.length ? <Card><EmptyState icon={CheckCircle} title="Nenhuma PON tratada ainda"
      description="Marque uma PON como tratada no painel de hotspots da aba Análise de sinal e ela aparece aqui." /></Card> : <>
      <Card className="p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative"><span className="sr-only">Buscar PONs tratadas</span>
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="PON, OLT, bairro, responsável…"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-label text-text outline-none placeholder:text-muted focus:border-primary/50" />
          </label>
          <FilterSelect ariaLabel="Filtrar por situação" value={situacao} onChange={setSituacao} placeholder="Todas as situações"
            options={[{ value: 'criticas', label: 'Ainda críticas' }, { value: 'normalizadas', label: 'Normalizadas' }, { value: 'reincidentes', label: 'Reincidentes' }]} />
          <FilterSelect ariaLabel="Filtrar por cidade" value={cidade} onChange={value => { setCidade(value); setOlt('') }}
            placeholder="Todas as cidades" options={options(treated.map(item => item.snapshot.cidade))} />
          <FilterSelect ariaLabel="Filtrar por OLT" value={olt} onChange={setOlt} placeholder="Todas as OLTs"
            options={options(treated.filter(item => !cidade || item.snapshot.cidade === cidade).map(item => item.snapshot.olt))} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="text-caption text-muted">{visible.length} de {treated.length} PONs</span>
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => { setSituacao(''); setCidade(''); setOlt(''); setQuery('') }}><X size={13} /> Limpar filtros</Button>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-body font-semibold text-text">Histórico de tratativas por PON</h2>
          <p className="mt-0.5 text-caption text-muted">Os números são a foto do momento do OK, confrontada com o CSV carregado agora.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left text-label">
            <thead className="bg-surface/70 text-caption uppercase tracking-wide text-muted"><tr>
              {['PON / OLT', 'Cidade / bairro', 'No momento do OK', 'Tratada em', 'Ciclos', 'Situação no CSV atual', 'Ação'].map(label =>
                <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(item => <tr key={item.pon_key} className="border-t border-border transition-colors hover:bg-surface/50">
              <td className="px-4 py-3 font-mono"><span className="block font-semibold text-text">{item.snapshot.pon}</span><span className="text-caption text-muted">{item.snapshot.olt}</span></td>
              <td className="px-4 py-3"><span className="block text-text">{item.snapshot.cidade}</span><span className="text-caption text-muted">{item.snapshot.bairro}</span></td>
              <td className="px-4 py-3 tabular-nums text-secondary">
                <span className="block"><b className="text-red">{item.snapshot.criticos}</b> críticas de {item.snapshot.total} · {(item.snapshot.concentracao * 100).toFixed(0)}%</span>
                <span className="text-caption text-muted">RX med. {item.snapshot.rxMediano?.toFixed(1) ?? '—'}{item.snapshot.tempMax != null ? ` · ${item.snapshot.tempMax.toFixed(0)}°C máx` : ''}</span>
              </td>
              <td className="px-4 py-3 text-secondary"><span className="block">{formatMoment(item.created_at)}</span><span className="text-caption text-muted">{item.created_by || 'sem usuário'}</span></td>
              <td className="px-4 py-3 tabular-nums text-secondary">{item.treated_count}× tratada{item.reopened_count ? <span className="block text-caption text-orange">{item.reopened_count}× reaberta</span> : null}</td>
              <td className="px-4 py-3">{!hasCsv
                ? <span className="text-caption text-muted">sem CSV carregado</span>
                : item.aindaCritica
                  ? <Badge variant="red">Ainda crítica{item.atual ? ` · ${item.atual.criticos} críticas` : ''}</Badge>
                  : <Badge variant="green">Normalizada</Badge>}</td>
              <td className="px-4 py-3"><Button variant="ghost" size="sm" disabled={busyKey === item.pon_key}
                aria-label={`Reabrir PON ${item.snapshot.pon} da ${item.snapshot.olt}`}
                onClick={() => onReopen(item)}><ArrowUUpLeft size={13} /> Reabrir</Button></td>
            </tr>)}
            {!visible.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted">Nenhuma PON corresponde aos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>}
  </div>
}
