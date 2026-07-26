import type { ReactNode } from 'react'
import { AlertTriangle, ArrowUpRight, CircleCheck, Radio } from 'lucide-react'
import type { KPI, OSRow } from '../../lib/types'
import type { ProjecaoRisco } from '../../lib/builders/dashboard'

interface DashboardCommandCenterProps {
  priorities: KPI[]
  projection: ProjecaoRisco
  criticalNow: number
  onPriority: (priority: KPI) => void
  onProjection: (rows: OSRow[]) => void
  pulse: ReactNode
}

const TONE_CLASSES: Record<string, string> = {
  red: 'border-red/20 bg-red/[0.045] hover:border-red/35',
  orange: 'border-orange/20 bg-orange/[0.04] hover:border-orange/35',
  yellow: 'border-yellow/20 bg-yellow/[0.04] hover:border-yellow/35',
}

const VALUE_CLASSES: Record<string, string> = {
  red: 'text-red',
  orange: 'text-orange',
  yellow: 'text-yellow',
}

function numericValue(value: KPI['value']): number {
  const parsed = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function DashboardCommandCenter({
  priorities,
  projection,
  criticalNow,
  onPriority,
  onProjection,
  pulse,
}: DashboardCommandCenterProps) {
  const activeCount = priorities.filter(priority => numericValue(priority.value) > 0).length
  const projectedTotal = projection.proj24h + projection.proj48h

  return (
    <div
      data-testid="dashboard-command-center"
      className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]"
    >
      <section
        aria-labelledby="dashboard-priorities-title"
        className="order-1 flex h-full min-w-0 flex-col rounded-lg border border-border bg-card xl:order-2"
      >
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2 sm:min-h-12 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-red/20 bg-red/[0.07] text-red">
              <AlertTriangle size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="dashboard-priorities-title" className="text-body font-bold text-text">
                Prioridades agora
              </h2>
              <p className="hidden text-caption text-muted sm:block">Exceções ordenadas para atuação</p>
            </div>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-surface/50 px-2 py-1 text-caption font-semibold text-secondary">
            {activeCount > 0 ? <Radio size={9} className="text-orange" aria-hidden="true" /> : <CircleCheck size={10} className="text-green" aria-hidden="true" />}
            {activeCount} {activeCount === 1 ? 'frente ativa' : 'frentes ativas'}
          </span>
        </header>

        <div className="flex-1 space-y-1 p-2 sm:space-y-1.5 sm:p-2.5">
          {priorities.map(priority => {
            const count = numericValue(priority.value)
            const isActive = count > 0
            const toneClass = TONE_CLASSES[priority.accent] ?? 'border-white/[0.07] bg-bg/35 hover:border-white/[0.15]'
            const valueClass = isActive ? (VALUE_CLASSES[priority.accent] ?? 'text-text') : 'text-muted'

            return (
              <button
                key={priority.id}
                type="button"
                onClick={() => onPriority(priority)}
                aria-label={`${priority.title}. ${priority.value}. ${priority.sub ?? ''}. Abrir`}
                className={`group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-1 text-left
                            transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${toneClass}`}
              >
                <span className={`w-9 flex-shrink-0 text-right text-title font-black tabular-nums ${valueClass}`}>
                  {priority.value}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-semibold text-text">{priority.title}</span>
                  {priority.sub && <span className="hidden truncate text-caption text-muted sm:block">{priority.sub}</span>}
                </span>
                <span className="inline-flex flex-shrink-0 items-center gap-1 text-caption font-semibold text-muted transition-colors group-hover:text-primary">
                  Abrir <ArrowUpRight size={11} aria-hidden="true" />
                </span>
              </button>
            )
          })}
        </div>

        {projectedTotal > 0 && (
          <button
            type="button"
            onClick={() => onProjection(projection.amostra)}
            aria-label={`${projectedTotal} em risco. ${criticalNow} críticas agora, mais ${projection.proj24h} em 24 horas e ${projection.proj48h} em 48 horas. Ver OS`}
            className="group mx-2.5 mb-2.5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-orange/20
                       bg-orange/[0.045] px-3 py-1 text-left transition-colors duration-200 hover:border-orange/40
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
          >
            <AlertTriangle size={13} className="flex-shrink-0 text-orange" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-caption text-secondary">
              <span className="sm:hidden">
                <strong className="text-orange">{projectedTotal} em risco</strong>
                {' · '}próximas 48h
              </span>
              <span className="hidden sm:inline">
                <strong className="text-orange">{projectedTotal} em risco</strong>
                {' · '}+{projection.proj24h} em ≤24h{' · '}+{projection.proj48h} em ≤48h
              </span>
            </span>
            <span className="inline-flex flex-shrink-0 items-center gap-1 text-caption font-semibold text-orange">
              Ver OS <ArrowUpRight size={11} aria-hidden="true" />
            </span>
          </button>
        )}
      </section>

      <div className="order-2 min-w-0 xl:order-1">{pulse}</div>
    </div>
  )
}
