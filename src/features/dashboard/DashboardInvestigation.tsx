import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Binoculars, ChartLineUp, MapTrifold, ShieldCheck } from '@phosphor-icons/react'

type ViewId = 'operation' | 'territory' | 'quality'

interface DashboardInvestigationProps {
  operation: ReactNode
  territory: ReactNode
  quality: ReactNode
}

const VIEWS = [
  { id: 'operation', label: 'Operação', description: 'Capacidade e ritmo das equipes', icon: ChartLineUp },
  { id: 'territory', label: 'Território e demanda', description: 'Cidades e motivos da fila', icon: MapTrifold },
  { id: 'quality', label: 'Qualidade e tendência', description: 'Metas, reincidência e fornecedores', icon: ShieldCheck },
] as const

export function DashboardInvestigation({ operation, territory, quality }: DashboardInvestigationProps) {
  const [active, setActive] = useState<ViewId>('operation')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const content: Record<ViewId, ReactNode> = { operation, territory, quality }

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? VIEWS.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length
    setActive(VIEWS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <section aria-labelledby="dashboard-investigation-title" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-purple/20 bg-purple/[0.08] text-purple">
          <Binoculars size={16} aria-hidden="true" />
        </span>
        <div>
          <p className="text-caption font-bold uppercase tracking-[0.09em] text-purple">Nível 3</p>
          <h2 id="dashboard-investigation-title" className="text-title font-bold text-text">Investigar causas e tendências</h2>
          <p className="mt-0.5 text-caption text-muted">Abra apenas a perspectiva necessária para explicar o resultado.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div role="tablist" aria-label="Perspectivas de investigação" className="grid grid-cols-1 gap-1 border-b border-border bg-bg/25 p-1.5 sm:grid-cols-3">
          {VIEWS.map((view, index) => {
            const selected = active === view.id
            const Icon = view.icon
            return (
              <button
                key={view.id}
                ref={node => { tabRefs.current[index] = node }}
                id={`dashboard-tab-${view.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`dashboard-panel-${view.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(view.id)}
                onKeyDown={event => selectFromKeyboard(event, index)}
                className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors duration-200
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                            ${selected ? 'border border-primary/25 bg-primary/10 text-text shadow-xs' : 'border border-transparent text-muted hover:bg-white/[0.04] hover:text-secondary'}`}
              >
                <Icon size={16} className={selected ? 'text-primary' : 'text-muted'} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-label font-bold">{view.label}</span>
                  <span className="hidden truncate text-caption font-normal text-muted lg:block">{view.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div
          id={`dashboard-panel-${active}`}
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${active}`}
          tabIndex={0}
          className="p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          {content[active]}
        </div>
      </div>
    </section>
  )
}
