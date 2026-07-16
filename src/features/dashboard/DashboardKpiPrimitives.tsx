import type { ReactNode } from 'react'
import type { IconComp } from './DashboardTypes'

export function SectionLabel({ icon: Icon, color, children }: {
  icon: IconComp; color: string; children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} className="flex-shrink-0 text-muted" />
      <span className="text-caption font-semibold uppercase tracking-[0.09em] text-secondary">
        {children}
      </span>
    </div>
  )
}
