import { useState, useEffect } from 'react'
import type { OSRow } from '../../lib/types'
import {
  BarChart2, TrendingUp, Sliders, ZoomIn,
  ChevronUp, ChevronDown, Sparkles, TrendingDown, Minus,
} from 'lucide-react'
import { ChartCard }      from '../../components/ui/ChartCard'
import { SectionTitle }   from '../../components/ui/SectionTitle'
import { Modal }          from '../../components/ui/Modal'
import { DonutChart }     from '../../components/ui/DonutChart'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Legend, Cell } from '../../components/ui/bar-chart'
import { AreaChart, Area } from '../../components/ui/line-chart'
import { XAxis as LXAxis, YAxis as LYAxis, ChartTooltip as LTooltip, Grid as LGrid, Legend as LLegend } from '../../components/ui/line-chart'
import { useAIForecast } from '../../hooks/useAIForecast'
import { shortEquipe }   from '../../lib/osFormat'
import { isConcluida, isExecucaoReal } from '../../lib/transform'
import { buildDistribuicaoSummary, sortDistribution, type DistributionItem } from '../../lib/builders/graficosDistribuicao'
import { buildTendenciaSummary } from '../../lib/builders/graficosTendencia'

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface DrillState   { title: string; rows: OSRow[] }
export interface ChartSeries  { labels?: string[]; values?: number[]; [key: string]: unknown }
export type     OnDrill       = (title: string, rows: OSRow[]) => void

// ─── Constantes ───────────────────────────────────────────────────────────────

export const FORN_PILLS = [
  { value: '',           label: 'Todos'      },
  { value: 'WES',        label: 'WES'        },
  { value: 'Instacable', label: 'Instacable' },
  { value: 'THM',        label: 'THM'        },
  { value: 'REDE',       label: 'Rede'       },
  { value: 'MANUTENCAO', label: 'Manutenção' },
]

export const TABS = [
  { id: 'distribuicao', label: 'Distribuição', icon: BarChart2  },
  { id: 'tendencia',    label: 'Tendência',    icon: TrendingUp },
  { id: 'estatistica',  label: 'Estatística',  icon: Sliders    },
  { id: 'cohort',       label: 'Cohort',       icon: ZoomIn     },
]

export const COLORS = ['#3b82f6','#4ade80','#facc15','#f97316','#c4b5fd','#f87171','#22d3ee','#ec4899','#84cc16','#8b5cf6']

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const toISODate = (s: string | null | undefined): string => {
  if (!s) return ''
  const p = (s || '').split(' ')[0].split(/[/\\]/)
  return p.length >= 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : ''
}
export const toISOMonth    = (s: string | null | undefined): string => toISODate(s).slice(0, 7)
export const closeISO      = (r: OSRow): string => toISODate((r.databaixa || r.dataexecucao || ''))
export const closeISOMonth = (r: OSRow): string => closeISO(r).slice(0, 7)

export const AGING_FILTER = {
  "0-1d":  (r: OSRow) => r._aging != null && r._aging <= 1,
  "2-3d":  (r: OSRow) => r._aging != null && r._aging >= 2 && r._aging <= 3,
  "4-7d":  (r: OSRow) => r._aging != null && r._aging >= 4 && r._aging <= 7,
  "8-14d": (r: OSRow) => r._aging != null && r._aging >= 8 && r._aging <= 14,
  "15+d":  (r: OSRow) => r._aging != null && r._aging >= 15,
}

export const toLV = (d: ChartSeries | undefined | null): { name: string; value: number }[] =>
  d?.labels?.length ? d.labels.map((name, i) => ({ name, value: d.values?.[i] ?? 0 })) : []

export const toMulti = (d: ChartSeries | undefined | null): Record<string, unknown>[] => {
  if (!d?.labels?.length) return []
  const keys = Object.keys(d).filter(k => k !== 'labels')
  return d.labels.map((name, i) => ({
    name,
    ...Object.fromEntries(keys.map(k => [k, (d[k] as number[] | undefined)?.[i] ?? 0])),
  }))
}

// ─── DrillModal ───────────────────────────────────────────────────────────────

