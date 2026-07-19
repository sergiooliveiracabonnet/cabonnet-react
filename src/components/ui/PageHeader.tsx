import type { ComponentType, ReactNode } from 'react'

export interface PageHeaderProps {
  title:             string
  titleExtra?:       ReactNode
  description?:      string
  descriptionExtra?: ReactNode
  icon?:             ComponentType<{ size?: number; className?: string }>
  actions?:          ReactNode
  className?:        string
}

export function PageHeader({ title, titleExtra, description, descriptionExtra, icon: Icon, actions, className = '' }: PageHeaderProps) {
  const hasTitleRow = !!Icon || !!titleExtra
  const hasDescRow  = !!description && !!descriptionExtra

  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className={`text-title font-semibold text-text ${hasTitleRow ? 'flex items-center gap-2' : ''}`}>
          {Icon && <Icon size={18} className="text-primary" />}
          {title}
          {titleExtra}
        </h1>
        {description && (
          hasDescRow ? (
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-label text-muted">{description}</p>
              {descriptionExtra}
            </div>
          ) : (
            <p className="text-label text-muted mt-0.5">{description}</p>
          )
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
