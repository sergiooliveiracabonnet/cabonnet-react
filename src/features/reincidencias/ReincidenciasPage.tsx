import { useMemo, useState } from 'react'
import { Brain, CaretDown, CaretRight, FilePdf, Funnel, House, MapPin, UserMinus, Wrench } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { TabBar } from '../../components/ui/TabBar'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useUIStore } from '../../store/uiStore'
import { buildInstallChurn, buildManutencaoRevisitaChurn, coorteInstalacaoRange } from '../../lib/builders/churn'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { aiPairKey, useAIReincidencias } from '../../hooks/useAIReincidencias'
import { useReincidenciaDetails } from '../../hooks/useReincidenciaDetails'
import { buildBairroSummary, buildIntervalDistribution, periodoAnterior, buildReincidenciaPairs, buildTeamRecurrenceRanking, filterReincidentes, getOSObservation, mergeOSObservations, sortedClientRows } from './reincidenciasReport'
import { exportReincidenciasPDF } from './reincidenciasPDF'
import { ReincidenciasCharts } from './ReincidenciasCharts'
import { BairroModal, BairrosCard } from './ReincidenciasBairros'
import { exportBairrosPDF } from './reincidenciasBairroPDF'
import { ReincidenciasAIPanel } from './ReincidenciasAIPanel'

const FORNECEDORES = ['WES', 'Instacable', 'THM', 'REDE', 'MANUTENCAO', 'INTERNO', 'OUTRO']

type AbaRevisita = 'manutencao' | 'instalacao'

const ABA_CONFIG: Record<AbaRevisita, {
  label: string; tipoBase: 'MANUTENCAO' | 'INSTALACAO'; reportType: string
  descricaoJanela: (dias: number) => string; kpiOrdens: string; kpiIntervalo: string
}> = {
  manutencao: {
    label: 'Revisita de manutenção', tipoBase: 'MANUTENCAO', reportType: 'Relatório de Reincidências — Manutenção',
    descricaoJanela: dias => `Assistências abertas em até 30 dias após outra assistência do cliente, nos últimos ${dias} dias`,
    kpiOrdens: 'origem + retorno de cada cliente', kpiIntervalo: 'até o retorno',
  },
  instalacao: {
    label: 'Revisita de instalação', tipoBase: 'INSTALACAO', reportType: 'Relatório de Reincidências — Instalação',
    descricaoJanela: dias => `Clientes instalados no mês anterior ao período, com assistência em até 30 dias da instalação (período de ${dias} dias)`,
    kpiOrdens: 'instalação + assistências do cliente', kpiIntervalo: 'até o retorno',
  },
}

