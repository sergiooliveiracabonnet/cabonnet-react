import type { ReactNode, MouseEventHandler } from 'react'

interface CardProps {
  children:   ReactNode
  className?: string
  onClick?:   MouseEventHandler<HTMLDivElement>
  /** @deprecated removido no design system v2 — não tem efeito visual */
  tilt?:      boolean
}

export function Card({ children, className = '', onClick }: CardProps) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-card border border-white/[0.08] card-premium
                  ${interactive
                    ? 'cursor-pointer hover:bg-card-high hover:border-muted/30 hover:shadow-md active:scale-[.995]'
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
