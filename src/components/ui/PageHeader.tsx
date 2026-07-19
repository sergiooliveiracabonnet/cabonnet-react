import type { ComponentType, ReactNode } from 'react'

export interface PageHeaderProps {
  title:        string
  description?: string
  icon?:        ComponentType<{ size?: number; className?: string }>
  actions?:     ReactNode
  className?:   string
}

export function PageHeader({ title, description, icon: Icon, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className={`text-title font-semibold text-text ${Icon ? 'flex items-center gap-2' : ''}`}>
          {Icon && <Icon size={18} className="text-primary" />}
          {title}
        </h1>
        {description && <p className="text-label text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