const DRILL_COLS = [
  { key: 'numos',        label: 'OS'       },
  { key: 'nomecliente',  label: 'Cliente'  },
  { key: 'descsituacao', label: 'Status'   },
  { key: 'nomedacidade', label: 'Cidade'   },
  { key: 'nomedaequipe', label: 'Equipe'   },
  { key: 'datacadastro', label: 'Abertura' },
  { key: '_aging',       label: 'Aging'    },
  { key: 'tiposervico',  label: 'Tipo'     },
]

function drillSortValue(r: OSRow, key: string): string | number {
  if (key === 'numos')        return parseInt(r.numos) || 0
  if (key === '_aging')       return r._aging ?? -1
  if (key === 'datacadastro') return toISODate(r.datacadastro ?? '')
  return (r[key] ?? '').toString().toLowerCase()
}

export function DrillModal({ drill, onClose, onOS }: { drill: DrillState | null; onClose: () => void; onOS?: (os: OSRow) => void }) {
  const [search, setSearch] = useState('')
  const [sort,   setSort]   = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '_aging', dir: 'desc' })

  useEffect(() => { setSearch(''); setSort({ key: '_aging', dir: 'desc' }) }, [drill?.title])

  if (!drill) return null
  const { title, rows } = drill

  function toggleSort(key: string) {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const lc       = search.toLowerCase()
  const filtered = search
    ? rows.filter(r =>
        (r.numos || '').includes(search) ||
        (r.nomecliente || '').toLowerCase().includes(lc) ||
        (r.nomedacidade || '').toLowerCase().includes(lc) ||
        (r.nomedaequipe || '').toLowerCase().includes(lc) ||
        (r.descsituacao || '').toLowerCase().includes(lc)
      )
    : rows

  const sorted = [...filtered].sort((a, b) => {
    const av  = drillSortValue(a, sort.key)
    const bv  = drillSortValue(b, sort.key)
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sort.dir === 'asc' ? cmp : -cmp
  })

  return (
    <Modal open title={title}
      subtitle={`${rows.length} OS encontradas${search ? ` · ${sorted.length} exibidas` : ''}`}
      onClose={onClose} maxWidth="1100px">
      <div className="p-4 space-y-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por OS, cliente, cidade ou equipe..."
          className="w-full bg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-label
                     text-text placeholder:text-muted/60 outline-none focus:border-primary/50 transition-colors"
          autoFocus />
        <div className="overflow-auto max-h-[55vh]">
          <table className="w-full text-caption">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.08] bg-surface">
                {DRILL_COLS.map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="px-3 py-2 text-left text-caption font-bold text-muted uppercase tracking-wide
                               whitespace-nowrap cursor-pointer select-none hover:text-secondary transition-colors">
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sort.key !== col.key
                        ? <ChevronDown size={9} className="opacity-20 flex-shrink-0" />
                        : sort.dir === 'asc'
                          ? <ChevronUp   size={9} className="text-primary flex-shrink-0" />
                          : <ChevronDown size={9} className="text-primary flex-shrink-0" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {sorted.slice(0, 250).map(r => (
                <tr key={r.numos} className="hover:bg-surface/20 transition-colors">
                  <td className="px-1 py-1 font-mono whitespace-nowrap">
                    <button type="button" onClick={() => onOS?.(r)}
                            className="min-h-11 rounded-md px-2 text-primary transition-colors hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            aria-label={`Abrir detalhes da OS ${r.numos}`}>
                      {r.numos}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-secondary max-w-[140px] truncate">{r.nomecliente || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-caption font-bold px-1.5 py-0.5 rounded-full ${
                      r.descsituacao === 'Concluída'   ? 'badge-green'  :
                      r.descsituacao === 'Atendimento' ? 'badge-cyan'   :
                      r.descsituacao === 'Pendente'    ? 'badge-yellow' :
                      'bg-surface/40 text-muted'
                    }`}>{r.descsituacao}</span>
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{r.nomedacidade || '—'}</td>
                  <td className="px-3 py-2 text-muted max-w-[130px] truncate" title={r.nomedaequipe}>{r.nomedaequipe || '—'}</td>
                  <td className="px-3 py-2 font-mono text-muted whitespace-nowrap">{r.datacadastro?.split(' ')[0] || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r._aging != null ? (
                      <span className={`font-mono font-semibold ${r._aging > 7 ? 'text-red' : r._aging > 3 ? 'text-yellow' : 'text-green'}`}>
                        {r._aging}d
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap truncate max-w-[100px]">{r.tiposervico || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 250 && (
            <p className="text-center text-caption text-muted py-3">
              Mostrando 250 de {sorted.length} resultados — refine a busca para ver mais
            </p>
          )}
          {sorted.length === 0 && (
            <p className="text-center text-caption text-muted py-8">Nenhuma OS encontrada para este filtro</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── ForecastCard ─────────────────────────────────────────────────────────────

const CONF_STYLE = {
  alta:  'bg-green/15 text-green border-green/25',
  media: 'bg-yellow/15 text-yellow border-yellow/25',
  baixa: 'bg-orange/15 text-orange border-orange/25',
}
const TEND_STYLE = {
  crescente:   { cls: 'text-red',      Icon: TrendingUp   },
  estável:     { cls: 'text-cyan-400', Icon: Minus        },
  decrescente: { cls: 'text-green',    Icon: TrendingDown },
}

type EvolAny = { labels?: string[]; [k: string]: unknown }

export function ForecastCard({ evolucao, totalAtivo, fila }: { evolucao: unknown; totalAtivo: number; fila: number }) {
  const ev = evolucao as EvolAny | undefined
  const [aiEnabled, setAiEnabled] = useState(false)
  const { forecast, narrativa, cached, isFetching, isError } = useAIForecast({
    evolucao: ev as unknown as import('../../lib/types').EvolucaoData ?? { labels: [], abertas: [], concluidas: [] },
    totalAtivo, fila, enabled: aiEnabled,
  })
  const tend = forecast ? (TEND_STYLE[forecast.tendencia] ?? TEND_STYLE['estável']) : null

  if ((ev?.labels?.length ?? 0) < 7 || !forecast) return null

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <span className="text-body font-bold text-text">Previsão de Demanda — próximos 7 dias</span>
        <span className="text-caption text-muted/60 ml-1">regressão linear + sazonalidade · R²={forecast.r2}</span>
        {isFetching && <span className="text-caption text-muted animate-pulse ml-auto">Analisando…</span>}
        {cached && !isFetching && <span className="text-caption text-muted/50 ml-auto">cache</span>}
      </div>

      <div className="flex items-start gap-3">
        {tend && <tend.Icon size={16} className={`${tend.cls} flex-shrink-0 mt-0.5`} />}
        <div className="flex-1">
          <span className={`text-caption font-bold uppercase tracking-wider ${tend?.cls ?? 'text-muted'}`}>
            {forecast.tendencia}
          </span>
          {narrativa ? (
            <p className="text-caption text-secondary mt-0.5 leading-relaxed">{narrativa}</p>
          ) : !aiEnabled ? (
            <button
              onClick={() => setAiEnabled(true)}
              className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary mt-1"
            >
              <Sparkles size={11} /> Explicar com IA
            </button>
          ) : isError ? (
            <p className="text-caption text-muted mt-0.5">Explicação indisponível — verifique ANTHROPIC_API_KEY no servidor.</p>
          ) : null}
        </div>
      </div>

      {forecast.pico_previsto && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange/[0.07] border border-orange/20">
          <TrendingUp size={12} className="text-orange flex-shrink-0" />
          <span className="text-caption text-secondary">
            Pico previsto: <span className="font-bold text-text">{forecast.pico_previsto.data}</span>
            {' '}— <span className="font-bold text-orange">{forecast.pico_previsto.volume} OS</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5">
        {forecast.previsao.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-caption text-muted font-semibold">{d.data}</span>
            <div className="w-full aspect-square flex items-center justify-center rounded-lg bg-surface border border-white/[0.08]">
              <span className="text-body font-bold text-text">{d.volume}</span>
            </div>
            <span className={`text-caption font-bold px-1.5 py-0.5 rounded-full border ${CONF_STYLE[d.confianca] ?? CONF_STYLE['media']}`}>
              {d.confianca}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── TabDistribuicao ──────────────────────────────────────────────────────────

function RankedDistribution({ data, color, onSelect }: {
  data: DistributionItem[]
  color: string
  onSelect: (item: DistributionItem) => void
}) {
  const max = data[0]?.value || 1
  if (!data.length) return <p className="px-4 py-10 text-center text-label text-muted">Sem dados neste recorte.</p>
  return (
    <div className="space-y-1 px-3 pb-3" role="list">
      {data.map(item => (
        <button key={item.name} type="button" onClick={() => onSelect(item)} role="listitem"
                aria-label={`${item.name}: ${item.value} OS, ${item.pct}% da amostra`}
                className="group relative min-h-11 w-full overflow-hidden rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-white/[0.08] hover:bg-surface/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          <span className="absolute inset-y-1 left-1 rounded-md opacity-[0.12] transition-opacity group-hover:opacity-[0.18]"
                style={{ width: `${Math.max(3, Math.round(item.value / max * 100))}%`, background: color }} />
          <span className="relative flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-label font-semibold text-secondary">{item.name}</span>
            <span className="font-mono text-body font-bold tabular-nums text-text">{item.value}</span>
            <span className="w-10 text-right font-mono text-caption tabular-nums text-muted">{item.pct}%</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function TabDistribuicao({ d, rows, onDrill }: { d: Record<string,unknown>; rows: OSRow[]; onDrill: OnDrill }) {
  const gd = d as Record<string, ChartSeries>
  const statusData  = sortDistribution(gd.status)
  const tipoData    = sortDistribution(gd.tipo)
  const cidadeData  = sortDistribution(gd.cidade)
  const equipesData = sortDistribution(gd.equipes)
  const agingData   = sortDistribution(gd.aging)
  const summary     = buildDistribuicaoSummary(rows.length, gd)
  const cards = [
    { label: 'OS na amostra', value: summary.total.toLocaleString('pt-BR'), sub: 'após período e frente' },
    { label: 'Status predominante', value: summary.status?.name ?? '—', sub: summary.status ? `${summary.status.value} OS · ${summary.status.pct}%` : 'sem dados' },
    { label: 'Categoria predominante', value: summary.categoria?.name ?? '—', sub: summary.categoria ? `${summary.categoria.value} OS · ${summary.categoria.pct}%` : 'sem dados' },
    { label: 'Maior volume', value: summary.cidade?.name ?? '—', sub: summary.cidade ? `${summary.cidade.value} OS · ${summary.cidade.pct}%` : 'sem dados' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="min-h-24 rounded-xl border border-white/[0.08] bg-card p-4">
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted">{card.label}</p>
            <p className="mt-2 truncate font-mono text-xl font-bold text-text">{card.value}</p>
            <p className="mt-1 text-caption text-muted">{card.sub}</p>
          </div>
        ))}
      </div>

      <SectionTitle icon={BarChart2}>Composição da amostra</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Status das OS · quantidade e participação" dot="#4ade80" height="h-auto">
          <RankedDistribution data={statusData} color="#4ade80"
            onSelect={entry => onDrill(`Status: ${entry.name}`, rows.filter(r => r.descsituacao === entry.name))} />
        </ChartCard>

        <ChartCard title="Categoria de OS" dot="#22d3ee" height="h-56">
          <DonutChart
            data={tipoData} colors={COLORS} centerLabel="OS"
            onClick={(entry) => {
              const catMap: Record<string, string> = {
                'Instalação': 'INSTALACAO', 'VT / Manutenção': 'VT_MANUTENCAO', 'Serviço': 'SERVICO', 'Rede': 'REDE',
              }
              const cat = catMap[entry.name]
              onDrill(`${entry.name}`, cat
                ? rows.filter(r => r._categoria === cat)
                : rows.filter(r => entry.name === 'Serviço' ? r._categoria === 'SERVICO' : false)
              )
            }}
          />
        </ChartCard>
      </div>

      <SectionTitle icon={BarChart2}>Distribuição operacional</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="OS por Cidade" dot="#facc15" height="h-auto">
          <RankedDistribution data={cidadeData} color="#facc15"
            onSelect={entry => onDrill(`Cidade: ${entry.name}`, rows.filter(r => (r.nomedacidade || '').trim() === entry.name))} />
        </ChartCard>

        <ChartCard title="Top 10 Equipes Designadas · volume de OS" dot="#3b82f6" height="h-auto">
          <RankedDistribution data={equipesData} color="#3b82f6"
            onSelect={entry => onDrill(`Equipe designada: ${entry.name}`, rows.filter(r => shortEquipe(r.nomedaequipe || '') === entry.name))} />
        </ChartCard>
      </div>

      <ChartCard title="Aging das OS · quantidade e participação" dot="#f97316" height="h-auto">
        <RankedDistribution data={agingData} color="#f97316"
          onSelect={entry => { const fn = (AGING_FILTER as Record<string, (r: OSRow) => boolean>)[entry.name]; if (fn) onDrill(`Aging: ${entry.name}`, rows.filter(fn)) }} />
      </ChartCard>
    </div>
  )
}

// ─── TabTendencia ─────────────────────────────────────────────────────────────

export function TabTendencia({ d, rows, onDrill, totalAtivo = 0, fila = 0 }: {
  d: Record<string,unknown>; rows: OSRow[]; onDrill: OnDrill; totalAtivo?: number; fila?: number
}) {
  type MensalType = { labels?: string[]; abertas?: number[]; concluidas?: number[]; slaExcedido?: number[] }
  const mensal    = (d.mensal as MensalType | undefined)
  const mensalData = (mensal?.labels ?? []).map((name: string, i: number) => ({
    name,
    Abertas:        mensal?.abertas?.[i]     ?? 0,
    Concluídas:     mensal?.concluidas?.[i]  ?? 0,
    'SLA Excedido': mensal?.slaExcedido?.[i] ?? 0,
  }))

  type EvolucaoType = { labels?: string[]; abertas?: number[]; concluidas?: number[] }
  const evolucao = d.evolucao as EvolucaoType | undefined
  const evolucaoData = (evolucao?.labels ?? []).map((name, i) => ({
    name,
    Abertas: evolucao?.abertas?.[i] ?? 0,
    Concluídas: evolucao?.concluidas?.[i] ?? 0,
  }))
  const taxaDiaData     = toLV(d.taxaDia as ChartSeries | undefined)
  const summary = buildTendenciaSummary(evolucao as import('../../lib/types').EvolucaoData | undefined)
  const cards = [
    { label: `Abertas · ${summary.dias} dias`, value: summary.abertas, sub: `média ${summary.mediaAbertas.toLocaleString('pt-BR')} por dia`, tone: 'text-blue-400' },
    { label: 'Concluídas reais', value: summary.concluidas, sub: 'pela data de baixa/execução', tone: 'text-green' },
    { label: 'Saldo operacional', value: summary.saldo > 0 ? `+${summary.saldo}` : summary.saldo, sub: summary.saldo >= 0 ? 'conclusões acima das aberturas' : 'aberturas acima das conclusões', tone: summary.saldo >= 0 ? 'text-green' : 'text-red' },
    { label: 'Pico de abertura', value: summary.pico?.valor ?? 0, sub: summary.pico?.data ?? 'sem dados', tone: 'text-orange' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="min-h-24 rounded-xl border border-white/[0.08] bg-card p-4">
            <p className="text-caption font-bold uppercase tracking-[0.05em] text-muted">{card.label}</p>
            <p className={`mt-2 font-mono text-xl font-bold tabular-nums ${card.tone}`}>{card.value.toLocaleString('pt-BR')}</p>
            <p className="mt-1 text-caption text-muted">{card.sub}</p>
          </div>
        ))}
      </div>

      <ForecastCard evolucao={d.evolucao} totalAtivo={totalAtivo} fila={fila} />

      <SectionTitle icon={TrendingUp}>Fluxo operacional</SectionTitle>

      <ChartCard title="Abertas por cadastro × Concluídas por execução · últimos 30 dias" dot="#3b82f6" height="h-80">
        <AreaChart data={evolucaoData} onClick={(cd: Record<string,unknown>) => {
          type CDPayload = { activeLabel?: string; activePayload?: { name?: string }[] }
          const point = cd as CDPayload
          if (!point.activeLabel || !point.activePayload?.length) return
          const serie = point.activePayload[0].name
          onDrill(`${serie} em ${point.activeLabel}`, serie === 'Concluídas'
            ? rows.filter(r => isExecucaoReal(r.descsituacao) && closeISO(r) === point.activeLabel)
            : rows.filter(r => toISODate(r.datacadastro) === point.activeLabel))
        }}>
          <Area dataKey="Abertas" stroke="#3b82f6" fill="#3b82f6" name="Abertas" />
          <Area dataKey="Concluídas" stroke="#4ade80" fill="#4ade80" name="Concluídas" />
          <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip /><LLegend />
        </AreaChart>
      </ChartCard>

      <SectionTitle icon={TrendingUp}>Visão mensal</SectionTitle>

      <ChartCard title="Abertura × Conclusão × SLA Excedido — Mês a Mês" dot="#3b82f6" height="h-80">
        <AreaChart
          data={mensalData}
          onClick={(cd: Record<string,unknown>) => {
            type CDPayload = { activeLabel?: string; activePayload?: { name?: string }[] }
            const cdp = cd as CDPayload
            if (!cdp?.activeLabel || !cdp?.activePayload?.length) return
            const label = cdp.activeLabel!
            const ds    = cdp.activePayload![0].name
            if (ds === 'Concluídas')
              onDrill(`Concluídas em ${label}`, rows.filter(r => isExecucaoReal(r.descsituacao) && closeISOMonth(r) === label))
            else if (ds === 'SLA Excedido')
              onDrill(`SLA Excedido em ${label}`, rows.filter(r => r._slaExcedido && toISOMonth(r.datacadastro) === label))
            else
              onDrill(`Abertas em ${label}`, rows.filter(r => toISOMonth(r.datacadastro) === label))
          }}>
          <Area dataKey="Abertas"      stroke="#3b82f6" fill="#3b82f6" name="Abertas"      />
          <Area dataKey="Concluídas"   stroke="#4ade80" fill="#4ade80" name="Concluídas"   />
          <Area dataKey="SLA Excedido" stroke="#f87171" fill="#f87171" fillOpacity={0.08} name="SLA Excedido" />
          <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip /><LLegend />
        </AreaChart>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Conclusão da coorte diária (%)" dot="#4ade80" height="h-64">
          <AreaChart
            data={taxaDiaData}
            onClick={(cd: Record<string,unknown>) => {
              if (cd?.activeLabel) onDrill(`OS abertas em ${cd.activeLabel}`, rows.filter(r => toISODate(r.datacadastro) === cd.activeLabel))
            }}>
            <Area dataKey="value" stroke="#4ade80" fill="#4ade80" name="Taxa %" />
            <LXAxis dataKey="name" /><LYAxis /><LGrid /><LTooltip suffix="%" />
          </AreaChart>
          <p className="px-3 pb-3 text-caption text-muted">Percentual das OS abertas em cada dia que atualmente possuem execução real.</p>
        </ChartCard>
        <div className="rounded-xl border border-white/[0.08] bg-card p-5">
          <p className="text-body font-bold text-text">Como interpretar</p>
          <div className="mt-4 space-y-3 text-label leading-relaxed text-secondary">
            <p><span className="font-bold text-blue-400">Abertas</span> seguem a data de cadastro da OS.</p>
            <p><span className="font-bold text-green">Concluídas</span> consideram somente execução real e seguem a data de baixa ou execução.</p>
            <p><span className="font-bold text-red">SLA excedido</span> é associado ao mês de abertura da OS.</p>
            <p className="border-t border-white/[0.08] pt-3 text-muted">Os valores representam o recorte selecionado no cabeçalho e não reconstituem mudanças históricas de status.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TabEstatistica ───────────────────────────────────────────────────────────

export function TabEstatistica({ d, rows, onDrill }: { d: Record<string,unknown>; rows: OSRow[]; onDrill: OnDrill }) {
  const gd = d as Record<string, ChartSeries>
  const agingData  = toLV(gd.aging)
  const cidadeData = toLV(gd.cidade)
  const eficData   = toLV(gd.eficiencia)

  return (
    <div className="space-y-4">
      <SectionTitle icon={Sliders}>Estatísticas de Aging</SectionTitle>

      <ChartCard title="Distribuição de Aging das OS Ativas" dot="#f97316" height="h-64">
        <BarChart data={agingData}>
          <Bar dataKey="value" fill="#f97316"
            onClick={(data: {name: string}) => { const fn = (AGING_FILTER as Record<string, (r: OSRow) => boolean>)[data.name]; if (fn) onDrill(`Aging: ${data.name}`, rows.filter(fn)) }} />
          <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip />
        </BarChart>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="OS por Cidade" dot="#facc15" height="h-64">
          <BarChart data={cidadeData} layout="vertical">
            <Bar dataKey="value" fill="#facc15"
              onClick={(data: Record<string,unknown>) => onDrill(`Cidade: ${data.name}`, rows.filter(r => (r.nomedacidade || '').trim() === data.name))} />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={130} />
            <Grid /><ChartTooltip />
          </BarChart>
        </ChartCard>

        <ChartCard title="Taxa por Equipe (%)" dot="#4ade80" height="h-64">
          <BarChart data={eficData}>
            <Bar dataKey="value" fill="#4ade80"
              onClick={(data: Record<string,unknown>) => onDrill(`Equipe: ${data.name}`, rows.filter(r => shortEquipe(r.nomedaequipe || '') === data.name))} />
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip suffix="%" />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  )
}

// ─── TabCohort ────────────────────────────────────────────────────────────────

export function TabCohort({ d, rows, onDrill }: { d: Record<string,unknown>; rows: OSRow[]; onDrill: OnDrill }) {
  const gd = d as Record<string, { labels?: string[]; total?: number[]; concluidas?: number[]; mesmoMes?: number[]; taxaResolucao?: number[]; mttr?: number[] }>
  type CohortObj = { labels: string[]; total: number[]; concluidas: number[]; mesmoMes: number[]; taxaResolucao: number[]; mttr: number[] }
  const rawC = gd.cohort
  const c: CohortObj = rawC?.labels
    ? { labels: rawC.labels, total: rawC.total ?? [], concluidas: rawC.concluidas ?? [], mesmoMes: rawC.mesmoMes ?? [], taxaResolucao: rawC.taxaResolucao ?? [], mttr: rawC.mttr ?? [] }
    : { labels: [], total: [], concluidas: [], mesmoMes: [], taxaResolucao: [], mttr: [] }

  const cohortBarData = c.labels.map((name, i) => ({
    name,
    Abertas:    c.total[i]      ?? 0,
    Concluídas: c.concluidas[i] ?? 0,
    'Mesmo Mês': c.mesmoMes[i]  ?? 0,
  }))
  const taxaData = c.labels.map((name, i) => ({ name, value: c.taxaResolucao[i] ?? 0 }))
  const mttrData = c.labels.map((name, i) => ({
    name, value: c.mttr[i] ?? 0,
    fill: (c.mttr[i] ?? 0) <= 2 ? '#4ade80' : (c.mttr[i] ?? 0) <= 5 ? '#facc15' : '#f87171',
  }))

  return (
    <div className="space-y-4">
      <SectionTitle icon={ZoomIn}>Cohort de Resolução por Mês de Abertura</SectionTitle>
      <p className="text-caption text-muted -mt-2">
        Cada coluna representa as OS abertas naquele mês e como evoluíram (últimos 12 meses)
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Abertas vs. Concluídas por Mês de Abertura" dot="#3b82f6" height="h-64">
          <BarChart data={cohortBarData}>
            <Bar dataKey="Abertas"    fill="#3b82f6" name="Abertas"
              onClick={(data: Record<string,unknown>) => onDrill(`Cohort ${data.name} — todas as OS`, rows.filter(r => toISOMonth(r.datacadastro) === data.name))} />
            <Bar dataKey="Concluídas" fill="#4ade80" name="Concluídas"
              onClick={(data: Record<string,unknown>) => onDrill(`Cohort ${data.name} — Concluídas`, rows.filter(r => isConcluida(r.descsituacao) && toISOMonth(r.datacadastro) === data.name))} />
            <Bar dataKey="Mesmo Mês"  fill="#c4b5fd" name="Mesmo Mês"
              onClick={(data: Record<string,unknown>) => onDrill(`Cohort ${data.name} — Mesmo Mês`, rows.filter(r => isConcluida(r.descsituacao) && toISOMonth(r.datacadastro) === data.name && closeISOMonth(r) === data.name))} />
            <XAxis dataKey="name" /><YAxis /><Grid /><ChartTooltip /><Legend />
          </BarChart>
        </ChartCard>

        <ChartCard title="Taxa de Resolução por Cohort (%)" dot="#4ade80" height="h-64">
          <AreaChart
            data={taxaData}
            onClick={(cd: Record<string,unknown>) => { if (cd?.activeLabel) onDrill(`Cohort ${cd.activeLabel} — Concluídas`, rows.filter(r => isConcluida(r.descsituacao) && toISOMonth(r.datacadastro) === cd.activeLabel)) }}
            style={{ cursor: 'pointer' }}>
            <Area dataKey="value" stroke="#4ade80" fill="rgba(74,222,128,0.08)" name="Taxa Resolução" />
            <LXAxis dataKey="name" /><LYAxis domain={[0, 100]} /><LGrid /><LTooltip suffix="%" />
          </AreaChart>
        </ChartCard>
      </div>

      <ChartCard title="MTTR Médio por Mês de Abertura (dias)" dot="#f97316" height="h-56">
        <BarChart data={mttrData}>
          <Bar dataKey="value" name="MTTR (dias)"
            onClick={(data: Record<string,unknown>) => onDrill(`Cohort ${data.name} — todas as OS`, rows.filter(r => toISOMonth(r.datacadastro) === data.name))}>
            {mttrData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
          <XAxis dataKey="name" /><YAxis /><Grid />
          <ChartTooltip suffix=" dias" formatter={(v: number) => `MTTR: ${v} dias`} />
        </BarChart>
      </ChartCard>

      {c.labels.length > 0 && (
        <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.08]">
            <p className="text-caption font-bold uppercase tracking-wide text-muted">
              Tabela Cohort Detalhada
              <span className="ml-2 font-normal normal-case tracking-normal text-muted/50">
                — clique em uma linha para ver as OS
              </span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr className="border-b border-white/[0.08] bg-surface">
                  {['Mês','Abertas','Concluídas','Mesmo Mês','Taxa Res.','MTTR Méd.'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-caption font-bold text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {c.labels.map((label, i) => {
                  const taxa  = c.taxaResolucao[i] ?? 0
                  const mttrV = c.mttr[i] ?? 0
                  return (
                    <tr key={label} className="hover:bg-surface/30 cursor-pointer transition-colors"
                        onClick={() => onDrill(`Cohort ${label}`, rows.filter(r => toISOMonth(r.datacadastro) === label))}>
                      <td className="px-4 py-2.5 font-mono text-primary">{label}</td>
                      <td className="px-4 py-2.5 font-mono">{c.total[i] ?? 0}</td>
                      <td className="px-4 py-2.5 font-mono text-green">{c.concluidas[i] ?? 0}</td>
                      <td className="px-4 py-2.5 font-mono text-purple-400">{c.mesmoMes[i] ?? 0}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-caption font-semibold ${taxa >= 80 ? 'text-green' : taxa >= 50 ? 'text-yellow' : 'text-red'}`}>
                          {taxa}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-caption ${mttrV <= 2 ? 'text-green' : mttrV <= 5 ? 'text-yellow' : 'text-red'}`}>
                          {mttrV}d
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
