import { useState, useMemo } from 'react'
import { House, Trophy, Clock, Target, CurrencyDollar, Sparkle, TrendUp, TrendDown, CaretUp, ArrowRight } from '@phosphor-icons/react'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid } from '../../components/ui/bar-chart'
import { useOSDerived } from '../../contexts/OSDataContext'
import { buildFornecedor } from '../../lib/builders'
import { diasNoPeriodo, MIN_OS_RANKING } from '../../lib/builders/extra'
import { useUIStore } from '../../store/uiStore'
import { slaEscala } from './slaEscala'
import { indexarSlaAnterior, variacaoSla, rotuloVariacao } from './comparativo'
import { useFornecedorConfig } from './useFornecedorConfig'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { PageHeader } from '../../components/ui/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import { useIsGestor } from '../../hooks/useRole'
import { useAIFornecedor } from '../../hooks/useAIFornecedor'

const FORNECEDORES = [
  { value: '',           label: 'Todos',              color: '#3b82f6' },
  { value: 'WES',        label: 'WES (Instalação)',   color: '#c4b5fd' },
  { value: 'Instacable', label: 'Instacable',         color: '#facc15' },
  { value: 'THM',        label: 'THM (Instalação)',   color: '#22d3ee' },
  { value: 'REDE',       label: 'Rede',               color: '#4ade80' },
  { value: 'MANUTENCAO', label: 'Manutenção',         color: '#f97316' },
  { value: 'INTERNO',    label: 'Interno (COPE)',     color: '#94a3b8' },
]

function fmtCusto(v: number | null | undefined): string {
  if (!v || v <= 0) return '—'
  return `R$ ${v.toLocaleString('pt-BR')}`
}

