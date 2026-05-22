import type { ReactNode } from 'react'

const variants = {
  green:  'badge-green',
  red:    'badge-red',
  yellow: 'badge-yellow',
  orange: 'badge-orange',
  purple: 'badge-purple',
  cyan:   'badge-cyan',
  teal:   'badge-teal',
} as const

type BadgeVariant = keyof typeof variants

interface BadgeProps {
  children:  ReactNode
  variant?:  BadgeVariant | string
  dot?:      boolean
  className?: string
}

export function Badge({ children, variant = 'cyan', dot = true, className = '' }: BadgeProps) {
  const cls = variants[variant as BadgeVariant] ?? ''
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-pill
                      text-[10.5px] font-bold tracking-wide ${cls} ${className}`}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75 flex-shrink-0" />
      )}
      {children}
    </span>
  )
}
