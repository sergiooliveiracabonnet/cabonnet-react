import type { ComponentType } from 'react'

interface Tab {
  id:     string
  label:  string
  icon?:  ComponentType<{ size?: number }>
}

interface TabBarProps {
  tabs:      Tab[]
  active:    string
  onChange:  (id: string) => void
  className?: string
}

export function TabBar({ tabs, active, onChange, className = '' }: TabBarProps) {
  return (
    <div role="tablist" className={`flex border-b border-border overflow-x-auto ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-label font-semibold
                      whitespace-nowrap border-b-2 transition-all duration-fast
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40
                      ${active === tab.id
                        ? 'border-orange text-text'
                        : 'border-transparent text-muted hover:text-secondary'}`}
        >
          {tab.icon && <tab.icon size={12} />}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
