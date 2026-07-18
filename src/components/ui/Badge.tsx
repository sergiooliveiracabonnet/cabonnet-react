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
  children:   ReactNode
  variant?:   BadgeVariant | string
  dot?:       boolean
  className?: string
}

export function Badge({ children, variant = 'cyan', dot = true, className = '' }: BadgeProps) {
  const cls = variants[variant as BadgeVariant] ?? ''
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                      text-caption font-semibold ${cls} ${className}`}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
      )}
      {children}
    </span>
  )
}
