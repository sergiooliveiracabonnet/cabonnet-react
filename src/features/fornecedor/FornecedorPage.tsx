import { useState, useMemo } from 'react'
import { Home, Award, Clock, Target, DollarSign, Sparkles } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid } from '../../components/ui/bar-chart'
import { useOSDerived } from '../../contexts/OSDataContext'
import { buildFornecedor } from '../../lib/builders'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { PageHeader } from '../../components/ui/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'
import { useAlertStore } from '../../store/alertStore'
import { useERPStore } from '../../store/erpStore'
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

function scoreColor(s: number): { text: string; bg: string; border: string; label: string } {
  if (s >= 80) return { text: 'text-green',   bg: 'bg-green/10',   border: 'border-green/20',   label: 'Excelente' }
  if (s >= 60) return { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', label: 'Bom'       }
  if (s >= 40) return { text: 'text-yellow',  bg: 'bg-yellow/10',  border: 'border-yellow/20',  label: 'Regular'   }
  return              { text: 'text-red',     bg: 'bg-red/10',     border: 'border-red/20',     label: 'Crítico'   }
}

function fmtCusto(v: number | null | undefined): string {
  if (!v || v <= 0) return '—'
  return `R$ ${v.toLocaleString('pt-BR')}`
}

export default function FornecedorPage() {
  const [filtro,    setFiltro]    = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const { rows, isLoading }       = useOSDerived()
  const { metaScore, updateMetaScore }         = useAlertStore()
  const { custoFornecedor, setCustoFornecedor } = useERPStore()
  const isGestor = useIsGestor()

  const { paineis, ranking } = useMemo(
    () => buildFornecedor(rows, filtro, custoFornecedor),
    [rows, filtro, custoFornecedor]
  )

  const aiFornecedoresInput = useMemo(() => ranking.map(f => ({
    nome:         f.nome,
    score:        f.score,
    sla:          f.sla,
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
      <PageHeader title="Análise por Fornecedor" icon={Home} />

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

      {isLoading ? <KPIGridSkeleton count={6} /> : (
        <>
          {/* Ranking por Score Composto */}
          {ranking.length > 1 && (
            <div className="bg-card border border-white/[0.08] rounded-xl p-4">
              <SectionTitle icon={Award} className="mb-3">Ranking por Score Composto</SectionTitle>
              <p className="text-caption text-muted mb-4">
                Score = SLA 45% + Conclusão 35% + MTTR 20% — quanto maior, melhor.
                A linha vertical indica a meta configurada.
              </p>
              <div className="space-y-3">
                {ranking.map((f, i) => {
                  const sc   = scoreColor(f.score)
                  const meta = metaScore[f.nome] ?? metaScore[f.fornKey] ?? null
                  return (
                    <div key={f.nome} className="flex items-center gap-3">
                      <span className="text-caption font-mono text-muted w-4 text-right flex-shrink-0">{i + 1}</span>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                      <span className="text-caption font-semibold text-text w-28 flex-shrink-0 truncate">{f.nome}</span>

                      {/* Barra com marcador de meta */}
                      <div className="flex-1 relative" style={{ height: 8 }}>
                        <div className="absolute inset-0 bg-surface rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-slow"
                            style={{ width: `${f.score}%`, background: f.cor }} />
                        </div>
                        {meta != null && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-surface/200 z-10"
                            style={{ left: `${meta}%`, height: 16 }}
                            title={`Meta: ${meta}`}
                          />
                        )}
                      </div>

                      <span className={`text-label font-mono font-bold w-10 text-right flex-shrink-0 ${sc.text}`}>{f.score}</span>
                      <span className={`text-caption font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${sc.text} ${sc.bg} ${sc.border}`}>
                        {sc.label}
                      </span>

                      {/* Meta editável inline */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Target size={9} className="text-muted/50" />
                        <input
                          type="number" min={0} max={100}
                          value={meta ?? ''}
                          onChange={e => isGestor && updateMetaScore(f.nome, Number(e.target.value))}
                          disabled={!isGestor}
                          placeholder="Meta"
                          className="w-14 bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 text-caption font-mono
                                     text-text text-center outline-none focus:border-primary/50 transition-colors disabled:opacity-40"
                          title={isGestor ? "Meta de score para esta operadora" : "Apenas gestores podem editar"}
                        />
                      </div>

                      <span className="text-caption text-muted w-20 text-right hidden lg:block flex-shrink-0">
                        SLA {f.sla}% · {f.mttr}d MTTR
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-caption text-muted/50 mt-3">
                * Edite o campo "Meta" para definir a meta de score de cada operadora. O marcador vertical aparece na barra.
              </p>
            </div>
          )}

          {/* ── AI Fornecedor ─────────────────────────────────────────── */}
          {!aiEnabled ? (
            <div className="rounded-xl border border-white/[0.06] bg-surface/10 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-primary/40" />
                <span className="text-caption font-bold text-muted uppercase tracking-wide">Recomendações por Fornecedor · IA</span>
              </div>
              <button
                onClick={() => setAiEnabled(true)}
                className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                           px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                           transition-all duration-fast"
              >
                <Sparkles size={11} /> Analisar com IA
              </button>
            </div>
          ) : (aiLoading || aiFornecedor) && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-primary" />
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
                onCustoChange={(v) => setCustoFornecedor(p.fornKey, v)}
                meta={metaScore[p.nome] ?? null}
                isGestor={isGestor}
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

interface PanelKpis { total: number; concluidas: number; criticas: number; sla: number; mttr: number; score: number; custoMensal?: number; custoPorOs?: number | null }
interface PanelEquipe { nome: string; total: number; concluidas: number; criticas: number; sla: number; mttr: number; aging: number }
interface PanelChart  { labels: unknown[]; total: unknown[]; concluidas: unknown[] }

function FornecedorPanel({ nome, cor, equipes, kpis, chart, custoMensal, onCustoChange, meta, isGestor }: {
  nome: string; cor: string
  equipes: PanelEquipe[]
  kpis:    PanelKpis | null
  chart:   PanelChart
  custoMensal: number
  onCustoChange: (v: number) => void
  meta:    number | null
  isGestor: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const sc = scoreColor(kpis?.score ?? 0)
  const acimaDoMeta = meta != null && kpis?.score != null && kpis.score >= meta

  const FROM: Record<string, string> = { primary: 'from-primary/[0.07]', green: 'from-green/[0.07]', red: 'from-red/[0.07]', yellow: 'from-yellow/[0.07]', orange: 'from-orange/[0.07]' }
  const TEXT: Record<string, string> = { primary: 'text-primary', green: 'text-green', red: 'text-red', yellow: 'text-yellow', orange: 'text-orange' }

  const kpiCards = kpis ? [
    { label: 'Total OS',       value: kpis.total,      accent: 'primary' },
    { label: 'Concluídas',     value: kpis.concluidas, accent: 'green'   },
    { label: 'Críticas',       value: kpis.criticas,   accent: 'red'     },
    { label: 'SLA',            value: `${kpis.sla}%`,  accent: kpis.sla >= 90 ? 'green' : 'yellow' },
    { label: 'MTTR (dias)',    value: `${kpis.mttr}d`, accent: kpis.mttr <= 2 ? 'green' : kpis.mttr <= 5 ? 'yellow' : 'red' },
    { label: 'Score Composto', value: kpis.score,      accent: kpis.score >= 80 ? 'green' : kpis.score >= 60 ? 'primary' : kpis.score >= 40 ? 'yellow' : 'red' },
    { label: 'Custo / OS',     value: fmtCusto(kpis.custoPorOs), accent: 'orange' },
  ] : []

  return (
    <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface/20 transition-colors cursor-pointer">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cor }} />
        <h3 className="font-headline font-bold text-title text-text flex-1">{nome}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {kpis?.score != null && (
            <span className={`text-caption font-mono font-bold px-2 py-0.5 rounded border ${sc.text} ${sc.bg} ${sc.border}`}>
              Score {kpis.score}
            </span>
          )}
          {meta != null && (
            <span className={`text-caption font-bold px-1.5 py-0.5 rounded border ${acimaDoMeta ? 'badge-green' : 'badge-red'}`}>
              {acimaDoMeta ? '↑ Acima da meta' : '↓ Abaixo da meta'} ({meta})
            </span>
          )}
          {kpis?.sla != null && <Badge variant={kpis.sla >= 90 ? 'green' : kpis.sla >= 75 ? 'yellow' : 'red'}>SLA {kpis.sla}%</Badge>}
          {kpis?.mttr != null && (
            <span className="flex items-center gap-1 text-caption text-muted border border-white/[0.08] rounded px-2 py-0.5">
              <Clock size={9} /> {kpis.mttr}d MTTR
            </span>
          )}
          <Badge variant="cyan">{kpis?.total ?? 0} OS</Badge>
          <span className={`text-muted transition-transform text-caption ${expanded ? '' : 'rotate-180'}`}>▲</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 animate-slide-down">

          {/* Custo mensal — input */}
          <div className="flex items-center gap-2 py-2 border-t border-white/[0.05]">
            <DollarSign size={12} className="text-muted flex-shrink-0" />
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
              <span className="text-caption text-muted">
                → <span className="text-orange font-semibold">{fmtCusto(kpis.custoPorOs)} / OS concluída</span>
              </span>
            )}
          </div>

          {/* KPI Cards */}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {kpiCards.map((k) => (
                <div key={k.label} className={`bg-surface bg-gradient-to-br ${FROM[k.accent] ?? FROM.primary} to-transparent border border-white/[0.08] rounded-xl p-3`}>
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
                        <Badge variant={eq.sla >= 90 ? 'green' : eq.sla >= 75 ? 'yellow' : 'red'}>{eq.sla}%</Badge>
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
