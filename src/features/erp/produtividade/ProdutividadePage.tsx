import { useMemo, useState, type ComponentType } from 'react'
import {
  TrendingUp, TrendingDown, Minus, BarChart3,
  ChevronDown, ChevronUp, Package, Wrench, Radio, Settings, Sparkles,
} from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { useUIStore } from '../../../store/uiStore'
import { shortEquipe, situacaoVariant } from '../../../lib/osFormat'
import { isCOPE, isReagend, isConcluida } from '../../../lib/transform'
import { Badge } from '../../../components/ui/Badge'
import type { OSRow } from '../../../lib/types'
import { useAIProdutividade } from '../../../hooks/useAIProdutividade'

// Limite de colunas no grid de dias — ranges longos (mensal/anual/custom) mostram
// só os dias mais recentes dentro do range, senão o grid quebra o layout.
const MAX_GRID_DAYS = 31

type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>
interface DayInfo { key: string; label: string; dow: string; isToday: boolean; isWeekend: boolean }
interface TeamEntry {
  team: string; daily: Record<string, OSRow[]>; total: number
  thisWeek: number; prevWeek: number; delta: number; maxDay: number
}
interface DrillInfo { team: string; dayKey: string }

// ─── Helpers de data ──────────────────────────────────────────────────────────

function parseExecDate(r: OSRow): Date | null {
  const raw = (r.dataexecucao || r.databaixa || '').split(' ')[0]
  if (!raw || !raw.includes('/')) return null
  const [d, m, y] = raw.split('/')
  return new Date(+y, +m - 1, +d)
}