export default function FornecedorPage() {
  const [filtro,    setFiltro]    = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const { rows, prevRows, derived, isLoading } = useOSDerived()
  const porFornecedorRevisita = derived.revisitas.porFornecedor
  const isGestor = useIsGestor()

  const { from, to } = useUIStore(s => s.dateFilter)
  const dias = useMemo(() => diasNoPeriodo(from, to), [from, to])

  // Custo e meta vêm do servidor, com o custo VIGENTE no período analisado.
  const { custo: custoFornecedor, meta: metaSla, erro: erroConfig, salvarCusto, salvarMeta } =
    useFornecedorConfig(to)

  const { paineis, ranking } = useMemo(
    () => buildFornecedor(rows, filtro, custoFornecedor, dias),
    [rows, filtro, custoFornecedor, dias]
  )

  // "SLA 87%" não diz nada sozinho; "87%, era 79%" diz. O período anterior já era
  // computado no contexto para Dashboard e Revisitas — aqui só passou a ser lido.
  const slaAnterior = useMemo(
    () => indexarSlaAnterior(buildFornecedor(prevRows, filtro, custoFornecedor, dias).ranking),
    [prevRows, filtro, custoFornecedor, dias]
  )

  const aiFornecedoresInput = useMemo(() => ranking.map(f => ({
    nome:         f.nome,
    sla:          f.sla,
    concl_pct:    f.conclPct,
    mttr:         f.mttr,
    total:        f.total,
    criticas:     paineis.find(p => p.nome === f.nome)?.kpis?.criticas ?? 0,
    custo_por_os: paineis.find(p => p.nome === f.nome)?.kpis?.custoPorOs ?? 0,
  })), [ranking, paineis])

  const { data: aiFornecedor, isLoading: aiLoading } = useAIFornecedor({
    fornecedores: aiFornecedoresInput,
    enabled: aiEnabled,
  })

  const TIER_CFG: Record<'A' | 'B' | 'C', { text: string; bg: string; border: string }> = {
    A: { text: 'text-green',  bg: 'bg-green/10',  border: 'border-green/20'  },
    B: { text: 'text-yellow', bg: 'bg-yellow/10', border: 'border-yellow/20' },
    C: { text: 'text-red',    bg: 'bg-red/10',    border: 'border-red/20'    },
  }

  const REC_LABEL: Record<string, string> = {
    aumentar: 'Aumentar contrato',
    manter:   'Manter',
    reduzir:  'Reduzir contrato',
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Análise por Fornecedor" icon={House} />

      {/* Filtro */}
      <div className="flex flex-wrap gap-2">
        {FORNECEDORES.map((f) => (
          <button key={f.value} onClick={() => setFiltro(f.value)}
            className={`flex items-center gap-1.5 text-caption font-bold px-3 py-1.5 rounded-pill border transition-all duration-fast cursor-pointer
                        ${filtro === f.value ? 'text-white border-transparent' : 'border-white/[0.08] text-muted hover:text-secondary'}`}
            style={filtro === f.value ? { background: f.color, borderColor: f.color } : {}}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: f.color }} />
            {f.label}
          </button>
        ))}
      </div>

      {erroConfig && (
        <div className="rounded-xl border border-red/20 bg-red/[0.06] px-4 py-3 text-caption text-red/90">
          Não foi possível carregar custo e meta do servidor: {erroConfig}. Os campos aparecem vazios —
          o valor exibido <strong>não</strong> é "sem configuração", é "não foi possível ler".
        </div>
      )}

      {isLoading ? <KPIGridSkeleton count={6} /> : (
        <>
          {/* Ranking por SLA */}
          {ranking.length > 1 && (
            <div className="bg-card border border-white/[0.08] rounded-xl p-4">
              <SectionTitle icon={Trophy} className="mb-3">Ranking por SLA</SectionTitle>
              <p className="text-caption text-muted mb-4">
                SLA = % das OS entregues dentro do prazo. Empate desconta pelo menor MTTR.
                A linha vertical indica a meta configurada. A coluna ao lado do percentual traz a
                variação em pontos contra o período anterior. Fornecedores com menos de {MIN_OS_RANKING} OS
                no período aparecem ao final, marcados — a proporção sobre poucas OS não distingue
                competência de sorte na amostra.
              </p>
              <div className="space-y-3">
                {ranking.map((f, i) => {
                  const sc    = slaEscala(f.sla)
                  const meta  = metaSla[f.fornKey] ?? null
                  const delta = variacaoSla(f.sla, slaAnterior[f.fornKey])
                  const rot   = rotuloVariacao(delta)
                  return (
                    <div key={f.nome} className="flex items-center gap-3">
                      <span className="text-caption font-mono text-muted w-4 text-right flex-shrink-0">{i + 1}</span>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                      <span className="text-caption font-semibold text-text w-28 flex-shrink-0 truncate">{f.nome}</span>

                      {/* Barra com marcador de meta */}
                      <div className="flex-1 relative" style={{ height: 8 }}>
                        <div className="absolute inset-0 bg-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-slow"
                            style={{ width: `${f.sla}%`, background: f.cor }} />
                        </div>
                        {meta != null && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-surface/200 z-10"
                            style={{ left: `${meta}%`, height: 16 }}
                            title={`Meta: ${meta}`}
                          />
                        )}
                      </div>

                      <span className={`text-label font-mono font-bold w-10 text-right flex-shrink-0 ${sc.text}`}>{f.sla}%</span>
                      <span
                        className={`text-caption font-mono font-bold w-9 text-right flex-shrink-0
                                    ${delta == null ? 'text-muted/40' : delta > 0 ? 'text-green' : delta < 0 ? 'text-red' : 'text-muted'}`}
                        title={delta == null
                          ? 'Sem dados do período anterior para comparar'
                          : `Período anterior: ${slaAnterior[f.fornKey]}%`}
                      >
                        {rot ?? '—'}
                      </span>
                      <span className={`text-caption font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${sc.text} ${sc.bg} ${sc.border}`}>
                        {sc.label}
                      </span>
                      {f.amostraInsuficiente && (
                        <span
                          className="text-caption font-bold px-1.5 py-0.5 rounded border flex-shrink-0
                                     text-muted bg-surface border-white/[0.08]"
                          title={`Só ${f.total} OS no período — abaixo do piso de ${MIN_OS_RANKING} para o ranking valer`}
                        >
                          n={f.total}
                        </span>
                      )}

                      {/* Meta editável inline */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Target size={9} className="text-muted/50" />
                        <input
                          type="number" min={0} max={100}
                          value={meta ?? ''}
                          onChange={e => isGestor && void salvarMeta(f.fornKey, Number(e.target.value))}
                          disabled={!isGestor}
                          placeholder="Meta"
                          className="w-14 bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 text-caption font-mono
                                     text-text text-center outline-none focus:border-primary/50 transition-colors disabled:opacity-40"
                          title={isGestor ? "Meta de SLA para esta operadora" : "Apenas gestores podem editar"}
                        />
                      </div>

                      <span className="text-caption text-muted w-20 text-right hidden lg:block flex-shrink-0">
                        {f.conclPct}% concl. · {f.mttr}d MTTR
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-caption text-muted/50 mt-3">
                * Edite o campo "Meta" para definir a meta de SLA de cada operadora. O marcador vertical aparece na barra.
              </p>
            </div>
          )}

          {/* ── AI Fornecedor ─────────────────────────────────────────── */}
          {!aiEnabled ? (
            <div className="rounded-xl border border-white/[0.06] bg-surface/10 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkle size={12} className="text-primary/40" />
                <span className="text-caption font-bold text-muted uppercase tracking-wide">Recomendações por Fornecedor · IA</span>
              </div>
              <button
                onClick={() => setAiEnabled(true)}
                className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                           px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                           transition-all duration-fast"
              >
                <Sparkle size={11} /> Analisar com IA
              </button>
            </div>
          ) : (aiLoading || aiFornecedor) && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkle size={12} className="text-primary" />
                <span className="text-caption font-bold text-primary/80 uppercase tracking-wide">
                  Recomendações por Fornecedor · IA
                </span>
                {aiLoading && (
                  <span className="text-caption text-muted animate-pulse ml-auto">Analisando…</span>
                )}
              </div>
              {aiFornecedor && (
                <>
                  {aiFornecedor.narrativa && (
                    <p className="text-label text-secondary leading-relaxed">{aiFornecedor.narrativa}</p>
                  )}
                  {aiFornecedor.ranking && aiFornecedor.ranking.length > 0 && (
                    <div className="space-y-2">
                      {aiFornecedor.ranking.map((r, i) => {
                        const tier = TIER_CFG[r.tier] ?? TIER_CFG.C
                        return (
                          <div key={i} className="flex items-start gap-3 py-2 border-b border-white/[0.05] last:border-0">
                            <span className={`text-caption font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${tier.text} ${tier.bg} ${tier.border}`}>
                              Tier {r.tier}
                            </span>
                            <span className="text-label font-semibold text-text w-28 flex-shrink-0 truncate">{r.nome}</span>
                            <span className={`text-caption font-bold flex-shrink-0 ${
                              r.recomendacao === 'aumentar' ? 'text-green' :
                              r.recomendacao === 'manter'   ? 'text-muted' : 'text-red'
                            }`}>
                              {REC_LABEL[r.recomendacao] ?? r.recomendacao}
                            </span>
                            <span className="text-caption text-secondary flex-1">{r.motivo}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Painéis por fornecedor */}
          <div className="space-y-4">
            {paineis.map((p) => (
              <FornecedorPanel key={p.nome} {...p}
                custoMensal={custoFornecedor[p.fornKey] ?? 0}
                onCustoChange={(v) => void salvarCusto(p.fornKey, v)}
                meta={metaSla[p.fornKey] ?? null}
                isGestor={isGestor}
                dias={dias}
                revisitas={porFornecedorRevisita.find(f => f.fornecedor === p.fornKey)?.total ?? null}
              />
            ))}
            {paineis.length === 0 && (
              <div className="text-center py-16 text-muted text-label">
                Carregue os dados do servidor para visualizar os fornecedores.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface PanelKpis { total: number; concluidas: number; criticas: number; sla: number; conclPct: number; mttr: number; mttrP90: number; custoMensal?: number; custoPorOs?: number | null }
interface PanelEquipe { nome: string; total: number; concluidas: number; criticas: number; sla: number; mttr: number; aging: number }
interface PanelChart  { labels: unknown[]; total: unknown[]; concluidas: unknown[] }

function FornecedorPanel({ nome, cor, equipes, kpis, chart, custoMensal, onCustoChange, meta, isGestor, dias, revisitas }: {
  nome: string; cor: string
  equipes: PanelEquipe[]
  kpis:    PanelKpis | null
  chart:   PanelChart
  custoMensal: number
  onCustoChange: (v: number) => void
  meta:    number | null
  isGestor: boolean
  dias:    number
  /** Nº de revisitas deste fornecedor no período, ou null quando não há dado —
   *  ausência real (nenhuma revisita) e "sistema não consegue enxergar" (caso
   *  da equipe de Rede, ver revisitas.ts) chegam aqui do mesmo jeito: null. Um
   *  card ausente não mente; um card zerado mentiria por omissão. */
  revisitas: number | null
}) {
  const [expanded, setExpanded] = useState(true)
  const sc = slaEscala(kpis?.sla ?? 0)
  const acimaDoMeta = meta != null && kpis?.sla != null && kpis.sla >= meta

  // Custo de revisita = 100% do retrabalho × custo real e vigente da operadora
  // no período — nenhuma taxa de evitabilidade aplicada por cima (Opção A da
  // spec de custo de revisita: "nenhum peso inventado").
  const custoRevisita = revisitas != null && kpis?.custoPorOs != null
    ? revisitas * kpis.custoPorOs
    : null

  const FROM: Record<string, string> = { primary: 'from-primary/[0.07]', green: 'from-green/[0.07]', red: 'from-red/[0.07]', yellow: 'from-yellow/[0.07]', orange: 'from-orange/[0.07]' }
  const TEXT: Record<string, string> = { primary: 'text-primary', green: 'text-green', red: 'text-red', yellow: 'text-yellow', orange: 'text-orange' }

  const kpiCards = kpis ? [
    { label: 'Total OS',       value: kpis.total,      accent: 'primary' },
    { label: 'Concluídas',     value: kpis.concluidas, accent: 'green'   },
    { label: 'Críticas',       value: kpis.criticas,   accent: 'red'     },
    { label: 'SLA',            value: `${kpis.sla}%`,  accent: slaEscala(kpis.sla).accent },
    { label: 'MTTR P50',       value: `${kpis.mttr}d`, accent: kpis.mttr <= 2 ? 'green' : kpis.mttr <= 5 ? 'yellow' : 'red' },
    // O caso ruim, não o típico: é dele que vem reclamação de cliente e multa.
    { label: 'MTTR P90',       value: `${kpis.mttrP90}d`, accent: kpis.mttrP90 <= 5 ? 'green' : kpis.mttrP90 <= 10 ? 'yellow' : 'red' },
    { label: 'Taxa Conclusão', value: `${kpis.conclPct}%`, accent: kpis.conclPct >= 80 ? 'green' : kpis.conclPct >= 60 ? 'primary' : 'yellow' },
    { label: 'Custo / OS',     value: fmtCusto(kpis.custoPorOs), accent: 'orange' },
    // Só entra quando há revisita detectada E custo configurado — sem isso o
    // card mostraria R$0 pra quem tem retrabalho invisível ao sistema (Rede
    // hoje) ou pra quem não configurou custo, os dois lidos como "zero
    // revisita" por quem só olha o número.
    ...(custoRevisita != null ? [{
      label: 'Custo Revisita', value: fmtCusto(custoRevisita), accent: 'red',
      title: `${revisitas} revisita${revisitas === 1 ? '' : 's'} × ${fmtCusto(kpis!.custoPorOs)}/OS`,
    }] : []),
  ] : []

  return (
    <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface/20 transition-colors cursor-pointer">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cor }} />
        <h3 className="font-headline font-bold text-title text-text flex-1">{nome}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {kpis?.sla != null && (
            <span className={`text-caption font-mono font-bold px-2 py-0.5 rounded border ${sc.text} ${sc.bg} ${sc.border}`}>
              SLA {kpis.sla}%
            </span>
          )}
          {meta != null && (
            <span className={`inline-flex items-center gap-1 text-caption font-bold px-1.5 py-0.5 rounded border ${acimaDoMeta ? 'badge-green' : 'badge-red'}`}>
              {acimaDoMeta
                ? <TrendUp   size={11} weight="bold" alt="acima" />
                : <TrendDown size={11} weight="bold" alt="abaixo" />}
              {acimaDoMeta ? 'Acima da meta' : 'Abaixo da meta'} ({meta}%)
            </span>
          )}
          {kpis?.mttr != null && (
            <span className="flex items-center gap-1 text-caption text-muted border border-white/[0.08] rounded px-2 py-0.5">
              <Clock size={9} /> {kpis.mttr}d P50 · {kpis.mttrP90}d P90
            </span>
          )}
          <Badge variant="cyan">{kpis?.total ?? 0} OS</Badge>
          <CaretUp size={12} weight="bold"
                   className={`text-muted transition-transform ${expanded ? '' : 'rotate-180'}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 animate-slide-down">

          {/* Custo mensal — input */}
          <div className="flex items-center gap-2 py-2 border-t border-white/[0.05]">
            <CurrencyDollar size={12} className="text-muted flex-shrink-0" />
            <span className="text-caption text-muted">Custo mensal desta operadora (R$):</span>
            <input
              type="number" min={0} step={500}
              value={custoMensal || ''}
              onChange={e => isGestor && onCustoChange(Number(e.target.value))}
              disabled={!isGestor}
              placeholder="0"
              className="w-32 bg-surface border border-white/[0.08] rounded-md px-2 py-1 text-label font-mono
                         text-text outline-none focus:border-primary/50 transition-colors disabled:opacity-40"
            />
            {kpis?.custoPorOs != null && (
              <span className="inline-flex items-center gap-1 text-caption text-muted">
                <ArrowRight size={11} weight="bold" className="flex-shrink-0" />
                <span className="text-orange font-semibold">{fmtCusto(kpis.custoPorOs)} / OS concluída</span>
                {' '}<span className="text-muted/60">(custo rateado para os {dias}d do período)</span>
              </span>
            )}
          </div>

          {/* KPI Cards */}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {kpiCards.map((k) => (
                <div key={k.label}
                  title={'title' in k ? k.title : undefined}
                  className={`bg-surface bg-gradient-to-br ${FROM[k.accent] ?? FROM.primary} to-transparent border border-white/[0.08] rounded-xl p-3`}>
                  <p className="text-caption font-bold uppercase tracking-wide text-muted mb-1">{k.label}</p>
                  <p className={`font-mono font-bold text-xl leading-none ${TEXT[k.accent] ?? TEXT.primary}`}>{k.value ?? '—'}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tabela de equipes */}
          {equipes?.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-caption">
                <thead>
                  <tr className="border-b-2 border-white/[0.08] bg-surface">
                    {['Equipe','Total','Concluídas','Críticas','SLA%','MTTR','Aging Méd.'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-caption font-bold text-muted uppercase tracking-[0.04em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {(equipes as { nome: string; total: number; concluidas: number; criticas: number; sla: number; mttr: number; aging: number }[]).map((eq) => (
                    <tr key={eq.nome} className="text-secondary hover:bg-primary/[0.05] transition-colors">
                      <td className="px-3 py-2 font-semibold text-text max-w-[180px] truncate">{eq.nome}</td>
                      <td className="px-3 py-2 font-mono">{eq.total}</td>
                      <td className="px-3 py-2 font-mono text-green">{eq.concluidas}</td>
                      <td className="px-3 py-2 font-mono text-red">{eq.criticas}</td>
                      <td className="px-3 py-2">
                        <Badge variant={slaEscala(eq.sla).badge}>{eq.sla}%</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`font-mono text-caption ${eq.mttr <= 2 ? 'text-green' : eq.mttr <= 5 ? 'text-yellow' : 'text-red'}`}>
                          {eq.mttr}d
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{eq.aging}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Gráfico total vs. concluídas */}
          {chart?.labels?.length > 0 && (
            <div className="bg-surface border border-white/[0.08] rounded-xl p-4 h-48">
              <BarChart data={(chart.labels as string[]).map((name: string, i: number) => ({ name, Total: (chart.total as number[])[i] ?? 0, Concluídas: (chart.concluidas as number[])[i] ?? 0 }))}>
                <Bar dataKey="Total" fill={cor} name="Total" />
                <Bar dataKey="Concluídas" fill="#4ade80" name="Concluídas" />
                <XAxis dataKey="name" />
                <YAxis />
                <Grid />
                <ChartTooltip />
              </BarChart>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
