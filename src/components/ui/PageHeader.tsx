import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title:        string
  description?: string
  actions?:     ReactNode
  className?:   string
}

export function PageHeader({ title, description, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className="text-title text-text">{title}</h1>
        {description && <p className="text-label text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
