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
    <div className={`flex border-b border-white/[0.08] overflow-x-auto ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-label font-semibold
                      whitespace-nowrap border-b-2 transition-all duration-fast
                      ${active === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted hover:text-secondary'}`}
        >
          {tab.icon && <tab.icon size={12} />}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
