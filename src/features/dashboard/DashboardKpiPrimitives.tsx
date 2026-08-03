import type { ReactNode } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import type { IconComp } from './DashboardTypes'

export function SectionLabel({ icon: Icon, color, children }: {
  icon: IconComp; color: string; children: ReactNode
}) {
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

export function DashboardPanelHeader({ icon, color, children, meta, actionLabel }: {
  icon: IconComp
  color: string
  children: ReactNode
  meta?: ReactNode
  actionLabel?: string
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <SectionLabel icon={icon} color={color}>{children}</SectionLabel>
      </div>
      {(meta || actionLabel) && (
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          {meta && (
            <span className="min-w-0 truncate text-caption text-muted">
              {meta}
            </span>
          )}
          {actionLabel && (
            <span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-caption font-semibold text-primary">
              {actionLabel}
              <ArrowUpRight size={11} aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
