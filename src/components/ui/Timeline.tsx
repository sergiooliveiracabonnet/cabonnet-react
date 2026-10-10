import { cn } from '@/lib/utils'

export interface TimelineItem {
  id:          string | number
  /** Quem fez — aparece em destaque antes da descrição. */
  autor:       string
  descricao:   string
  /** Texto livre: "há 3d", "hoje 14:30", "10/10 08:12". */
  quando:      string
  /** Iniciais no avatar; sem isso usa a primeira letra do autor. */
  inicial?:    string
  /** Classe de fundo do avatar (token do tema, ex.: "bg-chart-1"). */
  cor?:        string
  /** Ponto vazado = em andamento; cheio = concluído (padrão). */
  emAndamento?: boolean
}

export interface TimelineProps {
  items:      TimelineItem[]
  title?:     string
  subtitle?:  string
  className?: string
}

const CORES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6']

/** Linha do tempo vertical de atividades (adaptado do onboarding-05 do shadcn). */
export function Timeline({ items, title, subtitle, className }: TimelineProps) {
  return (
    <div className={className}>
      {title && <h3 className="text-title font-semibold text-text">{title}</h3>}
      {subtitle && <p className="mt-1 text-caption text-muted">{subtitle}</p>}
      <ul className={cn('space-y-6 pb-2', (title || subtitle) && 'mt-6')}>
        {items.map((item, idx) => (
          <li className="relative flex gap-x-3" key={item.id}>
            <div
              className={cn(
                'absolute top-0 left-0 flex w-6 justify-center',
                idx === items.length - 1 ? 'h-6' : '-bottom-6',
              )}
            >
              <span aria-hidden className="w-px bg-border" />
            </div>
            <div className="flex items-start gap-x-2">
              <div className="flex items-center gap-x-2">
                <div className="relative flex size-6 flex-none items-center justify-center bg-card">
                  <div
                    className={cn(
                      'size-3 rounded-full border border-border ring-4 ring-card',
                      item.emAndamento ? 'bg-card' : 'bg-muted/40',
                    )}
                  />
                </div>
                <span
                  aria-hidden
                  className={cn(
                    item.cor ?? CORES[idx % CORES.length],
                    'inline-flex size-6 flex-none items-center justify-center rounded-full text-caption font-semibold text-white',
                  )}
                >
                  {item.inicial ?? item.autor.charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="mt-0.5 text-body font-medium text-text">
                {item.autor}
                <span className="font-normal text-muted"> {item.descricao}</span>
                <span className="font-normal text-muted/60"> &#8729; {item.quando}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Timeline
