import { useMemo, useState } from 'react'
import { Brain, CaretDown, CaretRight, FilePdf, Funnel, UserMinus } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useOSDerived } from '../../contexts/OSDataContext'
import { buildChurn } from '../../lib/builders/churn'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { useAIReincidencias } from '../../hooks/useAIReincidencias'
import { useReincidenciaDetails } from '../../hooks/useReincidenciaDetails'
import { buildReincidenciaPairs, filterReincidentes, getOSObservation, mergeOSObservations, sortedClientRows } from './reincidenciasReport'
import { exportReincidenciasPDF } from './reincidenciasPDF'

const FORNECEDORES = ['WES', 'Instacable', 'THM', 'REDE', 'MANUTENCAO', 'INTERNO', 'OUTRO']

export default function ReincidenciasPage() {
  const { allRows, isLoading } = useOSDerived()
  const [fornecedor, setFornecedor] = useState('')
  const [equipe, setEquipe] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [aiEnabled, setAIEnabled] = useState(false)
  const churn = useMemo(() => buildChurn(allRows, Number.POSITIVE_INFINITY), [allRows])
  const reportOSNumbers = useMemo(() => [...new Set(churn.clientes.flatMap(c => c.rows.map(r => r.numos)))], [churn.clientes])
  const { data: observations, isLoading: observationsLoading, isError: observationsError } = useReincidenciaDetails(reportOSNumbers)
  const detailedClients = useMemo(() => mergeOSObservations(churn.clientes, observations), [churn.clientes, observations])
  const equipes = useMemo(() => [...new Set(churn.clientes.flatMap(c => c.rows.map(r => shortEquipe(r.nomedaequipe).split(' - ')[0])))].filter(v => v && v !== '—').sort(), [churn.clientes])
  const clientes = useMemo(() => filterReincidentes(detailedClients, { fornecedor, equipe }), [detailedClients, fornecedor, equipe])
  const pares = useMemo(() => buildReincidenciaPairs(clientes), [clientes])
  const { data: analysis, isFetching: aiLoading, isError: aiError, errorMessage } = useAIReincidencias(pares, aiEnabled)
  const osCount = clientes.reduce((sum, c) => sum + c.rows.length, 0)
  const avgGap = clientes.length ? Math.round(clientes.reduce((sum, c) => sum + c.intervaloMedio, 0) / clientes.length * 10) / 10 : 0
  const resetAI = (setter: (value: string) => void) => (value: string) => { setter(value); setAIEnabled(false) }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader title="Relatório de Reincidências" icon={UserMinus}
        description={`Manutenções repetidas nos últimos ${churn.janelaDias} dias · análise auditável por cliente`}
        actions={<button type="button" disabled={!clientes.length} onClick={() => exportReincidenciasPDF(clientes, [fornecedor ? `Terceira: ${fornecedor}` : 'Todas as terceiras', equipe ? `Equipe: ${equipe}` : 'Todas as equipes'], analysis)}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-label font-semibold text-white transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          <FilePdf size={17} /> Exportar PDF
        </button>}
      />

      <section aria-label="Filtros do relatório" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <Funnel size={18} className="mb-3 text-muted" />
        <Filter label="Terceira" value={fornecedor} onChange={resetAI(setFornecedor)} options={FORNECEDORES} all="Todas as terceiras" />
        <Filter label="Equipe" value={equipe} onChange={resetAI(setEquipe)} options={equipes} all="Todas as equipes" />
        {(fornecedor || equipe) && <button type="button" onClick={() => { setFornecedor(''); setEquipe(''); setAIEnabled(false) }} className="min-h-11 cursor-pointer rounded-lg px-3 text-label font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Limpar filtros</button>}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Clientes reincidentes" value={clientes.length} detail={`${churn.totalBase} clientes na base`} />
        <KPI label="Ordens analisadas" value={osCount} detail="manutenções concluídas" />
        <KPI label="Intervalo médio" value={`${avgGap.toLocaleString('pt-BR')}d`} detail="entre atendimentos" />
        <KPI label="Taxa geral" value={`${churn.pctReincidencia}%`} detail="da base atendida" />
      </div>

      <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5" aria-labelledby="ai-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="ai-title" className="flex items-center gap-2 text-body font-bold text-text"><Brain size={18} className="text-primary" /> Diagnóstico objetivo da IA</h2><p className="mt-1 text-caption text-secondary">Compara cada atendimento com a visita seguinte e aponta causa provável e pendência.</p></div>
          <button type="button" disabled={!pares.length || aiLoading || observationsLoading || observationsError} onClick={() => setAIEnabled(true)} className="min-h-11 cursor-pointer rounded-lg border border-primary/30 bg-primary/10 px-4 text-label font-semibold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            {observationsLoading ? 'Carregando observações…' : aiLoading ? 'Analisando…' : analysis ? 'Atualizar análise' : 'Gerar análise com IA'}
          </button>
        </div>
        {analysis && <div className="mt-4 space-y-3"><p className="text-body leading-relaxed text-text">{analysis.narrativa}</p><div className="flex flex-wrap gap-2">{analysis.causas_distribuicao.map(c => <span key={c.causa} className="rounded-full border border-border bg-card px-3 py-1 text-caption text-secondary">{c.causa}: <b className="text-text">{c.count}</b> ({c.pct}%)</span>)}</div></div>}
        {observationsError && <p className="mt-3 text-label text-red">Não foi possível carregar as observações das OS. Atualize a página e tente novamente.</p>}
        {aiError && <p className="mt-3 text-label text-red">A IA não respondeu: {errorMessage || 'erro desconhecido'}. O relatório detalhado e o PDF continuam disponíveis.</p>}
      </section>

      <section className="space-y-3" aria-label="Clientes e ordens reincidentes">
        {isLoading && <p className="rounded-xl border border-border bg-card p-6 text-secondary">Carregando ordens…</p>}
        {!isLoading && !clientes.length && <p className="rounded-xl border border-border bg-card p-6 text-secondary">Nenhuma reincidência encontrada para os filtros selecionados.</p>}
        {clientes.map(cliente => {
          const open = expanded === cliente.chave
          return <article key={cliente.chave} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : cliente.chave)} className="grid min-h-14 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60">
              {open ? <CaretDown size={17} /> : <CaretRight size={17} />}<span className="min-w-0"><b className="block truncate text-body text-text">{cliente.cliente}</b><span className="block truncate text-caption text-secondary">{cliente.cidade}{cliente.bairro ? ` · ${cliente.bairro}` : ''}</span></span><span className="text-right tabular-nums"><b className="block text-orange">{cliente.visitas} visitas</b><span className="text-caption text-muted">média {cliente.intervaloMedio.toLocaleString('pt-BR')}d</span></span>
            </button>
            {open && <div className="border-t border-border p-3 sm:p-4"><div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-left text-label"><thead><tr className="text-caption uppercase tracking-wide text-muted">{['Data da OS', 'OS', 'Terceira', 'Equipe', 'Serviço', 'Observação da OS'].map(h => <th key={h} className="border-b border-border px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{sortedClientRows(cliente.rows).map(row => <tr key={row.numos} className="align-top hover:bg-elevated/60"><td className="whitespace-nowrap border-b border-border/60 px-3 py-3 tabular-nums">{fmtDate(row.dataexecucao || row.databaixa) || '—'}</td><td className="border-b border-border/60 px-3 py-3 font-semibold text-primary">{row.numos}</td><td className="border-b border-border/60 px-3 py-3">{row._fornecedor || '—'}</td><td className="whitespace-nowrap border-b border-border/60 px-3 py-3">{shortEquipe(row.nomedaequipe)}</td><td className="max-w-[220px] border-b border-border/60 px-3 py-3">{String(row.servico || row.tiposervico || '—')}</td><td className="max-w-[360px] whitespace-pre-wrap border-b border-border/60 px-3 py-3 leading-relaxed text-secondary">{getOSObservation(row)}</td></tr>)}</tbody></table></div></div>}
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
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-[24px] font-bold tabular-nums text-text">{value}</p><p className="text-caption text-secondary">{detail}</p></div>
}
