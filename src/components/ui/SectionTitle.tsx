import type { ReactNode, ComponentType } from 'react'

interface SectionTitleProps {
  children:   ReactNode
  icon?:      ComponentType<{ size?: number; className?: string }>
  className?: string
}

export function SectionTitle({ children, icon: Icon, className = '' }: SectionTitleProps) {
  return (
    <h2 className={`flex items-center gap-2 font-headline font-semibold text-[11px]
                    uppercase tracking-[0.06em] text-muted
                    mt-6 mb-3 ${className}`}>
      {Icon && <Icon size={12} className="text-muted/70" />}
      {children}
    </h2>
  )
}
