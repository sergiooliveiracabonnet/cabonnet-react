import type { ComponentType, ReactNode } from 'react'

export interface SectionLabelProps {
  icon: ComponentType<{ size?: number; className?: string }>
  color: string
  children: ReactNode
}

export function SectionLabel({ icon: Icon, color, children }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} className="flex-shrink-0 text-muted" />
      <h2 className="text-caption font-semibold uppercase tracking-[0.09em] text-secondary m-0">
        {children}
      </h2>
    </div>
  )
}
