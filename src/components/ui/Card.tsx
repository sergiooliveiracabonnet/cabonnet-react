import type { ReactNode, MouseEventHandler } from 'react'

interface CardProps {
  children:  ReactNode
  className?: string
  tilt?:      boolean
  onClick?:   MouseEventHandler<HTMLDivElement>
}

export function Card({ children, className = '', tilt = false, onClick }: CardProps) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-card border border-white/[0.08] card-premium
                  transition-all duration-normal
                  ${interactive
                    ? 'hover:border-primary/35 hover:shadow-accent cursor-pointer hover:-translate-y-0.5'
                    : 'hover:border-white/[0.14]'}
                  ${tilt ? 'tilt-card' : ''}
                  ${className}`}
    >
      {children}
    </div>
  )
}

interface SlotProps {
  children:  ReactNode
  className?: string
}

export function CardHeader({ children, className = '' }: SlotProps) {
  return <div className={`px-5 pt-5 pb-3 ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }: SlotProps) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>
}
