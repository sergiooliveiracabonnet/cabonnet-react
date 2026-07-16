import type { ReactNode, MouseEventHandler, KeyboardEvent } from 'react'

interface CardProps {
  children:   ReactNode
  className?: string
  onClick?:   MouseEventHandler<HTMLDivElement>
}

export function Card({ children, className = '', onClick }: CardProps) {
  const interactive = !!onClick
  const a11y = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            ;(e.currentTarget as HTMLDivElement).click()
          }
        },
      }
    : {}
  return (
    <div
      onClick={onClick}
      {...a11y}
      className={`rounded-xl bg-card border border-white/[0.08] card-premium
                  ${interactive
                    ? `cursor-pointer hover:bg-card-high hover:border-muted/30 hover:shadow-md active:scale-[.995]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`
                    : ''}
                  ${className}`}
    >
      {children}
    </div>
  )
}

interface SlotProps {
  children:   ReactNode
  className?: string
}

export function CardHeader({ children, className = '' }: SlotProps) {
  return <div className={`px-5 pt-5 pb-3 ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }: SlotProps) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>
}
