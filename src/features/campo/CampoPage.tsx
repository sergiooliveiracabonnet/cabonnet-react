import { useState, useMemo } from 'react'
import { Layout, AlertCircle, CheckCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Cell } from '../../components/ui/bar-chart'
import { AreaChart, Area } from '../../components/ui/line-chart'
import { XAxis as LXAxis, YAxis as LYAxis, Grid as LGrid, ChartTooltip as LChartTooltip } from '../../components/ui/line-chart'
import { useOSDerived } from '../../contexts/OSDataContext'
import { buildCampo } from '../../lib/builders'
import { KPICard } from '../../components/ui/KPICard'

import { ChartCard } from '../../components/ui/ChartCard'
import { Badge } from '../../components/ui/Badge'
import { KPIGridSkeleton } from '../../components/ui/Skeleton'

const FORN_PILLS = [
  { value: '',           label: 'Todos'      },
  { value: 'WES',        label: 'WES'        },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM'        },
  { value: 'REDE',       label: 'Rede'       },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

const STATUS_CFG = {
  ok:      { wrapper: 'border-green/30',  dot: 'bg-green',  label: 'OK'      },
  atencao: { wrapper: 'border-yellow/30', dot: 'bg-yellow', label: 'Atenção' },
  critico: { wrapper: 'border-red/30',    dot: 'bg-red',    label: 'Crítico' },
}

const HERO_CFG = {
  ok:      { bg: 'bg-green/10 border-green/40',   text: 'text-green',  icon: CheckCircle  },
  atencao: { bg: 'bg-yellow/10 border-yellow/40', text: 'text-yellow', icon: AlertCircle  },
  critico: { bg: 'bg-red/10 border-red/40',       text: 'text-red',    icon: AlertCircle  },
}


// Formata dias-até-SLA em rótulo legível
function fmtDiasAteSLA(dias: any) {
  if (dias === null) return null
  if (dias < 0)  return { label: `Vencido ${Math.abs(dias)}d`, cls: 'text-red font-bold' }
  if (dias === 0) return { label: 'Vence hoje',                  cls: 'text-red font-bold' }
  if (dias === 1) return { label: 'Amanhã',                      cls: 'text-yellow font-semibold' }
  return { label: `+${dias}d`,                                   cls: 'text-muted' }
}

export default function CampoPage() {
  const [fornecedor, setFornecedor] = useState('')
  const { rows, isLoading, derived: { campo: campoCtx } } = useOSDerived()

  const campo = useMemo(() => {
    if (!fornecedor) return campoCtx
    return buildCampo(rows.filter(r => r._fornecedor === fornecedor))
  }, [rows, fornecedor, campoCtx])

  const { kpis, semaforo, risco, concluidas, fila, ritmo, projecao, agingDist, hero } = campo

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Layout size={16} className="text-primary" />
        <h2 className="font-headline text-xl font-semibold text-text">
          Conclusão Campo &amp; Análise de Risco
        </h2>
      </div>

      {/* ── Filtro por Fornecedor ───────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Fornecedor</span>
        {FORN_PILLS.map((f) => (
          <button key={f.value} onClick={() => setFornecedor(f.value)}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all duration-fast
                        ${fornecedor === f.value
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-white/[0.08] text-muted hover:text-secondary'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      {!isLoading && hero && <HeroBanner hero={hero} projecao={projecao} />}

      {/* ── KPIs ────────────────────────────────────────────────────── */}
      {isLoading ? <KPIGridSkeleton count={4} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          {kpis.map((k) => (
            <KPICard key={k.title} title={k.title} value={k.value} sub={k.sub} accent={k.accent} />
          ))}
        </div>
      )}

      {/* ── Risco SLA crítico ────────────────────────────────────────── */}
      {risco.count > 0 && (
        <div className="bg-card border border-red/30 rounded-xl p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-red mb-2 flex items-center gap-2">
            <AlertCircle size={12} /> Risco de SLA Crítico
          </p>
          <p className="text-[12px] text-secondary">{risco.desc}</p>
          <p className="text-[11px] text-muted mt-1">{risco.pct}% das OS em campo</p>
        </div>
      )}

      {/* ── Semáforo por equipe (com countdown SLA) ─────────────────── */}
      <div className="bg-card border border-white/[0.08] border-l-[4px] border-l-primary rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary/75 flex items-center gap-2">
            <span className="w-0.5 h-3 bg-primary rounded-full opacity-80 flex-shrink-0" />
            Semáforo por Equipe — Ritmo do Dia
          </p>
          <p className="text-[11px] text-muted">Próx. SLA = OS com vencimento mais próximo na equipe</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {semaforo.map((eq) => {
            const cfg = (STATUS_CFG as Record<string, typeof STATUS_CFG.critico>)[eq.status] ?? STATUS_CFG.critico
            const slaFmt = fmtDiasAteSLA(eq.diasAteSLA)
            return (
              <div
                key={eq.nome}
                className={`bg-surface border ${cfg.wrapper} rounded-xl px-4 py-3
                            flex items-center gap-3 min-h-[48px]`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} flex-shrink-0`} aria-hidden="true" />
                <span className="text-[12px] font-semibold text-text flex-1 truncate">{eq.nome}</span>
                <span className="font-mono text-[11px] text-muted flex-shrink-0">
                  {eq.concl}/{eq.fila + eq.concl}
                </span>
                {eq.ritmoHoje && eq.ritmoHoje.status !== 'neutro' && (
                  <span
                    className={`text-[11px] font-mono flex-shrink-0 ${
                      eq.ritmoHoje.status === 'acima' ? 'text-green/80' : 'text-yellow/80'
                    }`}
                    title={`Hoje: ${eq.ritmoHoje.atual} concl. · Proj. fim de dia: ${eq.ritmoHoje.projetado ?? '—'} · Ref: ${eq.ritmoHoje.baseline}`}
                  >
                    {eq.ritmoHoje.status === 'acima' ? '▲' : '▼'}{eq.ritmoHoje.atual}
                  </span>
                )}
                {slaFmt && (
                  <span className={`text-[11px] flex-shrink-0 ${slaFmt.cls}`} title="Próximo vencimento de SLA">
                    {slaFmt.label}
                  </span>
                )}
                <span className={`text-[11px] font-bold flex-shrink-0 ${
                  eq.status === 'ok'      ? 'text-green'  :
                  eq.status === 'atencao' ? 'text-yellow' : 'text-red'
                }`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
          {semaforo.length === 0 && (
            <p className="col-span-full text-muted text-[12px] py-4 text-center">
              Sem dados de equipes
            </p>
          )}
        </div>
      </div>

      {/* ── Histograma de aging + Ritmo lado a lado ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agingDist && (
          <ChartCard title="Distribuição de Aging — OS Ativas" dot={agingDist.hasCritical ? '#f87171' : '#3b82f6'} height="h-52">
            <BarChart data={agingDist.labels.map((name, i) => ({
              name, value: agingDist.values[i] ?? 0,
              fill: i >= 3 ? 'rgba(248,113,113,0.7)' : 'rgba(59,130,246,0.6)',
            }))}>
              <Bar dataKey="value">
                {agingDist.labels.map((_, i) => (
                  <Cell key={i} fill={i >= 3 ? 'rgba(248,113,113,0.7)' : 'rgba(59,130,246,0.6)'} />
                ))}
              </Bar>
              <XAxis dataKey="name" />
              <YAxis />
              <Grid />
              <ChartTooltip />
            </BarChart>
          </ChartCard>
        )}

        <ChartCard title="Ritmo de Conclusões — Últimos 14 dias" dot="#3b82f6" height="h-52">
          {ritmo.labels.length > 0 ? (
            <AreaChart data={ritmo.labels.map((name, i) => ({ name, value: ritmo.values[i] ?? 0 }))}>
              <Area dataKey="value" stroke="#3b82f6" fill="rgba(59,130,246,.08)" strokeWidth={2} />
              <LXAxis dataKey="name" />
              <LYAxis />
              <LGrid />
              <LChartTooltip />
            </AreaChart>
          ) : (
            <div className="flex items-center justify-center h-full text-muted text-[11px]">
              Sem conclusões registradas no período
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Rankings de equipes ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EquipeTable
          title="Equipes com Mais Conclusões"
          icon={CheckCircle}
          rows={concluidas}
          col="concl"
          label="Concl."
        />
        <EquipeTable
          title="Equipes com Maior Fila"
          icon={Clock}
          rows={fila}
          col="fila"
          label="Fila"
        />
      </div>
    </div>
  )
}

// ── Hero Banner ───────────────────────────────────────────────────────────────

function HeroBanner({ hero, projecao }: any) {
  const cfg = (HERO_CFG as Record<string, typeof HERO_CFG.atencao>)[hero.status] ?? HERO_CFG.atencao
  const Icon = cfg.icon

  return (
    <div className={`border rounded-xl px-5 py-3 flex items-center gap-4 ${cfg.bg}`}>
      <Icon size={20} className={`flex-shrink-0 ${cfg.text}`} />

      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-bold uppercase tracking-widest ${cfg.text}`}>
          {hero.title}
        </p>
        <p className="text-[12px] text-secondary mt-0.5 truncate">{hero.msg}</p>
      </div>

      {/* Projeção do dia */}
      {projecao && (
        <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 border-l border-border0 pl-4">
          <div className="flex items-center gap-1">
            {projecao.status === 'acima'
              ? <TrendingUp  size={11} className="text-green"  />
              : projecao.status === 'abaixo'
                ? <TrendingDown size={11} className="text-yellow" />
                : <Clock size={11} className="text-muted" />
            }
            <p className={`text-[11px] font-bold ${
              projecao.status === 'acima'  ? 'text-green'  :
              projecao.status === 'abaixo' ? 'text-yellow' : 'text-muted'
            }`}>
              {projecao.status === 'acima'  ? 'No ritmo'          :
               projecao.status === 'abaixo' ? 'Abaixo do ritmo'   : 'Início do dia'}
            </p>
          </div>
          <p className="text-[11px] text-muted text-right">{projecao.label}</p>
        </div>
      )}

      <div className="flex-shrink-0 text-right">
        <p className="text-[11px] text-muted">{hero.totalEquipes} equipes</p>
        <p className={`text-[11px] font-bold ${cfg.text}`}>
          {hero.criticoCount > 0
            ? `${hero.criticoCount} crítica${hero.criticoCount > 1 ? 's' : ''}`
            : hero.atencaoCount > 0
              ? `${hero.atencaoCount} em atenção`
              : 'Tudo OK'
          }
        </p>
      </div>
    </div>
  )
}

// ── Tabela de equipes ─────────────────────────────────────────────────────────

function EquipeTable({ title, icon: Icon, rows, col, label }: any) {
  return (
    <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
        <Icon size={13} className="text-primary" />
        <p className="text-[12px] font-semibold text-text">{title}</p>
      </div>
      <div className="divide-y divide-white/[0.06]/50">
        {rows.map((eq: any) => (
          <div key={eq.nome} className="flex items-center gap-3 px-4 py-3 min-h-[44px]">
            <p className="text-[11px] text-text font-semibold flex-1 truncate">{eq.nome}</p>
            <span className="font-mono text-[11px] text-secondary">{eq[col]}</span>
            <Badge variant={
              eq.status === 'ok'      ? 'green'  :
              eq.status === 'atencao' ? 'yellow' : 'red'
            }>
              {label}
            </Badge>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-muted text-[12px] px-4 py-4 text-center">Sem dados</p>
        )}
      </div>
    </div>
  )
}