function toKey(dt: Date): string {
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${dt.getFullYear()}`
}

function toLabel(key: string): string { return key.slice(0, 5) }

const DOW_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

// Constrói o grid de dias a partir do range do filtro global (from/to), terminando
// em `to` e limitado a `maxDays` colunas — ranges maiores mostram só os dias mais
// recentes dentro do range escolhido.
function getDayLabelsFromRange(from: Date | null | undefined, to: Date | null | undefined, maxDays = MAX_GRID_DAYS): DayInfo[] {
  const today = new Date(); today.setHours(0,0,0,0)
  const start = from ? new Date(from) : new Date(today.getTime() - 13 * 86_400_000)
  const end   = to   ? new Date(to)   : today
  start.setHours(0,0,0,0)
  end.setHours(0,0,0,0)

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const n = Math.min(totalDays, maxDays)

  const days: DayInfo[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i)
    const key = toKey(d)
    days.push({
      key,
      label: toLabel(key),
      dow: DOW_LABELS[d.getDay()],
      isToday: d.getTime() === today.getTime(),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    })
  }
  return days
}

function tipoIcon(r: { _tipo?: string }): { color: string; Icon: IconComp; label: string } {
  if (r._tipo === 'INSTALACAO') return { color: '#3b82f6', Icon: Package,  label: 'Instalação'  }
  if (r._tipo === 'MANUTENCAO') return { color: '#f97316', Icon: Wrench,   label: 'Manutenção'  }
  if (r._tipo === 'REDE')       return { color: '#c4b5fd', Icon: Radio,    label: 'Rede'        }
  return                               { color: '#64748b', Icon: Settings, label: 'Serviço'     }
}

// ─── Build ────────────────────────────────────────────────────────────────────

function buildProdutividade(allRows: OSRow[], days: DayInfo[]): { teams: TeamEntry[]; globalMax: number } {
  const keySet = new Set(days.map(d => d.key))
  const concl  = allRows.filter(r =>
    !isCOPE(r) && !isReagend(r) &&
    isConcluida(r.descsituacao) &&
    !r.descsituacao?.includes('Sem Execução')
  )

  const teamMap = new Map<string, Record<string, OSRow[]>>()
  for (const r of concl) {
    const dt = parseExecDate(r)
    if (!dt) continue
    const key = toKey(dt)
    if (!keySet.has(key)) continue
    const team = shortEquipe(r.nomedaequipe) || 'Sem equipe'
    if (!teamMap.has(team)) teamMap.set(team, {})
    const td = teamMap.get(team)!
    if (!td[key]) td[key] = []
    td[key].push(r)
  }

  const half        = Math.floor(days.length / 2)
  const thisWeekDays = days.slice(half)
  const prevWeekDays = days.slice(0, half)
  const cnt = (daily: Record<string, OSRow[]>, key: string) => daily[key]?.length ?? 0

  const teams = [...teamMap.entries()]
    .map(([team, daily]: [string, Record<string, OSRow[]>]) => {
      const thisWeek = thisWeekDays.reduce((s: number, d: DayInfo) => s + cnt(daily, d.key), 0)
      const prevWeek = prevWeekDays.reduce((s: number, d: DayInfo) => s + cnt(daily, d.key), 0)
      const total    = days.reduce((s: number, d: DayInfo) => s + cnt(daily, d.key), 0)
      const maxDay   = Math.max(...days.map((d: DayInfo) => cnt(daily, d.key)), 1)
      const delta    = thisWeek - prevWeek
      return { team, daily, total, thisWeek, prevWeek, delta, maxDay }
    })
    .sort((a, b) => b.thisWeek - a.thisWeek)

  const globalMax = Math.max(...teams.flatMap(t => days.map((d: DayInfo) => cnt(t.daily, d.key))), 1)
  return { teams, globalMax }
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color }}>{children}</span>
    </div>
  )
}

// ─── DeltaBadge ───────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  const color  = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#6b7280'
  const Icon   = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const prefix = delta > 0 ? '+' : ''
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border"
          style={{ background: `${color}12`, borderColor: `${color}30`, color }}>
      <Icon size={8} />{prefix}{delta}
    </span>
  )
}

// ─── OS Inline Table ──────────────────────────────────────────────────────────

const OS_COLS = [
  { key: 'numos',       label: 'OS'        },
  { key: 'nomecliente', label: 'Cliente'   },
  { key: 'nomedacidade',label: 'Cidade'    },
  { key: 'tiposervico', label: 'Serviço'   },
  { key: 'descsituacao',label: 'Status'    },
  { key: '_exec',       label: 'Executada' },
]

function execTime(r: OSRow): string {
  const raw = (r.dataexecucao || r.databaixa || '').split(' ')[1] ?? ''
  return raw || '99:99' // sem hora vai para o fim
}

function OSInlineTable({ rows, dayLabel }: { rows: OSRow[]; dayLabel: string }) {
  if (!rows?.length) return null

  const sorted = [...rows].sort((a: OSRow, b: OSRow) => execTime(a).localeCompare(execTime(b)))

  // Resumo por categoria
  const cats = [
    { _tipo: 'INSTALACAO' },
    { _tipo: 'MANUTENCAO' },
    { _tipo: 'REDE'       },
    { _tipo: 'OUTRO'      },
  ].map(c => {
    const isOutro = c._tipo === 'OUTRO'
    const count = rows.filter(r =>
      isOutro
        ? !['INSTALACAO','MANUTENCAO','REDE'].includes(r._tipo)
        : r._tipo === c._tipo
    ).length
    const icon = tipoIcon(isOutro ? {} : { _tipo: c._tipo })
    return { ...icon, count }
  }).filter(c => c.count > 0)

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] overflow-hidden bg-surface/50">
      {/* Header com resumo por categoria */}
      <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center gap-4 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mr-1">
          {rows.length} OS · {dayLabel}
        </span>
        {cats.map(c => (
          <span key={c.label}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${c.color}18`, color: c.color }}>
            <c.Icon size={11} />
            {c.label}
            <span className="font-mono font-black">{c.count}</span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.05] bg-surface/20">
              {OS_COLS.map(c => (
                <th key={c.key}
                    className="px-3 py-2 text-left text-[10px] font-bold text-muted uppercase tracking-[0.04em] whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {sorted.map(r => {
              const { color, Icon } = tipoIcon(r)
              const exec = (r.dataexecucao || r.databaixa || '').split(' ')
              const hora = exec[1]?.slice(0, 5) || '—'
              return (
                <tr key={r.numos} className="hover:bg-surface/20 transition-colors">
                  {/* OS */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono font-bold text-primary">{r.numos}</span>
                  </td>
                  {/* Cliente */}
                  <td className="px-3 py-2.5 max-w-[160px]">
                    <span className="text-text truncate block">{r.nomecliente || '—'}</span>
                  </td>
                  {/* Cidade */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-secondary">
                    {r.nomedacidade || '—'}
                  </td>
                  {/* Tipo serviço */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {Icon && <Icon size={11} style={{ color }} />}
                      <span className="text-muted truncate max-w-[120px] block">{r.tiposervico || '—'}</span>
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Badge variant={situacaoVariant(r.descsituacao)} className="text-[9px] px-1.5 py-px">
                      {r.descsituacao === 'Atendimento/Finalizadas' ? 'Executada' : r.descsituacao ?? '—'}
                    </Badge>
                  </td>
                  {/* Hora */}
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-muted">
                    {hora}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TeamRow ──────────────────────────────────────────────────────────────────

function TeamRow({ rank, entry, days, thisLen, prevLen, globalMax, isExpanded, onToggle, activeDayKey, onDayClick }: {
  rank:        number
  entry:       TeamEntry
  days:        DayInfo[]
  thisLen:     number
  prevLen:     number
  globalMax:   number
  isExpanded:  boolean
  onToggle:    () => void
  activeDayKey: string | null
  onDayClick:  (team: string, dayKey: string) => void
}) {
  const cnt = (key: string) => entry.daily[key]?.length ?? 0
  const peak = entry.maxDay

  // Day currently drilled for this team
  const activeDay = activeDayKey ? days.find((d: DayInfo) => d.key === activeDayKey) : null
  const drillRows = activeDayKey ? (entry.daily[activeDayKey] || []) : []

  return (
    <>
      {/* ── Summary row ── */}
      <tr
        onClick={onToggle}
        className="border-b border-white/[0.04] hover:bg-surface/20 cursor-pointer transition-colors"
      >
        {/* Rank */}
        <td className="px-4 py-3 w-10">
          {rank <= 3 ? (
            <span className="font-mono font-black text-[13px]"
                  style={{ color: ['#fbbf24','#94a3b8','#cd7c3c'][rank-1] }}>
              #{rank}
            </span>
          ) : (
            <span className="font-mono text-[12px] text-muted">{rank}</span>
          )}
        </td>

        {/* Team name */}
        <td className="px-3 py-3">
          <p className="text-[12px] font-semibold text-text truncate max-w-[140px]">{entry.team}</p>
        </td>

        {/* Sparkline */}
        <td className="px-3 py-3">
          <div className="flex items-end gap-[2px] h-7">
            {days.map((d: DayInfo) => {
              const val   = cnt(d.key)
              const pct   = globalMax > 0 ? (val / globalMax) * 100 : 0
              const color = d.isToday ? '#3b82f6' : d.isWeekend ? '#374151' : '#3b82f6'
              return (
                <div key={d.key} className="relative group flex-1 flex items-end">
                  <div className="w-full rounded-sm transition-all"
                       style={{ height: `${Math.max(val > 0 ? 15 : 2, pct * 0.28)}px`,
                                background: val > 0 ? color : 'rgba(255,255,255,0.06)' }} />
                  {val > 0 && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2
                                    bg-elevated border border-white/[0.08] text-text text-[9px]
                                    font-bold px-1.5 py-0.5 rounded whitespace-nowrap
                                    opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                      {d.label}: {val}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </td>

        <td className="px-3 py-3 text-right">
          <p className="font-mono font-bold text-[18px] leading-none text-text">{entry.thisWeek}</p>
          <p className="text-[9px] text-muted mt-0.5">últimos {thisLen}d</p>
        </td>

        <td className="px-3 py-3 text-right">
          <DeltaBadge delta={entry.delta} />
          <p className="text-[9px] text-muted mt-1">vs {prevLen}d ant.</p>
        </td>

        <td className="px-3 py-3 text-right">
          <p className="font-mono text-[14px] text-secondary">{entry.total}</p>
          <p className="text-[9px] text-muted mt-0.5">{days.length} dias</p>
        </td>

        <td className="px-3 py-3 text-right">
          <p className="font-mono text-[13px] text-secondary">{peak}</p>
          <p className="text-[9px] text-muted mt-0.5">pico/dia</p>
        </td>

        <td className="px-4 py-3 w-8">
          {isExpanded
            ? <ChevronUp size={12} className="text-muted" />
            : <ChevronDown size={12} className="text-muted" />}
        </td>
      </tr>

      {/* ── Mini cards + inline table ── */}
      {isExpanded && (
        <tr className="border-b border-white/[0.04] bg-surface/15">
          <td colSpan={8} className="px-4 pt-3 pb-4">

            {/* Day cards */}
            <div className="flex flex-wrap gap-2">
              {days.map((d: DayInfo) => {
                const val       = cnt(d.key)
                const isActive  = activeDayKey === d.key
                const clickable = val > 0
                const color = val === 0
                  ? 'rgba(255,255,255,0.06)'
                  : val >= peak * 0.8 ? '#4ade80'
                  : val >= peak * 0.4 ? '#3b82f6'
                  : '#475569'

                return (
                  <div
                    key={d.key}
                    onClick={clickable ? e => { e.stopPropagation(); onDayClick(entry.team, d.key) } : undefined}
                    className={[
                      'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 border select-none',
                      'transition-all duration-150',
                      clickable ? 'cursor-pointer' : 'opacity-40',
                      isActive
                        ? 'ring-2 ring-offset-1 ring-offset-transparent scale-105'
                        : clickable ? 'hover:scale-105 active:scale-95' : '',
                    ].join(' ')}
                    style={{
                      background:   isActive ? `${color}28` : `${color}14`,
                      borderColor:  isActive ? color         : `${color}30`,
                      ['--ring-color' as string]: color,
                      minWidth: '44px',
                    } as React.CSSProperties}
                    title={clickable ? (isActive ? 'Fechar' : `Ver ${val} OS de ${d.label}`) : undefined}
                  >
                    <span className={`text-[9px] font-bold ${d.isToday ? 'text-primary' : 'text-muted'}`}>
                      {d.dow}
                    </span>
                    <span className="text-[10px] text-muted">{d.label}</span>
                    <span className="font-mono font-black text-[20px] leading-none"
                          style={{ color: val > 0 ? color : 'rgba(255,255,255,0.15)' }}>
                      {val}
                    </span>
                    {/* Seta indicadora */}
                    {clickable && (
                      <ChevronDown
                        size={11}
                        className="transition-transform duration-200"
                        style={{
                          color,
                          opacity: 0.7,
                          transform: isActive ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tabela inline de OS */}
            {activeDayKey && drillRows.length > 0 && (
              <OSInlineTable rows={drillRows} dayLabel={activeDay?.label ?? activeDayKey} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── ProdutividadePage ────────────────────────────────────────────────────────

export default function ProdutividadePage() {
  const { rows, isLoading } = useERPRows()
  const { dateFilter } = useUIStore()
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [activeDrill, setActiveDrill] = useState<DrillInfo | null>(null)
  const [aiEnabled,   setAiEnabled]   = useState(false)

  const days = useMemo(
    () => getDayLabelsFromRange(dateFilter?.from, dateFilter?.to),
    [dateFilter?.from, dateFilter?.to]
  )
  const { teams, globalMax } = useMemo(() => buildProdutividade(rows, days), [rows, days])

  const half     = Math.floor(days.length / 2)
  const thisLen  = days.length - half
  const prevLen  = half

  const totalThis  = teams.reduce((s, t) => s + t.thisWeek, 0)
  const totalPrev  = teams.reduce((s, t) => s + t.prevWeek, 0)
  const totalDelta = totalThis - totalPrev
  const melhorou   = teams.filter(t => t.delta > 0).length
  const piorou     = teams.filter(t => t.delta < 0).length
  const topTeam    = teams[0]

  // Equipes com queda > 20% no período atual vs anterior
  const quedas = useMemo(() => teams
    .filter(t => t.prevWeek > 0 && t.thisWeek < t.prevWeek)
    .map(t => {
      const delta_pct = t.prevWeek > 0
        ? Math.round(((t.thisWeek - t.prevWeek) / t.prevWeek) * 100)
        : 0
      return { equipe: t.team, atual: t.thisWeek, anterior: t.prevWeek, delta_pct }
    })
    .filter(q => q.delta_pct <= -20),
    [teams]
  )

  const aiContexto = useMemo(() => {
    const total = teams.reduce((s, t) => s + t.total, 0)
    return `${teams.length} equipes · ${total} OS em ${days.length} dias · período atual ${totalThis} vs anterior ${totalPrev}`
  }, [teams, totalThis, totalPrev, days.length])

  const { data: aiProdutividade, isLoading: aiLoading } = useAIProdutividade({
    quedas,
    contexto: aiContexto,
    enabled:  aiEnabled,
  })

  function handleDayClick(team: string, dayKey: string) {
    setActiveDrill(prev =>
      prev?.team === team && prev?.dayKey === dayKey
        ? null                    // mesmo card → fecha
        : { team, dayKey }        // outro card → abre
    )
  }

  function handleToggle(team: string) {
    setExpanded(prev => {
      if (prev === team) { setActiveDrill(null); return null }
      setActiveDrill(null)
      return team
    })
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      Carregando…
    </div>
  )

  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Produtividade por Equipe</h1>
        <p className="text-[12px] text-muted">
          Histórico de {days.length} dia{days.length > 1 ? 's' : ''} · OS executadas por equipe · expanda e clique no dia para ver as ordens
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `Executadas (últimos ${thisLen}d)`, value: totalThis,  sub: `${totalPrev} nos ${prevLen}d anteriores`,  color: '#3b82f6', delta: totalDelta },
          { label: 'Equipes melhoraram',       value: melhorou,  sub: `${piorou} reduziram · ${teams.length - melhorou - piorou} estáveis`, color: '#4ade80' },
          { label: 'Pior queda',               value: piorou,    sub: 'equipes com redução',              color: '#f87171' },
          topTeam
            ? { label: `Líder (${thisLen}d)`, value: topTeam.thisWeek, sub: topTeam.team, color: '#f59e0b' }
            : { label: '—', value: '—', sub: '', color: '#6b7280' },
        ].map((k, i) => (
          <div key={i}
               className="relative overflow-hidden rounded-xl border bg-card"
               style={{ borderColor: `${k.color}22` }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: k.color }} />
            <div className="p-4">
              <p className="text-[11px] text-muted mb-2">{k.label}</p>
              <div className="flex items-end gap-2">
                <p className="font-mono font-black text-[30px] leading-none tabular-nums"
                   style={{ color: k.color }}>{k.value}</p>
                {k.delta != null && <DeltaBadge delta={k.delta} />}
              </div>
              <p className="text-[10px] text-muted mt-1 truncate">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <section className="space-y-2">
        <SectionLabel icon={BarChart3} color="#3b82f6">Ranking — {teams.length} equipes · {days.length} dias</SectionLabel>

        {teams.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-12 text-center">
            <p className="text-[12px] text-muted">Nenhuma OS executada no período</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            {/* Day header strip */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.05] bg-surface/15">
              <div className="w-10 flex-shrink-0" />
              <div className="w-[140px] flex-shrink-0" />
              <div className="flex flex-1 gap-[2px] min-w-0">
                {days.map(d => (
                  <div key={d.key} className="flex-1 text-center">
                    <span className={`text-[8px] font-bold ${d.isToday ? 'text-primary' : 'text-muted/50'}`}>
                      {d.dow}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-[60px] flex-shrink-0" />
              <div className="w-[64px] flex-shrink-0" />
              <div className="w-[50px] flex-shrink-0" />
              <div className="w-[50px] flex-shrink-0" />
              <div className="w-8 flex-shrink-0" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-surface/10">
                    <th className="px-4 py-2 text-left w-10" />
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Equipe</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Últimos {days.length} dias</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{thisLen}d</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Δ</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{days.length}d</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Pico</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {teams.map((entry, i) => (
                    <TeamRow
                      key={entry.team}
                      rank={i + 1}
                      entry={entry}
                      days={days}
                      thisLen={thisLen}
                      prevLen={prevLen}
                      globalMax={globalMax}
                      isExpanded={expanded === entry.team}
                      onToggle={() => handleToggle(entry.team)}
                      activeDayKey={activeDrill?.team === entry.team ? activeDrill.dayKey : null}
                      onDayClick={dayKey => handleDayClick(entry.team, dayKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── AI Produtividade ──────────────────────────────────────────────── */}
      {!aiEnabled ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-primary/40" />
            <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Análise de Quedas de Produtividade · IA</span>
          </div>
          <button
            onClick={() => setAiEnabled(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-primary/70 hover:text-primary
                       px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                       transition-all duration-fast"
          >
            <Sparkles size={11} /> Analisar com IA
          </button>
        </div>
      ) : (aiLoading || aiProdutividade) && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-primary" />
            <span className="text-[11px] font-bold text-primary/80 uppercase tracking-wide">
              Análise de Quedas de Produtividade · IA
            </span>
            {aiLoading && (
              <span className="text-[10px] text-muted animate-pulse ml-auto">Analisando…</span>
            )}
          </div>
          {aiProdutividade && (
            <>
              {aiProdutividade.narrativa && (
                <p className="text-[12px] text-secondary leading-relaxed">{aiProdutividade.narrativa}</p>
              )}
              {aiProdutividade.analises && aiProdutividade.analises.length > 0 && (
                <div className="space-y-2">
                  {aiProdutividade.analises.map((a, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-surface/30 p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <TrendingDown size={12} className="text-red flex-shrink-0" />
                        <span className="text-[12px] font-semibold text-text">{a.equipe}</span>
                      </div>
                      <p className="text-[11px] text-muted pl-5">
                        <span className="font-semibold text-secondary">Causa: </span>
                        {a.causa}
                      </p>
                      <p className="text-[11px] text-muted pl-5">
                        <span className="font-semibold text-primary/70">Recomendação: </span>
                        {a.recomendacao}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 text-[10px] text-muted flex-wrap">
        {[['#3b82f6','Hoje'], ['#3b82f6','Dias úteis'], ['rgba(255,255,255,0.06)','Sem OS']].map(([c,l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
          </span>
        ))}
        <span>· Expanda uma equipe → clique no dia para ver as OS</span>
      </div>
    </div>
  )
}
