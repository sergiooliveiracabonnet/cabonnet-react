import { useState } from 'react'
import { Brain, CaretDown, CaretRight, Target, WarningCircle } from '@phosphor-icons/react'
import type { AICausaGrupo, AIPonto, AIReincidenciaAnalysis, AISeveridade } from '../../hooks/useAIReincidencias'

interface Props {
  analysis: AIReincidenciaAnalysis | null
  parCount: number
  aiLoading: boolean
  observationsLoading: boolean
  observationsError: boolean
  aiError: boolean
  errorMessage: string | null
  onGenerate: () => void
}

const SEVERIDADE: Record<AISeveridade, { label: string; dot: string; text: string }> = {
  alta:  { label: 'Alta',  dot: 'bg-red',    text: 'text-red' },
  media: { label: 'Média', dot: 'bg-yellow', text: 'text-yellow' },
  baixa: { label: 'Baixa', dot: 'bg-muted',  text: 'text-muted' },
}

export function ReincidenciasAIPanel({ analysis, parCount, aiLoading, observationsLoading, observationsError, aiError, errorMessage, onGenerate }: Props) {
  const [openCausa, setOpenCausa] = useState<string | null>(null)
  const label = observationsLoading ? 'Carregando observações…' : aiLoading ? 'Analisando…' : analysis ? 'Atualizar análise' : 'Gerar análise com IA'
  const rapidasPct = analysis?.paresAnalisados ? Math.round(analysis.metricas.revisitasRapidas / analysis.paresAnalisados * 100) : 0

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5" aria-labelledby="ai-title">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 id="ai-title" className="flex items-center gap-2 text-body font-bold text-text"><Brain size={18} className="text-primary" /> Diagnóstico objetivo da IA</h2>
          <p className="mt-1 text-caption text-secondary">Compara cada atendimento com a visita seguinte e aponta causa provável e pendência.</p>
        </div>
        <button type="button" disabled={!parCount || aiLoading || observationsLoading || observationsError} onClick={onGenerate}
          className="min-h-11 cursor-pointer rounded-lg border border-primary/30 bg-primary/10 px-4 text-label font-semibold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          {label}
        </button>
      </div>

      {observationsError && <p className="px-4 pb-4 text-label text-red sm:px-5">Não foi possível carregar as observações das OS. Atualize a página e tente novamente.</p>}
      {aiError && <p className="px-4 pb-4 text-label text-red sm:px-5">A IA não respondeu: {errorMessage || 'erro desconhecido'}. O relatório detalhado e o PDF continuam disponíveis.</p>}

      {analysis && <div className="border-t border-primary/20 p-4 sm:p-5">
        <p className="text-title font-semibold leading-snug text-text">{analysis.sintese || analysis.resumo}</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metrica label="Pares analisados" value={analysis.paresAnalisados} />
          <Metrica label="Clientes distintos" value={analysis.metricas.clientes} />
          <Metrica label="Revisita em até 7d" value={`${analysis.metricas.revisitasRapidas} (${rapidasPct}%)`} />
          <Metrica label="Intervalo médio" value={`${analysis.metricas.intervaloMedio.toLocaleString('pt-BR')}d`} />
        </dl>

        {analysis.pontos.length > 0 && <div className="mt-4">
          <h3 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted"><WarningCircle size={13} /> Pontos de atenção</h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[560px] border-collapse text-left text-label">
              <thead>
                <tr className="text-caption uppercase tracking-wide text-muted">
                  {['Severidade', 'Ponto', 'Indicador', 'Causa'].map(head => (
                    <th key={head} className="border-b border-border px-3 py-2 font-semibold">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{analysis.pontos.map(ponto => <PontoRow key={ponto.titulo} ponto={ponto} />)}</tbody>
            </table>
          </div>
        </div>}

        {analysis.acoes.length > 0 && <div className="mt-4">
          <h3 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted"><Target size={13} /> Ações recomendadas</h3>
          <ol className="mt-2 space-y-2">
            {analysis.acoes.map((acao, index) => (
              <li key={acao.titulo} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-border bg-card p-3">
                <span className="text-label font-bold tabular-nums text-primary">{index + 1}</span>
                <span>
                  <b className="text-label text-text">{acao.titulo}</b>
                  {acao.causa && <span className="ml-2 rounded-pill border border-border bg-elevated px-2 py-0.5 text-caption text-secondary">{acao.causa}</span>}
                  {acao.detalhe && <span className="mt-0.5 block text-caption leading-relaxed text-secondary">{acao.detalhe}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>}

        {analysis.causas.length > 0 && <div className="mt-4">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-muted">Causas classificadas</h3>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {analysis.causas.map(grupo => (
              <CausaRow key={grupo.causa} grupo={grupo} open={openCausa === grupo.causa}
                onToggle={() => setOpenCausa(openCausa === grupo.causa ? null : grupo.causa)} />
            ))}
          </ul>
        </div>}

        {!analysis.sintese && analysis.notas.length > 0 && <div className="mt-4">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-muted">
            Leitura da IA {analysis.notas.length > 1 ? `· ${analysis.notas.length} lotes de até 10 pares` : ''}
          </h3>
          {analysis.sinteseErro && <p className="mt-1 text-caption text-secondary">A síntese do conjunto não pôde ser gerada; abaixo ficam as leituras parciais, cada uma limitada ao seu lote.</p>}
          <ul className="mt-1 space-y-1">
            {analysis.notas.map((nota, index) => (
              <li key={nota} className="flex gap-2 text-label leading-relaxed text-secondary">
                {analysis.notas.length > 1 && <span className="tabular-nums text-muted">{index + 1}.</span>}
                <span>{nota}</span>
              </li>
            ))}
          </ul>
        </div>}
      </div>}
    </section>
  )
}

function Metrica({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-border bg-card px-3 py-2">
    <dt className="text-caption text-muted">{label}</dt>
    <dd className="text-body font-bold tabular-nums text-text">{value}</dd>
  </div>
}

function PontoRow({ ponto }: { ponto: AIPonto }) {
  const severidade = SEVERIDADE[ponto.severidade] ?? SEVERIDADE.media
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap border-b border-border/60 px-3 py-3">
        <span className={`flex items-center gap-1.5 text-caption font-semibold ${severidade.text}`}>
          <span className={`h-2 w-2 flex-shrink-0 rounded-pill ${severidade.dot}`} aria-hidden="true" />{severidade.label}
        </span>
      </td>
      <td className="max-w-[380px] border-b border-border/60 px-3 py-3">
        <b className="text-label text-text">{ponto.titulo}</b>
        {ponto.detalhe && <span className="mt-0.5 block text-caption leading-relaxed text-secondary">{ponto.detalhe}</span>}
      </td>
      <td className="whitespace-nowrap border-b border-border/60 px-3 py-3 text-label font-semibold tabular-nums text-text">{ponto.metrica || '—'}</td>
      <td className="border-b border-border/60 px-3 py-3 text-caption text-secondary">{ponto.causa || '—'}</td>
    </tr>
  )
}

function CausaRow({ grupo, open, onToggle }: { grupo: AICausaGrupo; open: boolean; onToggle: () => void }) {
  const expandable = grupo.pares.length > 0
  return (
    <li>
      <button type="button" disabled={!expandable} aria-expanded={expandable ? open : undefined} onClick={onToggle}
        className="grid min-h-11 w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 enabled:cursor-pointer">
        <span className="text-muted">{expandable ? (open ? <CaretDown size={14} /> : <CaretRight size={14} />) : null}</span>
        <span className="min-w-0">
          <span className="block truncate text-label font-semibold text-text">{grupo.causa}</span>
          <span className="mt-1 block h-1 w-full max-w-[220px] overflow-hidden rounded-pill bg-border" aria-hidden="true">
            <span className="block h-full rounded-pill bg-primary" style={{ width: `${Math.max(grupo.pct, 2)}%` }} />
          </span>
        </span>
        <span className="whitespace-nowrap text-right text-caption tabular-nums text-secondary">
          <b className="text-body text-text">{grupo.pct}%</b><br />{grupo.count} {grupo.count === 1 ? 'par' : 'pares'}
        </span>
      </button>
      {open && expandable && <ul className="space-y-2 border-t border-border bg-elevated/40 p-3">
        {grupo.pares.map(item => (
          <li key={item.chave} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <b className="text-label text-text">{item.cliente}</b>
              <span className="text-caption tabular-nums text-muted">
                OS {item.numosOrig} → {item.numosRev} · {item.diasEntre}d{item.equipe && item.equipe !== '—' ? ` · ${item.equipe}` : ''}
              </span>
            </div>
            {item.feitoPrimeira && <p className="mt-1 text-caption leading-relaxed text-secondary"><span className="font-semibold text-muted">Feito na 1ª:</span> {item.feitoPrimeira}</p>}
            {item.oQueFaltou && <p className="mt-0.5 text-caption leading-relaxed text-secondary"><span className="font-semibold text-muted">Faltou:</span> {item.oQueFaltou}</p>}
          </li>
        ))}
      </ul>}
    </li>
  )
}