export default function ReincidenciasPage() {
  const { allRows, isLoading } = useOSDerived()
  const { dateFilter } = useUIStore()
  const [aba, setAba] = useState<AbaRevisita>('manutencao')
  const [fornecedor, setFornecedor] = useState('')
  const [equipe, setEquipe] = useState('')
  const [cidade, setCidade] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [bairroSel, setBairroSel] = useState<string | null>(null)
  const [aiEnabled, setAIEnabled] = useState(false)
  const cfg = ABA_CONFIG[aba]
  const range = useMemo(() => (dateFilter.from && dateFilter.to ? { from: dateFilter.from, to: dateFilter.to } : null), [dateFilter.from, dateFilter.to])
  const construir = aba === 'instalacao' ? buildInstallChurn : buildManutencaoRevisitaChurn
  const churn = useMemo(() => construir(allRows, Number.POSITIVE_INFINITY, new Date(), range), [allRows, range, construir])
  const churnAnterior = useMemo(
    () => (range ? construir(allRows, Number.POSITIVE_INFINITY, new Date(), periodoAnterior(range)) : null),
    [allRows, range, construir],
  )
  const reportOSNumbers = useMemo(() => [...new Set(churn.clientes.flatMap(c => c.rows.map(r => r.numos)))], [churn.clientes])
  const { data: observations, isLoading: observationsLoading, isError: observationsError } = useReincidenciaDetails(reportOSNumbers)
  const detailedClients = useMemo(() => mergeOSObservations(churn.clientes, observations), [churn.clientes, observations])
  const equipes = useMemo(() => [...new Set(churn.clientes.flatMap(c => c.rows.map(r => shortEquipe(r.nomedaequipe).split(' - ')[0])))].filter(v => v && v !== '—').sort(), [churn.clientes])
  const cidades = useMemo(() => [...new Set(churn.clientes.flatMap(c => c.rows.map(r => r.nomedacidade)))].filter((v): v is string => Boolean(v)).sort(), [churn.clientes])
  const clientes = useMemo(() => filterReincidentes(detailedClients, { fornecedor, equipe, cidade }), [detailedClients, fornecedor, equipe, cidade])
  const pares = useMemo(() => buildReincidenciaPairs(clientes), [clientes])
  const filteredBaseRows = useMemo(() => allRows.filter(row =>
    (!fornecedor || row._fornecedor === fornecedor) &&
    (!equipe || shortEquipe(row.nomedaequipe).startsWith(equipe)) &&
    (!cidade || row.nomedacidade === cidade),
  ), [allRows, fornecedor, equipe, cidade])
  const teamRanking = useMemo(() => buildTeamRecurrenceRanking(clientes, filteredBaseRows, new Date(), aba === 'instalacao' && range ? coorteInstalacaoRange(range) : range, cfg.tipoBase), [clientes, filteredBaseRows, range, cfg.tipoBase, aba])
  const intervals = useMemo(() => buildIntervalDistribution(pares), [pares])
  const baseFiltrada = useMemo(() => filterReincidentes(churn.baseClientes ?? [], { fornecedor, equipe, cidade }), [churn.baseClientes, fornecedor, equipe, cidade])
  const anteriorFiltrado = useMemo(() => (churnAnterior ? filterReincidentes(churnAnterior.clientes, { fornecedor, equipe, cidade }) : undefined), [churnAnterior, fornecedor, equipe, cidade])
  const bairros = useMemo(() => buildBairroSummary(clientes, { base: baseFiltrada, anterior: anteriorFiltrado }), [clientes, baseFiltrada, anteriorFiltrado])
  const filtros = useMemo(() => [
    fornecedor ? `Terceira: ${fornecedor}` : 'Todas as terceiras',
    equipe ? `Equipe: ${equipe}` : 'Todas as equipes',
    cidade ? `Cidade: ${cidade}` : 'Todas as cidades',
  ], [fornecedor, equipe, cidade])
  const contexto = useMemo(() => ({ janelaDias: churn.janelaDias, filtros: filtros.join(' · ') }), [churn.janelaDias, filtros])
  const { data: analysis, isFetching: aiLoading, isError: aiError, errorMessage } = useAIReincidencias(pares, aiEnabled, contexto)
  const osCount = clientes.reduce((sum, c) => sum + c.rows.length, 0)
  const avgGap = clientes.length ? Math.round(clientes.reduce((sum, c) => sum + c.intervaloMedio, 0) / clientes.length * 10) / 10 : 0
  const resetAI = (setter: (value: string) => void) => (value: string) => { setter(value); setAIEnabled(false) }
  const trocarAba = (id: string) => {
    setAba(id as AbaRevisita)
    setFornecedor(''); setEquipe(''); setCidade(''); setExpanded(null); setBairroSel(null); setAIEnabled(false)
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader title="Relatório de Reincidências" icon={UserMinus}
        description={`${cfg.descricaoJanela(churn.janelaDias)}${range ? ` (${range.from.toLocaleDateString('pt-BR')} a ${range.to.toLocaleDateString('pt-BR')})` : ''} · análise auditável por cliente`}
        actions={<div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!bairros.length}
            onClick={() => exportBairrosPDF(bairros, { tipo: cfg.label, filtros, periodo: range ? `${range.from.toLocaleDateString('pt-BR')} a ${range.to.toLocaleDateString('pt-BR')}` : '', totalBase: baseFiltrada.length, totalOSAnterior: anteriorFiltrado ? anteriorFiltrado.reduce((sum, c) => sum + c.rows.length, 0) : null })}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-label font-semibold text-text transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <MapPin size={17} /> Exportar por bairro
          </button>
          <button type="button" disabled={!clientes.length} onClick={() => exportReincidenciasPDF(clientes, filtros, analysis, cfg.reportType)}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-label font-semibold text-white transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <FilePdf size={17} /> Exportar PDF
          </button>
        </div>}
      />

      <TabBar
        tabs={[
          { id: 'manutencao', label: ABA_CONFIG.manutencao.label, icon: Wrench },
          { id: 'instalacao', label: ABA_CONFIG.instalacao.label, icon: House },
        ]}
        active={aba}
        onChange={trocarAba}
      />

      <section aria-label="Filtros do relatório" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <Funnel size={18} className="mb-3 text-muted" />
        <Filter label="Terceira" value={fornecedor} onChange={resetAI(setFornecedor)} options={FORNECEDORES} all="Todas as terceiras" />
        <Filter label="Equipe" value={equipe} onChange={resetAI(setEquipe)} options={equipes} all="Todas as equipes" />
        <Filter label="Cidade" value={cidade} onChange={resetAI(setCidade)} options={cidades} all="Todas as cidades" />
        {(fornecedor || equipe || cidade) && <button type="button" onClick={() => { setFornecedor(''); setEquipe(''); setCidade(''); setAIEnabled(false) }} className="min-h-11 cursor-pointer rounded-lg px-3 text-label font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Limpar filtros</button>}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Clientes reincidentes" value={clientes.length} detail={`${churn.totalBase} clientes na base`} />
        <KPI label="OS envolvidas" value={osCount} detail={cfg.kpiOrdens} />
        <KPI label="Intervalo médio" value={`${avgGap.toLocaleString('pt-BR')}d`} detail={cfg.kpiIntervalo} />
        <KPI label="Taxa geral" value={`${churn.pctReincidencia}%`} detail="da base atendida" />
      </div>

      <ReincidenciasCharts ranking={teamRanking} intervals={intervals} analysis={analysis} />

      <BairrosCard tipo={cfg.label} resumo={bairros} onOpen={setBairroSel} />
      <BairroModal tipo={cfg.label} resumo={bairros} selectedKey={bairroSel} onSelect={setBairroSel} onClose={() => setBairroSel(null)} />

      <ReincidenciasAIPanel analysis={analysis} parCount={pares.length} aiLoading={aiLoading}
        observationsLoading={observationsLoading} observationsError={observationsError}
        aiError={aiError} errorMessage={errorMessage} onGenerate={() => setAIEnabled(true)} />

      <section className="space-y-3" aria-label="Clientes e ordens reincidentes">
        {isLoading && <p className="rounded-xl border border-border bg-card p-6 text-secondary">Carregando ordens…</p>}
        {!isLoading && !clientes.length && <p className="rounded-xl border border-border bg-card p-6 text-secondary">Nenhuma reincidência encontrada para os filtros selecionados.</p>}
        {clientes.map(cliente => {
          const open = expanded === cliente.chave
          return <article key={cliente.chave} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : cliente.chave)} className="grid min-h-14 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60">
              {open ? <CaretDown size={17} /> : <CaretRight size={17} />}<span className="min-w-0"><b className="block truncate text-body text-text">{cliente.cliente}</b><span className="block truncate text-caption text-secondary">{cliente.cidade}{cliente.bairro ? ` · ${cliente.bairro}` : ''}</span></span><span className="text-right tabular-nums"><b className="block text-orange">{cliente.visitas} visitas</b><span className="text-caption text-muted">média {cliente.intervaloMedio.toLocaleString('pt-BR')}d</span></span>
            </button>
            {open && <div className="border-t border-border p-3 sm:p-4"><div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-left text-label"><thead><tr className="text-caption uppercase tracking-wide text-muted">{['Data da OS', 'OS', 'Terceira', 'Equipe', 'Serviço', 'Observação da OS'].map(h => <th key={h} className="border-b border-border px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{sortedClientRows(cliente.rows).flatMap((row, index, rows) => {
              const next = rows[index + 1]
              const diagnostico = next ? analysis?.porPar[aiPairKey(row.numos, next.numos)] : undefined
              return [
                <tr key={row.numos} className="align-top hover:bg-elevated/60"><td className="whitespace-nowrap border-b border-border/60 px-3 py-3 tabular-nums">{fmtDate(row.dataexecucao || row.databaixa) || '—'}</td><td className="border-b border-border/60 px-3 py-3 font-semibold text-primary">{row.numos}</td><td className="border-b border-border/60 px-3 py-3">{row._fornecedor || '—'}</td><td className="whitespace-nowrap border-b border-border/60 px-3 py-3">{shortEquipe(row.nomedaequipe)}</td><td className="max-w-[220px] border-b border-border/60 px-3 py-3">{String(row.servico || row.tiposervico || '—')}</td><td className="max-w-[360px] whitespace-pre-wrap border-b border-border/60 px-3 py-3 leading-relaxed text-secondary">{getOSObservation(row)}</td></tr>,
                diagnostico ? <tr key={`${row.numos}-ia`} className="bg-primary/5"><td colSpan={6} className="border-b border-border/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary"><Brain size={12} /> {diagnostico.causa}</span>
                    <span className="text-caption tabular-nums text-muted">revisita {diagnostico.diasEntre}d depois · OS {diagnostico.numosRev}</span>
                  </div>
                  {diagnostico.feitoPrimeira && <p className="mt-1 text-caption leading-relaxed text-secondary"><span className="font-semibold text-muted">Feito nesta OS:</span> {diagnostico.feitoPrimeira}</p>}
                  {diagnostico.oQueFaltou && <p className="mt-0.5 text-caption leading-relaxed text-secondary"><span className="font-semibold text-muted">Faltou:</span> {diagnostico.oQueFaltou}</p>}
                </td></tr> : null,
              ]
            })}</tbody></table></div></div>}
          </article>
        })}
      </section>
    </div>
  )
}

function Filter({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: string[]; all: string }) {
  return <label className="flex min-w-[190px] flex-1 flex-col gap-1 text-caption font-semibold text-secondary sm:flex-none"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="min-h-11 cursor-pointer rounded-lg border border-border bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><option value="">{all}</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
}

function KPI({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-readout font-bold tabular-nums text-text">{value}</p><p className="text-caption text-secondary">{detail}</p></div>
}
