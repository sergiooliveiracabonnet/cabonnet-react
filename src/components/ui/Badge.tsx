import type { ReactNode } from 'react'

const variants = {
  orange: 'badge-orange',
  blue:   'badge-blue',
  green:  'badge-green',
  yellow: 'badge-yellow',
  red:    'badge-red',
  // aposentadas — mantidas como apelido para não quebrar os call sites existentes
  cyan:   'badge-blue',
  purple: 'badge-blue',
  teal:   'badge-green',
  // fallback neutro para variantes desconhecidas (ex.: SituacaoVariant 'secondary')
  neutral: 'bg-surface-active text-secondary border-border',
} as const

type BadgeVariant = keyof typeof variants

interface BadgeProps {
  children:   ReactNode
  variant?:   BadgeVariant | string
  dot?:       boolean
  className?: string
}

export function Badge({ children, variant = 'cyan', dot = true, className = '' }: BadgeProps) {
  const cls = variants[variant as BadgeVariant] ?? variants.neutral
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border
                      text-caption font-semibold ${cls} ${className}`}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
      )}
      {children}
    </span>
  )
}
