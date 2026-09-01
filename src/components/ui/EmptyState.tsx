import type { ComponentType } from 'react'

export interface EmptyStateProps {
  icon?:        ComponentType<{ size?: number; className?: string }>
  title:        string
  description?: string
  action?:      { label: string; onClick: () => void }
  className?:   string
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mb-3">
          <Icon size={18} className="text-muted" />
        </div>
      )}
      <p className="text-body font-semibold text-text">{title}</p>
      {description && <p className="text-caption text-muted mt-1 max-w-xs leading-relaxed">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-caption font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5
                     hover:bg-primary/10 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
