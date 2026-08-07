import { Warning, ArrowUpRight, CheckCircle, Broadcast, WarningOctagon } from '@phosphor-icons/react'
import type { KPI, OSRow } from '../../lib/types'
import type { ProjecaoRisco } from '../../lib/builders/dashboard'

interface DashboardCommandCenterProps {
  priorities: KPI[]
  projection: ProjecaoRisco
  criticalNow: number
  onPriority: (priority: KPI) => void
  onProjection: (rows: OSRow[]) => void
}

const TONE_CLASSES: Record<string, string> = {
  red: 'border-red/25 bg-gradient-to-br from-red/[0.10] to-red/[0.025] hover:border-red/45',
  orange: 'border-orange/25 bg-gradient-to-br from-orange/[0.09] to-orange/[0.02] hover:border-orange/45',
  yellow: 'border-yellow/25 bg-gradient-to-br from-yellow/[0.08] to-yellow/[0.02] hover:border-yellow/45',
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
}: DashboardCommandCenterProps) {
  const activeCount = priorities.filter(priority => numericValue(priority.value) > 0).length
  const projectedTotal = projection.proj24h + projection.proj48h
  const orderedPriorities = priorities
    .map((priority, index) => ({ priority, index, count: numericValue(priority.value) }))
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || a.index - b.index)

  return (
    <section
      data-testid="dashboard-command-center"
      aria-labelledby="dashboard-priorities-title"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-bg/20 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-red/20 bg-red/[0.07] text-red">
              <Warning size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="dashboard-priorities-title" className="text-title font-bold text-text">
                Prioridades agora
              </h2>
              <p className="text-caption text-muted">Clique em um card para abrir as ordens</p>
            </div>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-surface/50 px-2 py-1 text-caption font-semibold text-secondary">
            {activeCount > 0 ? <Broadcast size={9} className="text-orange" aria-hidden="true" /> : <CheckCircle size={10} className="text-green" aria-hidden="true" />}
            {activeCount} {activeCount === 1 ? 'frente ativa' : 'frentes ativas'}
          </span>
        </header>

        <div className="grid flex-1 grid-cols-2 gap-2 p-2 sm:gap-3 sm:p-3 md:grid-cols-4">
          {orderedPriorities.map(({ priority, count }) => {
            const isActive = count > 0
            const toneClass = isActive
              ? (TONE_CLASSES[priority.accent] ?? 'border-border bg-bg/35 hover:border-primary/30')
              : 'border-border/70 bg-bg/20 opacity-60'
            const valueClass = isActive ? (VALUE_CLASSES[priority.accent] ?? 'text-text') : 'text-muted'

            return (
              <button
                key={priority.id}
                data-testid="priority-card"
                type="button"
                disabled={!isActive}
                onClick={() => onPriority(priority)}
                aria-label={isActive
                  ? `${priority.title}. ${priority.value}. ${priority.sub ?? ''}. Abrir ordens`
                  : `${priority.title}. Sem ocorrências`}
                className={`group relative flex min-h-[116px] w-full flex-col items-stretch justify-between overflow-hidden rounded-md border p-3 text-left
                            transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                            ${isActive ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${toneClass}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`text-[30px] font-black leading-none tracking-[-0.04em] tabular-nums ${valueClass}`}>
                    {priority.value}
                  </span>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${isActive ? 'border-current/20 bg-bg/25 ' + valueClass : 'border-border text-muted'}`}>
                    {isActive ? <WarningOctagon size={15} weight="fill" aria-hidden="true" /> : <CheckCircle size={15} aria-hidden="true" />}
                  </span>
                </span>
                <span className="mt-3 min-w-0">
                  <span className="block truncate text-body font-bold text-text">{priority.title}</span>
                  <span className="mt-0.5 block truncate text-caption text-muted">
                    {isActive ? (priority.sub ?? 'Requer atenção') : 'Sem ocorrências'}
                  </span>
                </span>
                {isActive && (
                  <span className="mt-3 inline-flex items-center gap-1 text-caption font-bold text-secondary transition-colors group-hover:text-text">
                    Ver ordens <ArrowUpRight size={11} aria-hidden="true" />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {projectedTotal > 0 && (
          <button
            type="button"
            onClick={() => onProjection(projection.amostra)}
            aria-label={`${projectedTotal} em risco. ${criticalNow} críticas agora, mais ${projection.proj24h} em 24 horas e ${projection.proj48h} em 48 horas. Ver OS`}
            className="group mx-2 mb-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-orange/25
                       bg-orange/[0.06] px-3 py-2 text-left transition-colors duration-200 hover:border-orange/45 sm:mx-3 sm:mb-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
          >
            <Warning size={13} className="flex-shrink-0 text-orange" aria-hidden="true" />
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
  )
}
