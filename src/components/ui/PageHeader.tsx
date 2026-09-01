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
    <div data-ui="page-header" className={`page-header flex items-end justify-between gap-5 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className={`text-title text-[20px] sm:text-[22px] leading-tight tracking-[-0.025em] font-semibold text-text ${hasTitleRow ? 'flex items-center gap-2' : ''}`}>
          {Icon && <span className="page-header-icon"><Icon size={17} /></span>}
          {title}
          {titleExtra}
        </h1>
        {description && (
          hasDescRow ? (
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-body text-secondary">{description}</p>
              {descriptionExtra}
            </div>
          ) : (
            <p className="text-body text-secondary mt-1">{description}</p>
          )
        )}
      </div>
      {actions && (
        <div data-ui="page-header-actions" className="flex w-full items-center gap-2 sm:w-auto sm:flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
