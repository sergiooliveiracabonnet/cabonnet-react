import { useMemo, useState } from 'react'
import { ArrowUUpLeft, Broadcast, CheckCircle, FilePdf, MagnifyingGlass, PencilSimple, Repeat, WarningCircle, WaveSine, X } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { medicoesProgresso, treatedSummary, type PonSituacao, type TreatedPon } from './ponTreatments'
import { PonsEfetividade } from './PonsEfetividade'
import { exportPonsTratadasPDF } from './ponsTratadasPDF'

const plural = (n: number, singular: string, plural: string) => n === 1 ? singular : plural

const situacaoBadge: Record<Exclude<PonSituacao, 'sem-dados'>, { label: string; variant: 'red' | 'orange' | 'green' }> = {
  critica: { label: 'Ainda crítica', variant: 'red' },
  atencao: { label: 'Em atenção', variant: 'orange' },
  normalizada: { label: 'Normalizada', variant: 'green' },
}

interface PonsTratadasProps {
  treated: TreatedPon[]
  onReopen: (item: TreatedPon) => void
  /** Abre o formulário de potências da PON — dá para completar o que ficou em branco. */
  onEditMedicoes: (item: TreatedPon) => void
  busyKey: string
}

const options = (values: string[]) => [...new Set(values.filter(value => value && value !== '—'))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(value => ({ value, label: value }))

const formatMoment = (value: string) => {
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function PonsTratadas({ treated, onReopen, onEditMedicoes, busyKey }: PonsTratadasProps) {
  const [situacao, setSituacao] = useState('')
  const [cidade, setCidade] = useState('')
  const [olt, setOlt] = useState('')
  const [query, setQuery] = useState('')

  const summary = useMemo(() => treatedSummary(treated), [treated])
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return treated.filter(item => {
      if (situacao === 'criticas' && item.situacao !== 'critica') return false
      if (situacao === 'atencao' && item.situacao !== 'atencao') return false
      if (situacao === 'normalizadas' && item.situacao !== 'normalizada') return false
      if (situacao === 'reincidentes' && !item.reopened_count) return false
      if (situacao === 'potencias' && !medicoesProgresso(item).pendentes) return false
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
      description="PONs que saíram da pendência por confirmação manual — só voltam se você reabrir"
      actions={<>
        <Button variant="ghost" disabled={!visible.length} onClick={() => exportPonsTratadasPDF(visible, 'resumido')}
          title="Uma linha por PON, em paisagem">
          <FilePdf size={15} /> PDF resumido
        </Button>
        <Button variant="ghost" disabled={!visible.length} onClick={() => exportPonsTratadasPDF(visible, 'detalhado')}
          title="Todos os clientes de cada PON e o gráfico antes × depois da manutenção">
          <FilePdf size={15} /> PDF detalhado
        </Button>
      </>} />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <StatCard palette="sinal" title="Tratadas" value={summary.total} sub="fora da fila de pendência" tone="ok" icon={CheckCircle} />
      <StatCard palette="sinal" title="Ainda críticas" value={summary.aindaCriticas} tone={summary.aindaCriticas ? 'critical' : 'neutral'} icon={WarningCircle}
        sub="têm cliente crítico pela Nova Potência" />
      <StatCard palette="sinal" title="Em atenção" value={summary.emAtencao} tone={summary.emAtencao ? 'warning' : 'neutral'} icon={WarningCircle}
        sub="sem crítico, mas com cliente em atenção" />
      <StatCard palette="sinal" title="Normalizadas" value={summary.normalizadas} tone="ok" icon={Broadcast}
        sub="nenhum cliente crítico ou em atenção" />
      <StatCard palette="sinal" title="Potências pendentes" value={summary.potenciasPendentes} sub="PONs com cliente ainda sem nova medição"
        tone={summary.potenciasPendentes ? 'warning' : 'ok'} icon={WaveSine} />
      <StatCard palette="sinal" title="Reincidentes" value={summary.reincidentes} sub="já foram reabertas ao menos uma vez" tone="warning" icon={Repeat} />
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
            options={[{ value: 'criticas', label: 'Ainda críticas' }, { value: 'atencao', label: 'Em atenção' }, { value: 'normalizadas', label: 'Normalizadas' }, { value: 'reincidentes', label: 'Reincidentes' }, { value: 'potencias', label: 'Com potência pendente' }]} />
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

      <PonsEfetividade treated={visible} />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-body font-semibold text-text">Histórico de tratativas por PON</h2>
          <p className="mt-0.5 text-caption text-muted">Os números são a foto do momento do OK; a situação atual cruza a Nova Potência de cada cliente (ou a de antes, para quem ainda não foi medido).</p>
        </div>
        <div className="overflow-x-auto">
          {/* min-w-max: as 8 colunas nunca se espremem e o wrapper rola. Melhor que
              um px fixo, que envelhece assim que uma coluna entra ou sai. */}
          <table className="w-full min-w-max text-left text-label">
            <thead className="bg-surface/70 text-caption uppercase tracking-wide text-muted"><tr>
              {['PON / OLT', 'Cidade / bairro', 'Inicialmente', 'Tratada em', 'Ciclos', 'Potências', 'Situação no CSV atual', 'Ações'].map(label =>
                <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(item => <tr key={item.pon_key} className="border-t border-border transition-colors hover:bg-surface/50">
              <td className="px-4 py-3 font-mono"><span className="block font-semibold text-text">{item.snapshot.pon}</span><span className="text-caption text-muted">{item.snapshot.olt}</span></td>
              <td className="px-4 py-3"><span className="block text-text">{item.snapshot.cidade}</span><span className="text-caption text-muted">{item.snapshot.bairro}</span></td>
              <td className="px-4 py-3 tabular-nums text-secondary">
                <span className="block"><b className="text-sinal-critico">{item.snapshot.criticos}</b> críticas de {item.snapshot.total} · {(item.snapshot.concentracao * 100).toFixed(0)}%</span>
                <span className="text-caption text-muted">RX med. {item.snapshot.rxMediano?.toFixed(1) ?? '—'}{item.snapshot.tempMax != null ? ` · ${item.snapshot.tempMax.toFixed(0)}°C máx` : ''}</span>
              </td>
              <td className="px-4 py-3 text-secondary"><span className="block">{formatMoment(item.created_at)}</span><span className="text-caption text-muted">{item.created_by || 'sem usuário'}</span></td>
              <td className="px-4 py-3 tabular-nums text-secondary">{item.treated_count}× tratada{item.reopened_count ? <span className="block text-caption text-sinal-atencao">{item.reopened_count}× reaberta</span> : null}</td>
              <td className="px-4 py-3">{medicoesProgresso(item).total
                ? <><span className="block tabular-nums text-text">{medicoesProgresso(item).preenchidas}/{medicoesProgresso(item).total} medidas</span>
                  {medicoesProgresso(item).pendentes
                    ? <span className="text-caption text-sinal-atencao">{medicoesProgresso(item).pendentes} sem potência</span>
                    : <span className="text-caption text-muted">cadastro completo</span>}</>
                : <span className="text-caption text-muted">sem clientes registrados</span>}</td>
              <td className="px-4 py-3">{item.situacao === 'sem-dados'
                ? <span className="text-caption text-muted">sem clientes registrados</span>
                : <><Badge variant={situacaoBadge[item.situacao].variant}>{situacaoBadge[item.situacao].label}</Badge>
                  <span className="mt-1 block text-caption text-muted">
                    {item.resumoSituacao.criticos} {plural(item.resumoSituacao.criticos, 'crítica', 'críticas')} · {item.resumoSituacao.atencao} atenção · {item.resumoSituacao.melhorados} {plural(item.resumoSituacao.melhorados, 'melhorada', 'melhoradas')}
                  </span></>}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" disabled={busyKey === item.pon_key}
                  aria-label={`Editar potências da PON ${item.snapshot.pon} da ${item.snapshot.olt}`}
                  onClick={() => onEditMedicoes(item)}><PencilSimple size={13} /> Potências</Button>
                <Button variant="ghost" size="sm" disabled={busyKey === item.pon_key}
                  aria-label={`Reabrir PON ${item.snapshot.pon} da ${item.snapshot.olt}`}
                  onClick={() => onReopen(item)}><ArrowUUpLeft size={13} /> Reabrir</Button>
              </div></td>
            </tr>)}
            {!visible.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted">Nenhuma PON corresponde aos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>}
  </div>
}
